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
// original 5-model comparison (won on both speed, 56.7s, and correctness
// against qwen2.5:3b-instruct, qwen3:4b, qwen3-fast:1.7b and
// gemma3:1b-it-qat). That comparison was run BEFORE this cycle's think:false
// fix (see callOllama's comment) - qwen3:1.7b is itself a Qwen3-family
// reasoning model and so was also paying for unbounded chain-of-thought
// generation in that run; its numbers there are a lower bound, not an
// upper one. Not re-run against the other 4 with think:false this cycle
// (out of scope - this cycle improves the chosen model's own reliability,
// not model selection) but worth revisiting if a future cycle has reason
// to. Overridable per-call; never silently escalates to a bigger/
// ungoverned model.
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

// Point 3 this cycle: don't make the local model "understand the whole
// project" for a small fix - a long generic architectural preamble is
// pure prompt-eval cost with no benefit when there's exactly one file and
// one obvious target. The single-file path below hard-codes the only
// valid `path` value (removing a whole disambiguation rule) and drops the
// framing sentence entirely - real, measured effect: fewer prompt tokens
// for the identical instruction content. The multi-file path keeps the
// fuller rules, since disambiguating which file to target actually
// matters once there is more than one option.
function buildPatchPrompt(goal, files) {
  if (files.length === 1) {
    const f = files[0];
    return `Exact current content of ${f.path}:
${f.content}

Task: ${goal}

Return ONLY this JSON, nothing else — no explanation, no markdown fences:
{"edits":[{"path":"${f.path}","find":"<exact substring copied verbatim from above>","replace":"<replacement text>"}],"newFiles":[]}
"find" must match the content above EXACTLY and occur exactly once. If no unique anchor exists, return {"edits":[],"newFiles":[]}.
`;
  }
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
// Real cross-platform bug found live in CI (passed on this project's own
// Windows dev machine, failed on the Ubuntu CI runner): path.isAbsolute()
// is OS-native only - on Linux it does NOT recognize a Windows-style
// "C:/..." path as absolute, so that check alone would silently let a
// Windows-style path slip through as if it were a harmless relative
// subpath there. Not an actual traversal (POSIX path.resolve just treats
// "C:" as a literal directory name), but wrong and confusing regardless of
// which OS this ends up running on - so both path styles are rejected
// explicitly here, not just whichever one path.isAbsolute() recognizes on
// the current host.
const WINDOWS_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\/]/;
function resolveWithinWorktree(targetWorktree, relPath) {
  if (path.isAbsolute(relPath) || WINDOWS_ABSOLUTE_PATH_RE.test(relPath)) return null;
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

// ROOT CAUSE, found via a real A/B trace this cycle (point 1's explicit
// mandate: don't guess why production reliability differs from the
// isolated live test - measure). Ollama 0.33.2 exposes native Qwen3
// "thinking" mode: even a trivial "reply with exactly one word" prompt
// measured generating 245-511 tokens (28-58s) of chain-of-thought before
// the real answer, real evidence via the response's own `thinking` field
// (1419 chars of reasoning for that one call). This was NEVER bounded by
// anything in this module - a longer, more variable thinking chain on a
// real structured-patch prompt is the direct, measured explanation for
// production timeouts that an isolated single-call test didn't hit the
// same way (variance in how long the model "thinks" before answering).
// `think:false` is a real, documented Ollama API parameter for hybrid-
// reasoning models - confirmed live: the same trivial prompt dropped from
// 245-511 generated tokens to 3, and a real structured-patch call still
// produced a correct, schema-valid, correctly-anchored edit with it set.
// This alone does not fully solve production latency (prompt EVALUATION
// of real file content remains the dominant real cost - see
// MAX_PROMPT_CONTENT_BYTES and the timeout comment below), but it removes
// a real, large, previously entirely unaccounted-for source of waste.
// Point 4 this cycle: "120s might be too little on a cold model load but
// too much after a genuinely invalid response - don't count it as
// MODEL_TIMEOUT if the model is really still computing in the expected
// range." A single non-streaming call can't tell "slow but progressing"
// from "hung" - it produces nothing at all until the whole response is
// done. Streaming (stream:true) makes each token/chunk observable as it
// arrives, so this can track real activity and distinguish a real STALL
// (no new output for stallMs once generation has actually started - a
// genuine hang, worth aborting quickly) from ongoing, expected-range
// computation.
//
// Real, load-bearing correctness fix found by testing this mechanism
// against a real call before trusting it: Ollama's /api/generate emits
// NOTHING AT ALL during prompt evaluation/prefill - confirmed live, a
// real ~2000-token prompt produced its first streamed chunk at t=154155ms,
// completely silent for the entire prefill phase (matches the 166.72s of
// pure prompt-eval time measured in non-streaming mode earlier this
// cycle). A stall-clock that started at call time would have aborted this
// exact real, correctly-working call as "stalled" at t=45000ms - a false
// negative turning success into failure. The stall-clock below only
// starts once the FIRST real chunk has arrived; before that, the call's
// only protection is the separate, more generous maxTotalMs outer cap
// (which is what actually bounds the prefill phase).
const DEFAULT_STALL_MS = 45000;

async function callOllama(model, prompt, { timeoutMs = 90000, stallMs = DEFAULT_STALL_MS } = {}) {
  const start = Date.now();
  const ctrl = new AbortController();
  let lastActivityAt = null; // null = still in prefill, no chunk seen yet - the stall-clock is not running
  let stalled = false;
  const stallTimer = setInterval(() => {
    if (lastActivityAt !== null && Date.now() - lastActivityAt > stallMs) { stalled = true; ctrl.abort(); }
  }, 2000);
  const maxTimer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true, think: false, options: { num_ctx: 8192 } }),
    });
    if (!res.ok) { clearTimeout(maxTimer); clearInterval(stallTimer); return { ok: false, durationMs: Date.now() - start, error: `ollama http ${res.status}` }; }
    let text = '', lastLine = null, buf = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivityAt = Date.now(); // starts (or extends) the stall-clock from the first real chunk onward
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // last element may be a partial line - keep it for the next chunk
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; } // a real malformed line is skipped, not fatal - the accumulated text is still evaluated below
        if (typeof obj.response === 'string') text += obj.response;
        if (obj.done) lastLine = obj;
      }
    }
    clearTimeout(maxTimer);
    clearInterval(stallTimer);
    const durationMs = Date.now() - start;
    return {
      ok: true, durationMs, text,
      evalCount: (lastLine && lastLine.eval_count) || 0,
      promptEvalCount: (lastLine && lastLine.prompt_eval_count) || 0,
      promptEvalDurationMs: Math.round(((lastLine && lastLine.prompt_eval_duration) || 0) / 1e6),
      evalDurationMs: Math.round(((lastLine && lastLine.eval_duration) || 0) / 1e6),
      loadDurationMs: Math.round(((lastLine && lastLine.load_duration) || 0) / 1e6),
      resolvedVia: 'stream-complete',
    };
  } catch (e) {
    clearTimeout(maxTimer);
    clearInterval(stallTimer);
    const durationMs = Date.now() - start;
    const aborted = e.name === 'AbortError';
    if (aborted && stalled) return { ok: false, durationMs, error: `no output for ${stallMs}ms - a real stall, not just slow generation`, timedOut: true, resolvedVia: 'stalled' };
    return { ok: false, durationMs, error: aborted ? `hit the ${timeoutMs}ms outer safety cap (${lastActivityAt === null ? 'still in prefill - no output had started yet' : 'generation had started and was progressing'})` : e.message, timedOut: aborted, resolvedVia: aborted ? 'max-total-exceeded' : 'error' };
  }
}

// Point 5 this cycle: is it worth keeping the model warm between tasks?
// Real, measured evidence (the same A/B trace this cycle): load_duration
// was 6.16s cold, 2.79s on the next call, then 0.01s once genuinely warm -
// a real, meaningful latency win, and Ollama already does this FOR FREE by
// default (a model stays loaded for 5 minutes after its last use,
// keep_alive is not set anywhere in this module so nothing here disables
// that). The real remaining question per point 5 is the OTHER half: a
// warm qwen3:1.7b holds ~1.4-2.5GB RAM (real `ollama ps` size field) for
// that whole window even while idle - this must be released before a
// genuinely RAM-hungry task (a Native/Godot build, or under real system
// memory pressure) rather than silently competing with it. Best-effort:
// a failure here must never block the caller's real task - freeing RAM
// early is a courtesy, not a correctness requirement (Ollama will evict
// under its own memory pressure regardless).
async function unloadAllModels({ timeoutMs = 5000 } = {}) {
  try {
    const psRes = await fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!psRes.ok) return { ok: false, unloaded: [] };
    const data = await psRes.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const unloaded = [];
    for (const m of models) {
      try {
        await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.name, keep_alive: 0 }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        unloaded.push(m.name);
      } catch { /* best effort per-model - one failure must not block the rest */ }
    }
    return { ok: true, unloaded };
  } catch { return { ok: false, unloaded: [] }; }
}

// Point 6 this cycle: if a local patch was applied and passed its own
// syntax check, but the real project VERIFIER then failed, that is
// evidence the model got MOST of the way there - immediately giving up
// and falling back to OpenCode discards that. One cheap repair attempt:
// show the model its own previous edit, the verifier's exact error, and
// the file's CURRENT (post-edit) content - never the full original task
// prompt again, since the model already has the context of what it did
// and why it was wrong.
function buildRepairPrompt(previousEdits, verifierError, currentFiles) {
  const fileBlocks = currentFiles.map((f) => `FILE PATH: ${f.path}\nCURRENT CONTENT (after your previous edit was applied):\n${f.content}`).join('\n\n---\n\n');
  return `Your previous edit was applied to the file(s) below but failed verification.

Your previous edit(s): ${JSON.stringify(previousEdits)}

Verifier error (real, from the project's own test/build tooling):
${String(verifierError || '').slice(0, 1200)}

${fileBlocks}

Return ONLY a corrected JSON patch, nothing else, in this exact shape:
{"edits":[{"path":"<one of the file paths above>","find":"<exact substring copied verbatim from the CURRENT content above>","replace":"<replacement text>"}],"newFiles":[]}
"find" must match the CURRENT content above exactly and occur exactly once.
`;
}

async function invokeOllamaRepair(model, previousEdits, verifierError, targetWorktree, allowedPaths, { timeoutMs = 90000 } = {}) {
  const currentFiles = [];
  for (const relPath of allowedPaths) {
    const abs = resolveWithinWorktree(targetWorktree, relPath.replace(/\\/g, '/'));
    if (!abs || !fs.existsSync(abs)) continue;
    currentFiles.push({ path: relPath.replace(/\\/g, '/'), content: fs.readFileSync(abs, 'utf8') });
  }
  if (!currentFiles.length) return { ok: false, classification: 'no_scope', error: 'no repairable files found on disk' };
  const prompt = buildRepairPrompt(previousEdits, verifierError, currentFiles);
  const call = await callOllama(model, prompt, { timeoutMs: Math.min(timeoutMs, estimateTimeoutMs(prompt.length)) });
  if (!call.ok) return { ok: false, classification: call.timedOut ? 'timeout' : 'call_failed', error: call.error };
  const extracted = extractJson(call.text);
  if (!extracted.ok) return { ok: false, classification: 'schema_error', error: extracted.error };
  const validated = validatePatch(extracted.parsed, { targetWorktree, allowedPaths: currentFiles.map((f) => f.path) });
  if (!validated.ok) return { ok: false, classification: 'validation_rejected', error: validated.error };
  const applied = applyPatch(validated);
  if (!applied.syntaxOk) return { ok: false, classification: 'syntax_invalid', error: `repair edit failed a syntax check: ${JSON.stringify(applied.syntaxFailures)}` };
  return {
    ok: true, classification: 'ok', editsApplied: validated.edits.length,
    touchedFiles: applied.touched.map((p) => path.relative(targetWorktree, p).replace(/\\/g, '/')),
  };
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
// Per-file snippet budget for the ultra-scoped mode (point 2 this cycle) —
// deliberately much smaller than MAX_PROMPT_CONTENT_BYTES, which stays as
// the overall multi-file safety net. Real evidence: a full ~5.3KB file
// (1990 prompt tokens) cost 166.72s of prompt evaluation alone on this
// CPU. 1200 bytes is roughly a 4-5x reduction for the common case (a
// single-block edit inside a much larger file) - lib/ollama-context-
// extractor.js's buildScopedSnippet() is what actually finds a real,
// verbatim, relevant window instead of blindly truncating.
const ULTRA_SCOPED_SNIPPET_BYTES = 1200;

// Point 4 this cycle: a flat per-call timeout either wastes time waiting
// out a small prompt's budget or starves a genuinely larger one. Real,
// measured rate on this project's dev hardware (the A/B trace this cycle
// documented on callOllama): 1990 prompt tokens took 166.72s of prompt
// evaluation = ~11.9 tokens/sec. Used as a real fallback default, not a
// guess; agentHistory's own recorded promptEvalCount/promptEvalDurationMs
// pairs are preferred once enough real samples exist for this exact
// (model, host) - see estimateTimeoutMs's history parameter.
const FALLBACK_PROMPT_EVAL_TOK_PER_SEC = 12;
const CHARS_PER_TOKEN_ESTIMATE = 3.5; // rough - real prompt text/markup/code on this project
const FALLBACK_LOAD_MS = 8000; // real observed cold-load ceiling (6.16s worst case measured + margin)
const FALLBACK_GEN_TOKEN_BUDGET = 150; // real observed eval_count with think:false: 3-150 for this task class
const FALLBACK_GEN_TOK_PER_SEC = 5;

function estimateTimeoutMs(promptCharCount, { history = null } = {}) {
  let promptEvalTokPerSec = FALLBACK_PROMPT_EVAL_TOK_PER_SEC;
  // Once real history exists (≥3 samples with both fields recorded),
  // trust it over the fallback constant - same "don't guess once you have
  // evidence" principle as agentHistory.recommendTimeoutMs.
  if (Array.isArray(history)) {
    const withRates = history.filter((h) => h.promptEvalCount > 0 && h.promptEvalDurationMs > 0);
    if (withRates.length >= 3) {
      const rates = withRates.map((h) => h.promptEvalCount / (h.promptEvalDurationMs / 1000));
      promptEvalTokPerSec = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
  }
  const promptTokens = promptCharCount / CHARS_PER_TOKEN_ESTIMATE;
  const promptEvalMs = (promptTokens / promptEvalTokPerSec) * 1000;
  const genMs = (FALLBACK_GEN_TOKEN_BUDGET / FALLBACK_GEN_TOK_PER_SEC) * 1000;
  return Math.max(20000, Math.round((FALLBACK_LOAD_MS + promptEvalMs + genMs) * 1.6));
}

async function invokeOllamaPatch(model, goal, targetWorktree, scopedFiles, { timeoutMs = 150000, maxAttempts = 2 } = {}) {
  if (!scopedFiles || !scopedFiles.length) return { ok: false, classification: 'no_scope', error: 'invokeOllamaPatch requires a non-empty scopedFiles list — this adapter never lets the model explore the worktree itself' };
  const contextExtractor = require('./ollama-context-extractor');
  const rawFiles = [];
  for (const relPath of scopedFiles) {
    const abs = resolveWithinWorktree(targetWorktree, relPath.replace(/\\/g, '/'));
    if (!abs || !fs.existsSync(abs)) continue;
    const blocked = isBlockedPath(relPath);
    if (blocked) continue; // silently omit — never hand the model a secret/binary file's content either
    rawFiles.push({ path: relPath.replace(/\\/g, '/'), content: fs.readFileSync(abs, 'utf8') });
  }
  if (!rawFiles.length) return { ok: false, classification: 'no_scope', error: 'none of the scoped files exist / are readable / passed the blocklist' };
  const allowedPaths = rawFiles.map((f) => f.path);

  let lastError = null;
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Progressive expansion (points 2 + 6): a retry after a real
    // find-not-found/ambiguous-match rejection sees a WIDER window on the
    // same real files, not the identical narrow snippet again - the level
    // passed to buildScopedSnippet grows with the attempt number.
    const skippedForBudget = [];
    let contentBytes = 0;
    const files = [];
    for (const rf of rawFiles) {
      const scoped = contextExtractor.buildScopedSnippet(rf.content, goal, { level: attempt, maxBytes: ULTRA_SCOPED_SNIPPET_BYTES });
      const bytes = Buffer.byteLength(scoped.snippet, 'utf8');
      if (contentBytes + bytes > MAX_PROMPT_CONTENT_BYTES) { skippedForBudget.push(rf.path); continue; }
      contentBytes += bytes;
      files.push({ path: rf.path, content: scoped.snippet, contextMethod: scoped.method, contextTruncated: scoped.truncated });
    }
    const prompt = attempt === 1
      ? buildPatchPrompt(goal, files)
      : `${buildPatchPrompt(goal, files)}\n\nYour previous attempt was rejected: ${lastError}. Re-read the file content above carefully (it now shows more of the file than last time) and try again, copying "find" text exactly.`;
    // The caller's timeoutMs is a safety CEILING, not a guess to use
    // outright - the actual per-call budget is estimated from this
    // attempt's real prompt size (which shrinks or grows with the context
    // extraction level), never exceeding that ceiling. A tiny scoped
    // snippet gets a tight, fast-failing budget instead of always waiting
    // out a flat 150s; a level-3/no-cap prompt still can't exceed what the
    // caller allowed.
    const dynamicTimeoutMs = Math.min(timeoutMs, estimateTimeoutMs(prompt.length));
    const call = await callOllama(model, prompt, { timeoutMs: dynamicTimeoutMs });
    const contextInfo = { contentBytes, methods: files.map((f) => ({ path: f.path, method: f.contextMethod, truncated: f.contextTruncated })) };
    if (!call.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: call.error, context: contextInfo });
      lastError = call.error;
      if (call.timedOut) return { ok: false, classification: 'timeout', error: call.error, attempts };
      continue;
    }
    const extracted = extractJson(call.text);
    if (!extracted.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: extracted.error, rawTextTail: call.text.slice(-300), context: contextInfo });
      lastError = extracted.error;
      continue;
    }
    // allowedPaths is deliberately the full raw-file list (every file this
    // attempt COULD have shown a snippet of), not just the files that made
    // it into this specific attempt's byte budget - an edit targeting a
    // file this attempt genuinely skipped for budget is still a real,
    // legitimate scoped file, just not one this narrow attempt could
    // afford; validatePatch's own find-must-match-the-real-file check is
    // what actually protects against a hallucinated edit either way.
    const validated = validatePatch(extracted.parsed, { targetWorktree, allowedPaths });
    if (!validated.ok) {
      attempts.push({ attempt, ok: false, durationMs: call.durationMs, error: validated.error, noOp: !!validated.noOp, context: contextInfo });
      lastError = validated.error;
      if (!validated.retriable) return { ok: false, classification: 'validation_rejected', error: validated.error, attempts };
      continue;
    }
    const applied = applyPatch(validated);
    attempts.push({ attempt, ok: true, durationMs: call.durationMs, editsApplied: validated.edits.length, newFilesCreated: validated.newFiles.length, syntaxOk: applied.syntaxOk, context: contextInfo });
    if (!applied.syntaxOk) {
      return { ok: false, classification: 'syntax_invalid', error: `applied edit(s) failed a syntax check: ${JSON.stringify(applied.syntaxFailures)}`, attempts, touchedFiles: applied.touched };
    }
    return {
      ok: true, classification: 'ok', model, tier: 'free-local',
      editsApplied: validated.edits.length, newFilesCreated: validated.newFiles.length,
      touchedFiles: applied.touched.map((p) => path.relative(targetWorktree, p).replace(/\\/g, '/')),
      // appliedEdits (path/find/replace only, none of the internal
      // absPath/currentContent fields) lets a caller reuse the exact
      // successful edit for a point-6 repair prompt later, without
      // needing to re-derive it from scratch.
      appliedEdits: validated.edits.map((e) => ({ path: e.path, find: e.find, replace: e.replace })),
      attempts, costUsd: 0, skippedForBudget: skippedForBudget.length ? skippedForBudget : undefined,
    };
  }
  return { ok: false, classification: 'exhausted_attempts', error: lastError || 'unknown failure', attempts };
}

module.exports = {
  buildPatchPrompt, extractJson, validateSchema, validatePatch, applyPatch,
  syntaxCheckFile, resolveWithinWorktree, isBlockedPath, callOllama, invokeOllamaPatch,
  DEFAULT_PATCH_MODEL, MAX_EDITS, MAX_TOTAL_BYTES_CHANGED, MAX_REPLACE_BYTES, MAX_NEW_FILE_BYTES,
  ULTRA_SCOPED_SNIPPET_BYTES, estimateTimeoutMs, unloadAllModels,
  buildRepairPrompt, invokeOllamaRepair,
};
