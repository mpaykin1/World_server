'use strict';
/**
 * Minimal .dockerignore pattern matcher — just enough to verify that
 * runtime-required paths are never accidentally excluded from a Docker
 * build context. Not a full Docker ignore-pattern implementation: supports
 * exact filenames, `dir/` prefixes, and simple `*.ext`-style single-token
 * globs, plus `!pattern` negation processed in file order (last matching
 * rule wins), matching Docker/git's own documented semantics for that
 * subset. Extend if a real .dockerignore in this repo needs a pattern shape
 * this doesn't cover yet — don't silently mis-parse it.
 */

function patternToRule(pattern) {
  const negate = pattern.startsWith('!');
  const raw = negate ? pattern.slice(1) : pattern;
  const dirOnly = raw.endsWith('/');
  const body = dirOnly ? raw.slice(0, -1) : raw;

  let test;
  if (body.includes('*')) {
    const escaped = body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`(^|/)${escaped}$`);
    test = (relPath) => re.test(relPath);
  } else {
    test = (relPath) => relPath === body || relPath.startsWith(`${body}/`);
  }
  return { negate, test };
}

function parseDockerignore(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(patternToRule);
}

function isIgnored(rules, relPath) {
  const posixPath = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  let ignored = false;
  for (const rule of rules) {
    if (rule.test(posixPath)) ignored = !rule.negate;
  }
  return ignored;
}

/** Returns the subset of requiredPaths that the given .dockerignore content would exclude. */
function findIgnoredRequiredPaths(dockerignoreContent, requiredPaths) {
  const rules = parseDockerignore(dockerignoreContent);
  return (requiredPaths || []).filter((p) => isIgnored(rules, p));
}

module.exports = { parseDockerignore, isIgnored, findIgnoredRequiredPaths };
