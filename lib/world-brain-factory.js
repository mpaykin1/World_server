'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = path.join(__dirname, '..', 'data', 'world-brain-factory-policy.json');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (fallback !== null && error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bauthorization\s*[:=]\s*(?:bearer\s+)?[A-Za-z0-9._~+/=-]{12,}/i,
  /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"',]{8,}/i,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
];

function containsSecretLikeText(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeText(value, maxChars) {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('; ') : String(value);
  const normalized = text.replace(/\0/g, '').trim();
  return normalized.slice(0, maxChars);
}

function makeExample({ id, source, tags = [], system, user, assistant }, policy) {
  const maxChars = policy.privacy?.maxExampleChars || 12000;
  const clean = {
    id,
    source,
    tags,
    messages: [
      { role: 'system', content: sanitizeText(system, maxChars) },
      { role: 'user', content: sanitizeText(user, maxChars) },
      { role: 'assistant', content: sanitizeText(assistant, maxChars) }
    ]
  };
  clean.contentHash = sha256(clean.messages);
  if (containsSecretLikeText(clean)) return null;
  if (!clean.messages[1].content || !clean.messages[2].content) return null;
  return clean;
}

function collectProtectedErrors(root, policy) {
  const file = path.join(root, 'data', 'error-prevention-registry.json');
  const data = readJson(file, { knownErrors: [] });
  const accepted = new Set(['protected']);
  const examples = [];
  for (const item of data.knownErrors || []) {
    if (!accepted.has(item.status)) continue;
    const protection = Array.isArray(item.protection) ? item.protection : [];
    const example = makeExample({
      id: `error:${item.id}`,
      source: 'data/error-prevention-registry.json',
      tags: ['error-prevention', item.category || 'unknown', item.severity || 'unknown'],
      system: 'You are a World_server specialist. Preserve verified fixes, do not invent evidence, and turn confirmed failures into durable regression protection.',
      user: `Prevent or fix this verified World_server failure.\nSymptom: ${item.symptom || item.id}\nCategory: ${item.category || 'unknown'}\nSeverity: ${item.severity || 'unknown'}`,
      assistant: `Verified root cause: ${item.rootCause || 'See protected registry entry.'}\nRequired protection: ${protection.join('; ') || 'Keep the protected regression rule active.'}\nDo not weaken existing Golden Standard or security gates.`
    }, policy);
    if (example) examples.push(example);
  }
  return examples;
}

function collectGoldenComponents(root, policy) {
  const file = path.join(root, 'data', 'golden-components.json');
  const data = readJson(file, { components: {} });
  const examples = [];
  for (const [name, item] of Object.entries(data.components || {})) {
    if (item.status !== 'golden') continue;
    const rules = Array.isArray(item.rules) ? item.rules : (item.rule ? [item.rule] : []);
    const example = makeExample({
      id: `golden:${name}`,
      source: 'data/golden-components.json',
      tags: ['golden-component', name],
      system: 'You are a World_server specialist. Golden Components are canonical reusable solutions. Preserve them exactly unless a verified migration explicitly replaces them.',
      user: `How must the World_server ${name} capability be implemented or preserved?`,
      assistant: `Canonical source: ${item.canonical || 'registered canonical component'}.\nRequired rules: ${rules.join('; ') || 'Preserve the registered Golden behavior.'}`
    }, policy);
    if (example) examples.push(example);
  }
  return examples;
}

function collectPromotedKnowledge(root, policy) {
  const file = path.join(root, 'data', 'collective-brain', 'knowledge-ledger.json');
  const data = readJson(file, { entries: [] });
  const accepted = new Set(['verified', 'promoted', 'approved']);
  const examples = [];
  for (const item of data.entries || []) {
    const status = String(item.status || item.state || item.verificationStatus || '').toLowerCase();
    if (!accepted.has(status)) continue;
    const question = item.question || item.problem || item.task || item.title;
    const answer = item.answer || item.solution || item.lesson || item.content;
    if (!question || !answer) continue;
    const id = item.id || sha256({ question, answer }).slice(0, 16);
    const example = makeExample({
      id: `knowledge:${id}`,
      source: 'data/collective-brain/knowledge-ledger.json',
      tags: ['collective-brain', status],
      system: 'You are a World_server specialist. Use only promoted or verified Collective Brain knowledge and keep provenance explicit.',
      user: question,
      assistant: answer
    }, policy);
    if (example) examples.push(example);
  }
  return examples;
}

function collectPromotedAutofix(root, policy) {
  const file = path.join(root, 'data', 'autofix-learning.json');
  const data = readJson(file, { promoted: [] });
  const examples = [];
  for (const item of data.promoted || []) {
    if (!item || typeof item !== 'object') continue;
    const question = item.problem || item.symptom || item.task || item.id;
    const answer = item.fix || item.solution || item.transformation || item.recipe;
    if (!question || !answer) continue;
    const example = makeExample({
      id: `autofix:${item.id || sha256(item).slice(0, 16)}`,
      source: 'data/autofix-learning.json',
      tags: ['autofix', 'promoted'],
      system: 'You are a World_server specialist. Promoted AutoFix recipes are deterministic verified transformations; never generalize them beyond their validated scope.',
      user: String(question),
      assistant: typeof answer === 'string' ? answer : stableStringify(answer)
    }, policy);
    if (example) examples.push(example);
  }
  return examples;
}

function dedupeExamples(examples) {
  const byHash = new Map();
  for (const example of examples) {
    if (!example || byHash.has(example.contentHash)) continue;
    byHash.set(example.contentHash, example);
  }
  return [...byHash.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function splitDataset(examples, validationPercent = 15) {
  const pct = Math.max(1, Math.min(50, Number(validationPercent) || 15));
  const train = [];
  const validation = [];
  for (const example of examples) {
    const bucket = parseInt(sha256(example.id).slice(0, 8), 16) % 100;
    (bucket < pct ? validation : train).push(example);
  }
  if (examples.length > 1 && validation.length === 0) validation.push(train.pop());
  if (examples.length > 1 && train.length === 0) train.push(validation.pop());
  return { train, validation };
}

function buildDataset(root, policy = readJson(DEFAULT_POLICY)) {
  const groups = {
    protectedErrors: collectProtectedErrors(root, policy),
    goldenComponents: collectGoldenComponents(root, policy),
    promotedKnowledge: collectPromotedKnowledge(root, policy),
    promotedAutofix: collectPromotedAutofix(root, policy)
  };
  const examples = dedupeExamples(Object.values(groups).flat());
  const split = splitDataset(examples, policy.dataset?.validationPercent || 15);
  return {
    policy,
    examples,
    train: split.train,
    validation: split.validation,
    stats: {
      total: examples.length,
      train: split.train.length,
      validation: split.validation.length,
      rejectedSecretCount: 0,
      sources: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length]))
    }
  };
}

function toJsonl(examples) {
  return examples.map((example) => JSON.stringify({
    id: example.id,
    source: example.source,
    tags: example.tags,
    messages: example.messages,
    contentHash: example.contentHash
  })).join('\n') + (examples.length ? '\n' : '');
}

function prepareDataset(root, outDir, policy = readJson(path.join(root, 'data', 'world-brain-factory-policy.json'))) {
  const result = buildDataset(root, policy);
  fs.mkdirSync(outDir, { recursive: true });
  const trainPath = path.join(outDir, 'train.jsonl');
  const validationPath = path.join(outDir, 'validation.jsonl');
  const trainText = toJsonl(result.train);
  const validationText = toJsonl(result.validation);
  fs.writeFileSync(trainPath, trainText, 'utf8');
  fs.writeFileSync(validationPath, validationText, 'utf8');

  const manifest = {
    schemaVersion: '1.0.0',
    system: 'WORLD_BRAIN_FACTORY',
    generatedAt: new Date().toISOString(),
    policyHash: sha256(policy),
    counts: result.stats,
    files: {
      'train.jsonl': sha256(trainText),
      'validation.jsonl': sha256(validationText)
    },
    sourceCommit: null,
    trainingRuntime: policy.trainingRuntime,
    promotionRule: policy.promotion?.rule || null
  };
  try {
    const { spawnSync } = require('child_process');
    const git = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
    if (git.status === 0) manifest.sourceCommit = git.stdout.trim();
  } catch {}
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { ...result, manifest, outDir };
}

function verifyDataset(outDir) {
  const manifest = readJson(path.join(outDir, 'manifest.json'));
  const findings = [];
  for (const [name, expectedHash] of Object.entries(manifest.files || {})) {
    const filePath = path.join(outDir, name);
    if (!fs.existsSync(filePath)) {
      findings.push({ file: name, ok: false, reason: 'missing' });
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const actualHash = sha256(text);
    const secret = containsSecretLikeText(text);
    findings.push({ file: name, ok: actualHash === expectedHash && !secret, hashMatches: actualHash === expectedHash, secretFinding: secret });
  }
  return { ok: findings.length > 0 && findings.every((finding) => finding.ok), findings, manifest };
}

module.exports = {
  buildDataset,
  collectGoldenComponents,
  collectProtectedErrors,
  containsSecretLikeText,
  dedupeExamples,
  prepareDataset,
  readJson,
  sha256,
  splitDataset,
  stableStringify,
  toJsonl,
  verifyDataset
};
