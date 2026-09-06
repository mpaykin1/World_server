'use strict';
// MCP_INTENT_ROUTER
//
// Deterministic (non-LLM) capability classifier + minimal tool allowlist.
// Root cause this exists: qwen3:1.7b, given 15 semantically-reranked but still
// mostly-irrelevant tools for a plain "read this file" task, picked the built-in
// document-summarizer instead of the correct MCP read_file tool (see
// data/error-prevention-registry.json#anythingllm-small-model-tool-selection-miss).
// Reranking alone is probabilistic (embedding similarity); this router is a hard,
// pre-LLM filter over the tools OUR MCP server advertises, so a small model is
// never asked to choose among more options than the task actually needs.
//
// Classes we can back with a real tool provider today: filesystem-read,
// filesystem-write, filesystem-search. git/test/doc are recognized (so callers can
// branch on them) but have no MCP tool provider wired up yet - they fall back to
// [] (no filesystem tools granted) rather than silently defaulting to a broader
// filesystem allowlist for a request that was never actually about files.

const PROFILES = {
  'filesystem-read': ['list_directory', 'search_files', 'read_file', 'read_text_file'],
  'filesystem-write': ['list_directory', 'search_files', 'read_file', 'read_text_file', 'edit_file', 'write_file'],
  'filesystem-search': ['list_directory', 'search_files', 'directory_tree'],
  git: [],
  test: [],
  doc: [],
  unknown: ['list_directory', 'search_files', 'read_file', 'read_text_file'],
};

// The single most specific action tool per class - used when a retry needs to name
// ONE tool rather than a set (naming a set didn't stop the reranker from still
// ranking document-summarizer first in live testing; naming exactly one tool is the
// next escalation).
const PRIMARY_TOOL = {
  'filesystem-read': 'read_text_file',
  'filesystem-write': 'edit_file',
  'filesystem-search': 'search_files',
  unknown: 'read_text_file',
};

function primaryToolFor(capabilityClass) {
  return PRIMARY_TOOL[capabilityClass] || null;
}

// Plain \b is a \w-based (ASCII-only) boundary in JS regex - both sides of a
// Cyrillic word count as "non-word" to it, so /\bнайди\b/ silently never matches
// real Cyrillic input. Cyrillic rules below use explicit stems (with \w* to catch
// inflection) and no \b instead of relying on JS's ASCII-only word boundary.
const RULES = [
  { class: 'git', ascii: /\b(?:git|commit|branch|merge|checkout|rebase|pull request|\bpr\b)\b/i, cyrillic: null },
  { class: 'test', ascii: /\brun[a-z]*\s+(?:the\s+)?tests?\b|\bnpm (?:run )?test\b|\bpytest\b|\btest suite\b/i, cyrillic: /запусти(?:те)?\s*тест|прогони(?:те)?\s*тест/iu },
  { class: 'doc', ascii: /\b(?:documentation|readme|write docs)\b/i, cyrillic: /документаци\w*/iu },
  { class: 'filesystem-write', ascii: /\b(?:edit|modify|update|patch|overwrite|delete|rename)\b.{0,40}\bfile\b|\b(?:write_file|edit_file)\b/i, cyrillic: /(?:исправ\w*|измени\w*|правк\w*|удали\w*|перемести\w*|запиши\w*|создай\w*).{0,40}файл\w*/iu },
  { class: 'filesystem-read', ascii: /\b(?:read|find|show|content|contents|tell me|what'?s in)\b/i, cyrillic: /прочита\w*|найди\w*|содержим\w*|покажи\w*|значени\w*/iu },
  { class: 'filesystem-search', ascii: /\b(?:search|locate|list files|where is)\b/i, cyrillic: /список\s*файлов|где\s*находится/iu },
];

function classifyIntent(taskText) {
  // Safety prohibitions are not requested actions. Keep contrast clauses so
  // "do not push, but run git status" still routes to the Git capability.
  const t = String(taskText || '').split(/\bbut\b|(?:^|\s)но\s/iu)
    .map(clause => clause.replace(/\b(?:do not|don't|never|must not)\b.*?(?=[.!?](?:\s|$)|[;\n]|$)/gi, '')
      .replace(/(?:^|\s)(?:никогда\s+)?не\s+.*?(?=[.!?](?:\s|$)|[;\n]|$)/giu, ' ')).join(' ');
  if (/\bgit\s+(?:status|diff|log|show|branch|commit|push|pull|merge|checkout|rebase)\b/i.test(t)) return 'git';
  if (/\bread[- ]only\b/i.test(t) && /\b(?:read|inspect|review)\b/i.test(t)) return 'filesystem-read';
  for (const rule of RULES) {
    if (rule.ascii.test(t)) return rule.class;
    if (rule.cyrillic && rule.cyrillic.test(t)) return rule.class;
  }
  return 'unknown';
}

function allowlistFor(capabilityClass) {
  return PROFILES[capabilityClass] || PROFILES.unknown;
}

function route(taskText) {
  const capabilityClass = classifyIntent(taskText);
  return { capabilityClass, allowedTools: allowlistFor(capabilityClass) };
}

module.exports = { classifyIntent, allowlistFor, route, PROFILES, primaryToolFor };
