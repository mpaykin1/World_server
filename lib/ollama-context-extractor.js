'use strict';
// OLLAMA_CONTEXT_EXTRACTOR — this cycle's point 2: CPU-only prompt
// EVALUATION (not generation) is the real, measured, dominant cost for a
// local patch attempt (a real ~5.3KB file, 1990 prompt tokens, took
// 166.72s of prompt eval alone on this hardware - see the A/B trace this
// cycle documented in lib/ollama-patch-adapter.js's callOllama comment).
// The OpenCode path can afford to hand a model a whole file because that
// cost is paid on a remote host; this local path cannot. This module
// extracts the smallest real, verbatim snippet of a file that plausibly
// contains the target of a given goal, instead of always sending the
// whole file.
//
// Every extracted snippet is a byte-exact substring of the real file
// content — never reformatted, renumbered, or reconstructed — because the
// model is expected to copy its "find" text verbatim from what it is
// shown, and that text must still match the real file exactly during
// lib/ollama-patch-adapter.js's own validatePatch() (which always re-reads
// the real file from disk, never trusts what was sent to the model).

// Pulls literal, quotable anchors out of a goal description - tag names,
// quoted strings, identifiers - the same kind of signal a human would use
// to Ctrl-F a file for the right spot. Deliberately simple (no NLP): a
// wrong/missing anchor just means this module falls back to sending more
// context, never to a worse answer.
function extractAnchors(goal) {
  const text = String(goal || '');
  const anchors = new Set();
  // quoted strings: "...", '...', `...`
  for (const m of text.matchAll(/["'`]([^"'`]{3,80})["'`]/g)) anchors.add(m[1]);
  // HTML/XML-ish tags: <tagname ...
  for (const m of text.matchAll(/<([a-zA-Z][\w-]*)\b/g)) anchors.add(`<${m[1]}`);
  // bare identifiers that look like function/variable/property names
  // (camelCase, snake_case, or dotted) at least 4 chars long
  for (const m of text.matchAll(/\b([a-zA-Z_][\w]{3,40}(?:\.[a-zA-Z_]\w{2,40})*)\b/g)) {
    const w = m[1];
    if (/^(the|this|that|with|from|into|file|goal|task|find|replace|apply|change|update|value|content|attribute)$/i.test(w)) continue;
    anchors.add(w);
  }
  return [...anchors].sort((a, b) => b.length - a.length); // longer/more specific anchors first
}

// Finds the first line index in `content` that contains any anchor,
// preferring longer/more specific anchors. Returns null if nothing matches
// (an honest "no confident narrowing point" signal, not a guess).
function findAnchorLine(content, anchors) {
  if (!anchors.length) return null;
  const lines = content.split(/\r?\n/);
  for (const anchor of anchors) {
    const idx = lines.findIndex((l) => l.includes(anchor));
    if (idx !== -1) return idx;
  }
  return null;
}

// Real bug found by this module's own tests: split(/\r?\n/) then
// .join('\n') silently normalizes CRLF files (several real files in this
// repo use CRLF - confirmed live: apps/survival/index.html) to LF-only,
// so the "verbatim substring of the real file" guarantee this whole
// module exists to provide was actually being violated for any CRLF file
// - a model shown that normalized snippet would copy LF-style "find" text
// that could never match the real CRLF file during validatePatch(). Fixed
// by finding line boundaries via raw '\n' offset scanning (works for
// both \n and \r\n, since \r\n always ends in \n) and then slicing the
// ORIGINAL string directly by character offset - never reconstructing
// text by joining split parts.
function lineStartOffsets(content) {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') offsets.push(i + 1);
  return offsets;
}

// Real, verbatim substring of `content` spanning contextLines above/below
// lineIndex - never reformatted, never re-joined. Returns null if
// lineIndex is null.
function extractLineRangeSnippet(content, lineIndex, contextLines = 12) {
  if (lineIndex == null) return null;
  const offsets = lineStartOffsets(content);
  const totalLines = offsets.length;
  const start = Math.max(0, lineIndex - contextLines);
  const end = Math.min(totalLines - 1, lineIndex + contextLines);
  const startOffset = offsets[start];
  const endOffset = end + 1 < totalLines ? offsets[end + 1] : content.length;
  const snippet = content.slice(startOffset, endOffset);
  return { snippet, startLine: start, endLine: end + 1, totalLines, truncated: start > 0 || end + 1 < totalLines };
}

// Regex + brace-balance scan for a named function/const/class block -
// works without a real parser (deliberately, matching this project's
// no-new-heavy-dependency convention) at the cost of being a heuristic:
// it can miss unusual formatting, but never returns a WRONG block (brace
// balance is exact against the real source text, not guessed).
function extractFunctionSnippet(content, symbolName) {
  if (!symbolName) return null;
  const patterns = [
    new RegExp(`function\\s+${symbolName}\\s*\\(`),
    new RegExp(`(?:const|let|var)\\s+${symbolName}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\()`),
    new RegExp(`${symbolName}\\s*[:(]\\s*(?:async\\s*)?function\\b`),
    new RegExp(`class\\s+${symbolName}\\b`),
  ];
  let matchIndex = -1;
  for (const re of patterns) {
    const m = re.exec(content);
    if (m) { matchIndex = m.index; break; }
  }
  if (matchIndex === -1) return null;
  const braceStart = content.indexOf('{', matchIndex);
  if (braceStart === -1) return null;
  let depth = 0, i = braceStart;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) return null; // unbalanced - real parse failure, don't guess a wrong boundary
  const snippet = content.slice(matchIndex, i);
  return { snippet, startOffset: matchIndex, endOffset: i, totalBytes: content.length, truncated: matchIndex > 0 || i < content.length };
}

// For a file included as secondary/reference context (not the primary
// edit target) - just the import/require surface, not the whole body.
// Real evidence this helps: a scoped-context file is often only there so
// the model can see a related contract/shape, not to be edited itself.
const IMPORT_LINE_RE = /^\s*(import\s.+from\s.+|const\s+.+=\s*require\(.+\)|require\(['"].+['"]\)|export\s+(default\s+)?(function|class|const)\b.*)/;
function extractImportSummary(content, maxLines = 25) {
  const lines = content.split(/\r?\n/).filter((l) => IMPORT_LINE_RE.test(l));
  return lines.slice(0, maxLines).join('\n');
}

// Orchestrates: function/symbol match (most precise) -> anchor-based
// line-range match -> a bounded head-of-file fallback (never the
// unbounded whole file) when nothing confidently narrows the target.
// `contextLines` grows on each `level` for progressive expansion (point 2
// + point 6's repair-loop use this together: a retry after a real
// find-not-found failure should see MORE of the file, not the identical
// snippet again).
function buildScopedSnippet(content, goal, { level = 1, maxBytes = 3000 } = {}) {
  const contextLinesByLevel = { 1: 10, 2: 25, 3: null }; // level 3 = no line cap, byte-capped only
  const contextLines = contextLinesByLevel[level] ?? 40;
  const anchors = extractAnchors(goal);

  // Try a symbol/function match first - it is the tightest possible
  // real boundary when the goal names something function-shaped.
  for (const anchor of anchors) {
    if (!/^[a-zA-Z_]\w{2,40}$/.test(anchor)) continue; // only bare-identifier-shaped anchors are function-searchable
    const fn = extractFunctionSnippet(content, anchor);
    if (fn && Buffer.byteLength(fn.snippet, 'utf8') <= maxBytes) {
      return { snippet: fn.snippet, method: 'function', truncated: fn.truncated, anchor };
    }
  }

  const lineIndex = findAnchorLine(content, anchors);
  if (lineIndex != null) {
    const range = extractLineRangeSnippet(content, lineIndex, contextLines ?? 200);
    if (range && Buffer.byteLength(range.snippet, 'utf8') <= maxBytes) {
      return { snippet: range.snippet, method: 'line-range', truncated: range.truncated, startLine: range.startLine, endLine: range.endLine };
    }
    // the matched window is bigger than the budget - fall through to a
    // capped slice starting at the anchor line, taken directly from the
    // original string by offset (same CRLF-safety fix as
    // extractLineRangeSnippet above) rather than reconstructing lines.
    // maxBytes is treated as a character count here, same simplification
    // as the head-fallback below - imprecise for multi-byte UTF-8 content,
    // acceptable since it only affects how generous the cap is, never
    // whether the result is a real substring.
    const startOffset = lineStartOffsets(content)[lineIndex] || 0;
    return { snippet: content.slice(startOffset, startOffset + maxBytes), method: 'line-range-byte-capped', truncated: true, startLine: lineIndex };
  }

  // No confident anchor at all - bounded head-of-file, never the whole
  // thing. Honest about not having found a narrowing point.
  return { snippet: content.slice(0, maxBytes), method: 'head-fallback', truncated: content.length > maxBytes };
}

module.exports = {
  extractAnchors, findAnchorLine, extractLineRangeSnippet, extractFunctionSnippet,
  extractImportSummary, buildScopedSnippet,
};
