'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const extractor = require('../lib/ollama-context-extractor');

test('extractAnchors: pulls quoted strings, tag names, and identifiers from a real goal', () => {
  const anchors = extractor.extractAnchors('Add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.');
  assert.ok(anchors.includes('<meta'));
  assert.ok(anchors.includes('viewport'));
});

test('extractAnchors: filters common filler words that would match almost anywhere', () => {
  const anchors = extractor.extractAnchors('Update the file content with the change from the task');
  assert.ok(!anchors.includes('content'));
  assert.ok(!anchors.includes('change'));
});

test('findAnchorLine: locates the real line containing an anchor', () => {
  const content = 'line0\nline1\n<meta name="viewport" content="x">\nline3';
  const idx = extractor.findAnchorLine(content, ['<meta']);
  assert.equal(idx, 2);
});

test('findAnchorLine: returns null (honest, not a guess) when no anchor matches', () => {
  const content = 'line0\nline1\nline2';
  assert.equal(extractor.findAnchorLine(content, ['nonexistent-anchor']), null);
});

test('extractLineRangeSnippet: real, verbatim substring around the target line, never reformatted', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line${i}`);
  const content = lines.join('\n');
  const r = extractor.extractLineRangeSnippet(content, 15, 3);
  assert.ok(r.snippet.includes('line15'));
  assert.equal(r.startLine, 12);
  assert.equal(r.endLine, 19);
  // every line in the snippet must be an exact, real line from content -
  // never reconstructed/renumbered, since the model's "find" text must
  // still match the real file verbatim.
  for (const line of r.snippet.split('\n')) assert.ok(content.includes(line));
});

test('extractLineRangeSnippet: null lineIndex is a clean no-op, not a crash', () => {
  assert.equal(extractor.extractLineRangeSnippet('a\nb\nc', null), null);
});

test('extractFunctionSnippet: finds a real function declaration with balanced braces', () => {
  const content = `const x = 1;\nfunction targetFn(a, b) {\n  if (a) {\n    return b;\n  }\n  return null;\n}\nconst y = 2;`;
  const r = extractor.extractFunctionSnippet(content, 'targetFn');
  assert.ok(r);
  assert.ok(r.snippet.startsWith('function targetFn'));
  assert.ok(r.snippet.trim().endsWith('}'));
  assert.ok(!r.snippet.includes('const y = 2'));
});

test('extractFunctionSnippet: finds a const arrow-function declaration', () => {
  const content = `function other(){}\nconst myHandler = (req, res) => {\n  res.send('ok');\n};\n`;
  const r = extractor.extractFunctionSnippet(content, 'myHandler');
  assert.ok(r);
  assert.ok(r.snippet.includes('myHandler'));
});

test('extractFunctionSnippet: returns null (never a wrong boundary) when the symbol is not found', () => {
  const content = 'function a(){}\nfunction b(){}';
  assert.equal(extractor.extractFunctionSnippet(content, 'doesNotExist'), null);
});

test('extractImportSummary: pulls only import/require lines, not the whole file', () => {
  const content = `import fs from 'fs';\nconst path = require('path');\n\nfunction main(){\n  console.log('a lot of unrelated body content here');\n}\n`;
  const summary = extractor.extractImportSummary(content);
  assert.ok(summary.includes("import fs from 'fs'"));
  assert.ok(summary.includes("require('path')"));
  assert.ok(!summary.includes('unrelated body content'));
});

test('buildScopedSnippet: real HTML file, real goal - extracts a small window around the real target, not the whole file', () => {
  const filler = Array.from({ length: 100 }, (_, i) => `<!-- filler line ${i} -->`).join('\n');
  const content = `${filler}\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${filler}`;
  const goal = 'Add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.';
  const result = extractor.buildScopedSnippet(content, goal, { level: 1, maxBytes: 3000 });
  assert.ok(result.snippet.includes('name="viewport"'));
  assert.ok(result.snippet.length < content.length, 'snippet must be meaningfully smaller than the full file');
  assert.equal(result.truncated, true);
});

test('buildScopedSnippet: every returned snippet is a real, verbatim substring of the original content - never reconstructed', () => {
  const content = 'const a = 1;\nfunction realTarget(){\n  return a + 1;\n}\nconst b = 2;\n';
  const goal = 'Fix a bug inside realTarget';
  const result = extractor.buildScopedSnippet(content, goal, { level: 1, maxBytes: 3000 });
  assert.ok(content.includes(result.snippet), 'the snippet must be an exact substring of the real file');
});

test('buildScopedSnippet: progressive expansion - a higher level returns a larger (or equal) window than level 1', () => {
  const lines = Array.from({ length: 200 }, (_, i) => (i === 100 ? '<meta name="viewport" content="x">' : `line ${i}`));
  const content = lines.join('\n');
  const goal = 'Update the <meta name="viewport"> tag';
  const level1 = extractor.buildScopedSnippet(content, goal, { level: 1, maxBytes: 3000 });
  const level2 = extractor.buildScopedSnippet(content, goal, { level: 2, maxBytes: 3000 });
  assert.ok(level2.snippet.length >= level1.snippet.length, 'a retry must see at least as much context as the first attempt');
});

test('buildScopedSnippet: falls back to a bounded head-of-file (never the unbounded whole file) when no anchor matches at all', () => {
  const content = 'x'.repeat(10000);
  const result = extractor.buildScopedSnippet(content, 'a goal with no matching anchors at all', { level: 1, maxBytes: 500 });
  assert.equal(result.method, 'head-fallback');
  assert.ok(result.snippet.length <= 500);
});

// Regression test for a real bug this module's own tests caught this
// cycle: split(/\r?\n/) + .join('\n') silently normalizes CRLF files to
// LF-only, breaking the "verbatim substring of the real file" guarantee -
// a model shown that normalized snippet would copy LF-style "find" text
// that could never match the real CRLF file during validatePatch().
test('extractLineRangeSnippet: preserves real CRLF line endings exactly - never normalizes to LF', () => {
  const content = 'line0\r\nline1\r\n<meta name="viewport">\r\nline3\r\nline4';
  const r = extractor.extractLineRangeSnippet(content, 2, 1);
  assert.ok(content.includes(r.snippet), 'snippet must be an exact substring of the real CRLF content');
  assert.ok(r.snippet.includes('\r\n'), 'a real CRLF file\'s snippet must still contain \\r\\n, not just \\n');
});

test('buildScopedSnippet: byte-capped fallback path also preserves real CRLF line endings', () => {
  const filler = 'x'.repeat(50);
  const content = `${filler}\r\n<meta name="viewport">\r\n${filler.repeat(200)}`;
  const goal = 'Update the <meta name="viewport"> tag';
  const result = extractor.buildScopedSnippet(content, goal, { level: 1, maxBytes: 30 });
  assert.equal(result.method, 'line-range-byte-capped');
  assert.ok(content.includes(result.snippet), 'snippet must be an exact substring even in the byte-capped fallback path');
});

test('buildScopedSnippet: real reduction on a real project file - meaningfully smaller than the full content for a small-block edit', () => {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', 'apps', 'survival', 'index.html');
  const content = fs.readFileSync(filePath, 'utf8');
  const goal = 'Add viewport-fit=cover to the content attribute of the existing <meta name="viewport"> tag.';
  const result = extractor.buildScopedSnippet(content, goal, { level: 1, maxBytes: 1200 });
  assert.ok(result.snippet.includes('viewport'));
  assert.ok(content.includes(result.snippet), 'must be a real verbatim substring');
  const reductionFactor = content.length / result.snippet.length;
  assert.ok(reductionFactor >= 2, `expected at least a 2x reduction, got ${reductionFactor.toFixed(1)}x (full=${content.length}b, snippet=${result.snippet.length}b)`);
});
