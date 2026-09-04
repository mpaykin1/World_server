'use strict';
// OLLAMA_PATCH_ADAPTER — a local, CPU-only, zero-cost coding fallback that
// never gives the model shell access. The model's ONLY output channel is a
// structured JSON object describing find/replace edits (and, for genuinely
// new files, path+content creates) against a file set this module itself
// selected and read from disk — never a command, never a diff-apply tool
// call, never an open-ended "run this" instruction.
//
// Why find/replace instead of unified diff or full-file regeneration:
// benchmarked live against the installed 1-4B local models (see
// scripts/benchmark-ollama-coding.js) — small local models are unreliable
// at producing exact unified-diff hunk headers (line numbers/context must
// match exactly or `git apply` rejects the whole patch), and regenerating
// an entire file risks a small model silently dropping or altering
// unrelated content it wasn't asked to touch. A find/replace pair is a
// natural task for even a 1-2B instruct model, and is mechanically
// verifiable before ever touching disk: the "find" string either matches
// the real current file exactly once, or the edit is rejected outright —
// this is this module's equivalent of `git apply --check`.
const fs = require('fs');
const path = require('path');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// Real, evidence-based default — see OLLAMA_MODEL_BENCHMARK.json for the
// full comparison. Live-benchmarked on this project's actual CPU-only dev
// hardware against the real viewport-fit task: qwen3:1.7b completed in
// 56.7s with a valid, correctly-anchored patch — faster AND more reliable
// than both a smaller model (gemma3:1b-it-qat: 103s, produced a
// hallucinated/unusable response) and larger ones (qwen2.5:3b-instruct
// timed out at 220s; qwen3-fast:1.7b succeeded but took 203s). The
// smallest model that actually works well wins, not the biggest.
// Overridable per-call; never silently escalates to a bigger/ungoverned
// model.
const DEFAULT_PATCH_MODEL = process.env.OLLAMA_PATCH_MODEL || 'qwen3:1.7b';

// Real evidence this cycle: prompt EVALUATION, not generation, dominates
// cost on this CPU-only host — a single ~5.3KB file (2095 prompt tokens)
// took 103-220s+ depending on model size. lib/agent-adapters.js's OpenCode
// path can afford the Scoped Task Compiler's full level-1 file set (up to
// ~5 files) because that cost is paid on a remote host; this local path
// cannot. Capping total included file content keeps a single local
// attempt bounded to roughly the same order of magnitude already measured,
// instead of silently growing to 3-5x that on a multi-file scoped task.
const MAX_PROMPT_CONTENT_BYTES = 6000;
const MAX_EDITS = 20;
const MAX_TOTAL_BYTES_CHANGED = 50_000;
const MAX_REPLACE_BYTES = 20_000;
const MAX_NEW_FILE_BYTES = 20_000;

// Extensions/paths the model is never allowed to touch, even if somehow
// named in a scoped file list — defense in depth, independent of the
// allowlist check below.
const BLOCKED_EXTENSIONS = new Set([
  '.env', '.key', '.pem', '.p12', '.pfx', '.crt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.node',
  '.db', '.sqlite', '.sqlite3',
]);
const BLOCKED_BASENAMES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', '.env',
]);
const BLOCKED_PATH_SEGMENTS = ['node_modules', '.git', '.godot', 'GODOT_BUILD'];

function buildPatchPrompt(goal, files) {
  const fileBlocks = files.map((f) => `FILE PATH: ${f.path}\nFILE CONTENT:\n${f.content}`).join('\n\n---\n\n');
  return `You are a precise code-editing assistant. You will be given the exact current content of one or more files and a task. Respond with ONLY a single JSON object, no markdown code fences, no explanation, no chain-of-thought text before or after it, in exactly this shape:
{"edits":[{"path":"<one of the file paths given below>","find":"<exact substring copied verbatim from that file's content>","replace":"<the replacement text>"}],"newFiles":[]}

Rules:
- "path" MUST be exactly one of the file paths listed below — never invent a new path for an edit.
- "find" MUST be copied character-for-character from that file's content shown below, and MUST occur EXACTLY ONCE in it. If you cannot find an exact unique substring to anchor the edit, do not include that edit.
- Only include a "newFiles" entry if the task explicitly requires creating a brand-new file that does not already exist.
- If the task cannot be done with the files given, return {"edits":[],"newFiles":[]}.
- Output ONLY the JSON object — nothing else.

TASK: ${goal}

${fileBlocks}
`;
}

// Handles markdown fences and "thinking"-mode preambles (qwen3's
// <think>...</think> blocks) by taking the LAST balanced {...} region in
// the text rather than assuming the response starts with JSON.
function extractJson(text) {
  const withoutThink = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : withoutThink;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return { ok: false, error: 'no JSON object found in model output' };
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return { ok: true, parsed };
  } catch (e) {
    return { ok: false, error: `JSON.parse failed: ${e.message}` };
  }
}

function validateSchema(parsed) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'response is not a JSON object' };
  const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
  const newFiles = Array.isArray(parsed.newFiles) ? parsed.newFiles : [];
  if (edits.length > MAX_EDITS) return { ok: false, error: `too many edits (${edits.length} > ${MAX_EDITS})` };
  for (const e of edits) {
    if (!e || typeof e.path !== 'string' || !e.path) return { ok: false, error: 'edit missing string path' };
    if (typeof e.find !== 'string' || !e.find.length) return { ok: false, error: `edit for ${e.path}: "find" must be a non-empty string` };
    if (typeof e.replace !== 'string') return { ok: false, error: `edit for ${e.path}: "replace" must be a string` };
    if (Buffer.byteLength(e.replace, 'utf8') > MAX_REPLACE_BYTES) return { ok: false, error: `edit for ${e.path}: replace text exceeds ${MAX_REPLACE_BYTES} bytes` };
  }
  for (const f of newFiles) {
    if (!f || typeof f.path !== 'string' || !f.path) return { ok: false, error: 'newFile missing string path' };
    if (typeof f.content !== 'string') return { ok: false, error: `newFile ${f.path}: "content" must be a string` };
    if (Buffer.byteLength(f.content, 'utf8') > MAX_NEW_FILE_BYTES) return { ok: false, error: `newFile ${f.path}: content exceeds ${MAX_NEW_FILE_BYTES} bytes` };
  }
  return { ok: true, edits, newFiles };
}

function isBlockedPath(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  const segments = norm.split('/');
  if (segments.some((s) => BLOCKED_PATH_SEGMENTS.includes(s))) return 'blocked directory';
  const base = segments[segments.length - 1];
  if (BLOCKED_BASENAMES.has(base)) return 'blocked filename';
  const ext = path.extname(base).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return `blocked extension ${ext}`;
  return null;
}

// Resolves a candidate relative path against targetWorktree and confirms
// the result is still inside it — the actual defense against `..`/absolute
// path escapes, independent of the string-level checks above.
function resolveWithinWorktree(targetWorktree, relPath) {
  if (path.isAbsolute(relPath)) return null;
  const resolved = path.resolve(targetWorktree, relPath);
  const root = path.resolve(targetWorktree) + path.sep;
  if (resolved !== path.resolve(targetWorktree) && !resolved.startsWith(root)) return null;
  return resolved;
}

// The real safety pipeline (point 3 of this cycle's spec): every check
// here runs BEFORE anything touches disk. A patch that fails any check is
// rejected wholesale — this module never applies "the parts that passed".
function validatePatch(parsed, { targetWorktree, allowedPaths }) {
  const schema = validateSchema(parsed);
  if (!schema.ok) return schema;
  const allowedSet = new Set(allowedPaths.map((p) => p.replace(/\\/g, '/')));
  let totalBytesChanged = 0;
  const resolvedEdits = [];
  for (const e of schema.edits) {
    const relPath = e.path.replace(/\\/g, '/');
    if (!allowedSet.has(relPath)) return { ok: false, error: `edit targets ${relPath}, which is outside the scoped file set this task was given` };
    const blocked = isBlockedPath(relPath);
    if (blocked) return { ok: false, error: `edit targets ${relPath}: ${blocked}` };
    const abs = resolveWithinWorktree(targetWorktree, relPath);
    if (!abs) return { ok: false, error: `edit path ${relPath} resolves outside the isolated worktree` };
    if (!fs.existsSync(abs)) return { ok: false, error: `edit targets ${relPath}, which does not exist in the worktree` };
    const current = fs.readFileSync(abs, 'utf8');
    const occurrences = current.split(e.find).length - 1;
    if (occurrences === 0) return { ok: false, error: `edit for ${relPath}: "find" text does not match the file's current content (model may be working from stale content)`, retriable: true };
    if (occurrences > 1) return { ok: false, error: `edit for ${relPath}: "find" text matches ${occurrences} times, must be unique — refusing an ambiguous edit`, retriable: true };
    totalBytesChanged += Math.abs(Buffer.byteLength(e.replace, 'utf8') - Buffer.byteLength(e.find, 'utf8'));
    resolvedEdits.push({ ...e, path: relPath, absPath: abs, currentContent: current });
  }
  const resolvedNewFiles = [];
  for (const f of schema.newFiles) {
    const relPath = f.path.replace(/\\/g, '/');
    const blocked = isBlockedPath(relPath);
    if (blocked) return { ok: false, error: `newFile ${relPath}: ${blocked}` };
    const abs = resolveWithinWorktree(targetWorktree, relPath);
    if (!abs) return { ok: false, error: `newFile path ${relPath} resolves outside the isolated worktree` };
    if (fs.existsSync(abs)) return { ok: false, error: `newFile ${relPath} already exists — use an edit, not a create` };
    totalBytesChanged += Buffer.byteLength(f.content, 'utf8');
    resolvedNewFiles.push({ ...f, path: relPath, absPath: abs });
  }
  if (totalBytesChanged > MAX_TOTAL_BYTES_CHANGED) return { ok: false, error: `total changed bytes (${totalBytesChanged}) exceeds the ${MAX_TOTAL_BYTES_CHANGED}-byte patch size limit` };
  if (!resolvedEdits.length && !resolvedNewFiles.length) return { ok: false, error: 'model returned zero edits and zero new files — nothing to apply', retriable: true, noOp: true };
  return { ok: true, edits: resolvedEdits, newFiles: resolvedNewFiles };
}

function syntaxCheckFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  try {
    if (ext === '.json') { JSON.parse(fs.readFileSync(absPath, 'utf8')); return { ok: true }; }
    if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, ['--check', absPath], { encoding: 'utf8', timeout: 15000 });
      return r.status === 0 ? { ok: true } : { ok: false, error: String(r.stderr || '').slice(-500) };
    }
    return { ok: true, skipped: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Applies a validated patch to real files. Must only ever be called with
// the `validated` output of validatePatch() — never with raw model output.
function applyPatch(validated) {
  const touched = [];
  for (const e of validated.edits) {
    const next = e.currentContent.replace(e.find, e.replace);
    fs.writeFileSync(e.absPath, next, 'utf8');
    touched.push(e.absPath);
  }
  for (const f of validated.newFiles) {
    fs.mkdirSync(path.dirname(f.absPath), { recursive: true });
    fs.writeFileSync(f.absPath, f.content, 'utf8');
    touched.push(f.absPath);
  }
  const syntaxResults = touched.map((p) => ({ path: p, ...syntaxCheckFile(p) }));
  const syntaxFailures = syntaxResults.filter((r) => !r.ok);
  return { touched, syntaxFailures, syntaxOk: syntaxFailures.length === 0 };
}

async function callOllama(model, prompt, { timeoutMs = 90000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 8192 } }),
    });
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    if (!res.ok) return { ok: false, durationMs, error: `ollama http ${res.status}` };
    const data = await res.json();
    return { ok: true, durationMs, text: data.response || '', evalCount: data.eval_count || 0, promptEvalCount: data.prompt_eval_count || 0 };
  } catch (e) {
    clearTimeout(timer);
    const durationMs = Date.now() - start;
    const timedOut = e.name === 'AbortError';
    return { ok: false, durationMs, error: timedOut ? `timed out after ${timeoutMs}ms` : e.message, timedOut };
  }
}

// Default timeout is evidence-derived, not guessed: the chosen default
// model (qwen3:1.7b, see DEFAULT_PATCH_MODEL above) completed the real
// viewport-fit benchmark task (~5.3KB file, 2095 prompt tokens) in 56.7s
// end-to-end on this project's actual CPU-only dev hardware. 150s leaves
// roughly 2.6x margin above that single real sample for normal variance
// and for the MAX_PROMPT_CONTENT_BYTES budget being closer to its 6000-byte
// cap than that one file was. See OLLAMA_MODEL_BENCHMARK.json for the full
// per-model comparison this number and DEFAULT_PATCH_MODEL were chosen
// from.
//
// Orchestrates one full local-model patch attempt: prompt -> call -> parse
// -> validate -> apply -> per-file syntax check. Never runs shell commands,
// never invokes anything the model returns as a command — the model's
// entire output surface is the JSON schema above. On any validation
// failure, nothing on disk is touched at all (fail before apply).
// `scopedFiles`: repo-relative paths (from lib/scoped-task-compiler.js),
// the same contract lib/agent-adapters.js's OpenCode path already uses.
async function invokeOllamaPatch(model, goal, targetWorktree, scopedFiles, { timeoutMs = 150000, maxAttempts = 2 } = {}) {
  if (!scopedFiles || !scopedFiles.length) return { ok: false, classification: 'no_scope', error: 'invokeOllamaPatch requires a non-empty scopedFiles list — this adapter never lets the model explore the worktree itself' };
  const files = [];
  const skippedForBudget = [];
  let contentBytes = 0;
  for (const relPath of scopedFiles) {
    const abs = resolveWithinWorktree(targetWorktree, relPath.replace(/\\/g, '/'));
    if (!abs || !fs.existsSync(abs)) continue;
    const blocked = isBlockedPath(relPath);
    if (blocked) continue; // silently omit — never hand the model a secret/binary file's content either
    const content = fs.readFileSync(abs, 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (contentBytes + bytes > MAX_PROMPT_CONTENT_BYTES) { skippedForBudget.push(relPath.replace(/\\/g, '/')); continue; }
    contentBytes += bytes;
    files.push({ path: relPath.replace(/\\/g, '/'), content });
  }
  if (!files.length) return { ok: false, classification: 'no_scope', error: 'none of the scoped files exist / are readable / passed the blocklist / fit the local prompt-size budget' };

  let lastError = null;
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = attempt === 1
      ? buildPatchPrompt(goal, files)
      : `${buildPatchPrompt(goal, files)}\n\nYour previous attempt was rejected: ${lastError}. Re-read the file content above carefully and try again, copying "find" text exactly.`;
    const call = await callOllama(model, prompt, { timeoutMs });
    if (!call.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: call.error });
      lastError = call.error;
      if (call.timedOut) return { ok: false, classification: 'timeout', error: call.error, attempts };
      continue;
    }
    const extracted = extractJson(call.text);
    if (!extracted.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: extracted.error, rawTextTail: call.text.slice(-300) });
      lastError = extracted.error;
      continue;
    }
    // allowedPaths is deliberately the files actually shown to the model
    // (post prompt-size-budget), not the caller's full scopedFiles list -
    // an edit targeting a file the model never saw could only be a
    // hallucination, never a legitimate response to this prompt.
    const validated = validatePatch(extracted.parsed, { targetWorktree, allowedPaths: files.map((f) => f.path) });
    if (!validated.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: validated.error, noOp: !!validated.noOp });
      lastError = validated.error;
      if (!validated.retriable) return { ok: false, classification: 'validation_rejected', error: validated.error, attempts };
      continue;
    }
    const applied = applyPatch(validated);
    attempts.push({ attempt, ok: true, durationMs: call.durationMs, editsApplied: validated.edits.length, newFilesCreated: validated.newFiles.length, syntaxOk: applied.syntaxOk });
    if (!applied.syntaxOk) {
      return { ok: false, classification: 'syntax_invalid', error: `applied edit(s) failed a syntax check: ${JSON.stringify(applied.syntaxFailures)}`, attempts, touchedFiles: applied.touched };
    }
    return {
      ok: true, classification: 'ok', model, tier: 'free-local',
      editsApplied: validated.edits.length, newFilesCreated: validated.newFiles.length,
      touchedFiles: applied.touched.map((p) => path.relative(targetWorktree, p).replace(/\\/g, '/')),
      attempts, costUsd: 0, skippedForBudget: skippedForBudget.length ? skippedForBudget : undefined,
    };
  }
  return { ok: false, classification: 'exhausted_attempts', error: lastError || 'unknown failure', attempts, skippedForBudget: skippedForBudget.length ? skippedForBudget : undefined };
}

module.exports = {
  buildPatchPrompt, extractJson, validateSchema, validatePatch, applyPatch,
  syntaxCheckFile, resolveWithinWorktree, isBlockedPath, callOllama, invokeOllamaPatch,
  DEFAULT_PATCH_MODEL, MAX_EDITS, MAX_TOTAL_BYTES_CHANGED, MAX_REPLACE_BYTES, MAX_NEW_FILE_BYTES,
};
