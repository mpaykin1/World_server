#!/usr/bin/env node
'use strict';
// OPENHUMAN_ORDINARY_CHAT_KNOWLEDGE_PACK
// Curated, hand-authored World_server knowledge (project identity, UX, procedural systems,
// Supabase schema, Collective Brain, quality system, multi-AI rules, deployment, operational
// rules, current state) — NOT a raw git-diff/report dump. Reuses lib/collective-brain's
// remember()/securityScanText()/redactText()/sha256() rather than a parallel implementation.
// Dedupes per-entry via content hash so unchanged entries are skipped on repeat runs, and
// supersedes the prior memory id for an entry when its content actually changes.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { remember, securityScanText, redactText, sha256, health } = require('../lib/collective-brain');

const PROJECT = 'World_server';

function gitHead(root) {
  const r = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : 'UNKNOWN';
}

const ENTRIES = [
  {
    slug: 'project-identity',
    title: 'World_server / Project Identity',
    concepts: ['World_server', 'project-identity', 'architecture', 'repo-layout'],
    content: `World_server is a Node.js web-game server repository hosting several browser-based 3D/voxel game apps under apps/ (voxel-world, ai3d-voxel-city, dreamfog-world, ink-glyph-world, pixel-panorama-360, survival, world-sharabass, procedural-quality-lab, catalog, chat). Local dev runs via server.js (a plain Node http server) which proxies /api/* requests to handlers under api/; production deploys the same apps as Vercel static hosting + serverless functions, and server.js is never used in production. Shared, persistent, cross-session/cross-player state (worlds, player positions, block overrides, the world event log) lives in Supabase Postgres — the repo/deployment itself is stateless between requests. Several AI coding agents (opencode, Claude, Codex, OpenHuman/desktop-ai) work on this repo concurrently, each usually on its own ai/<agent>/<topic> branch, merged forward into the shared integration branch ai/opencode/multi-ai-peer-improvement before reaching master.`,
  },
  {
    slug: 'navigator',
    title: 'World_server / Navigator',
    concepts: ['World_server', 'Navigator', 'orchestration', 'conversational-layer', 'in-progress'],
    content: `Navigator is World_server's conversational/orchestration layer: player-facing natural-language interaction whose outputs are meant to drive world state changes directly — triggering procedural recipe generation, world events and VFX reactions — rather than being a passive chat widget bolted on the side. It is being developed on the ai/opencode/navigator-engagement-v1 branch (see WORLD_SERVER_NAVIGATOR_ENGAGEMENT_ML_V1.zip in the repo root) and, as of this Knowledge Pack's source commit, is NOT yet merged into the integration branch. Treat Navigator as an in-progress subsystem — describe its intended role accurately, but don't claim it is shipped/live unless a later, fresher Collective Brain memory says otherwise.`,
  },
  {
    slug: 'user-experience',
    title: 'World_server / User Experience',
    concepts: ['World_server', 'UX', 'mobile', 'multiplayer', 'controls', 'performance'],
    content: `World_server apps run in-browser on both desktop and mobile. The player controls a first-person/orbit eye-camera: mouse-look + WASD on desktop, an on-screen joystick + drag-look plus a fullscreen toggle on mobile (see the DARK_VOID_MOBILE_CONTROLS_PATCH_V2 pattern, which is the template for adding mobile controls to any app in this repo — joystick + drag-look + fullscreen button, vertical layout tightened, desktop path untouched). Multiplayer/shared-world sync happens through Supabase: player state (voxel_player_states) and world mutations (voxel_world_events, an append-only event log) are the source of truth other connected clients read to reconcile a shared world — there is no separate realtime server. Adaptive quality/performance (LOD, effect budget) scales down automatically on mobile/low-end devices, with frame-rate prioritized over visual fidelity when the two trade off.`,
  },
  {
    slug: 'procedural-systems',
    title: 'World_server / Graphics & Procedural Systems',
    concepts: ['World_server', 'procedural', 'Recipe Engine', 'VFX Engine', 'voxel-art', 'LOD'],
    content: `Rendering is voxel-art style with adaptive quality tiers and LOD; frame-rate is prioritized over fidelity on constrained devices. Two production procedural engines (PR #14, branch ai/desktop/world-procedural-v3): Recipe Engine V3 (lib/world-procedural-recipe-engine.js + ~27 lib/world-procedural-*.js files) deterministically compiles a world "recipe" — architecture kind/density/ruin, atmosphere darkness/fog/weather — from a seed, at multiple quality tiers. VFX Engine V3 (shared/world-procedural-vfx/**, ~90 files) is a semantic reaction-effect runtime (pulse/sparks/ribbon/decal/beam pooled effects) driven by named intents — reveal, danger, calm, connection, transformation, discovery — instead of raw per-effect calls. The two are wired together by lib/world-procedural-vfx-bridge.js, which maps a compiled recipe's architecture.kind (gothic→transformation, ruins→discovery, forest→calm, mixed→connection) or, when there's no architecture, its atmosphere (high darkness or storm→danger, high fog→discovery, otherwise→reveal) to a VFX intent — so finishing a recipe automatically triggers the matching visual reaction. Live-wired into apps/voxel-world/client.js.`,
  },
  {
    slug: 'supabase-schema',
    title: 'World_server / Supabase Schema',
    concepts: ['World_server', 'Supabase', 'database', 'voxel_worlds', 'voxel_world_events', 'recipe-commit'],
    content: `Supabase Postgres is the shared backend for all persistent/cross-session state. Key tables: voxel_worlds (id, revision, settings, updated_at — one row per world; revision is an optimistic-concurrency counter), voxel_world_events (id, world_id, revision, event_type, cx, cz, radius_chunks, payload, source, created_by_user, created_by_guest, idempotency_key, event_checksum — an append-only event log other clients replay to reconcile world state), voxel_player_states, voxel_block_overrides. The Recipe Engine's commit path is the Postgres function world_procedural_recipe_commit_v3(...): SECURITY INVOKER, search_path=public,pg_temp, EXECUTE granted only to postgres + service_role (revoked from PUBLIC/anon/authenticated). It atomically (1) checks the world's current revision matches the caller's expected revision — optimistic CAS guarding against racing writers, (2) validates a SHA-256 lowercase-hex content hash of the recipe payload, (3) validates the idempotency_key so a retried request can't double-apply, and (4) writes proceduralRecipe/proceduralRecipeHash onto voxel_worlds and appends a procedural_recipe_patch event to voxel_world_events — all in one transaction, so a world is never left half-updated.`,
  },
  {
    slug: 'supabase-environments',
    title: 'World_server / Supabase Environments — do not confuse projects',
    concepts: ['World_server', 'Supabase', 'production', 'preview', 'environment-mismatch'],
    content: `There are at least three distinct Supabase projects in play and mixing them up is a real, previously-hit mistake. iphfwxjuhsucvdyluink ("Improve world Project") is PRODUCTION — world_procedural_recipe_commit_v3 is already applied and verified there; never re-apply that migration to it. xlcdnlsyvxqtopmkweiy ("world-server-preview") is the preview/staging project and holds the real voxel_worlds/voxel_player_states/voxel_block_overrides tables. bmufrivwbjdmircmlkfw ("Improve") is an empty, unrelated project and is never a valid migration target. Always confirm the project_id you're actually pointed at (not just a human-readable project name, which can be ambiguous) before running any Supabase migration or destructive query.`,
  },
  {
    slug: 'collective-brain',
    title: 'World_server / Collective Brain',
    concepts: ['World_server', 'Collective Brain', 'agentmemory', 'shared-memory', 'OpenHuman'],
    content: `Collective Brain is the shared-memory + coordination layer letting every AI agent working on this repo (opencode, Claude, Codex, OpenHuman/desktop-ai) read and write one common memory instead of each relearning the same lessons independently. Backend: agentmemory, a local Node service on http://127.0.0.1:3111 with a REST API under /agentmemory/* (e.g. /agentmemory/smart-search, /agentmemory/remember, /agentmemory/health, /agentmemory/livez) — the same backend OpenHuman's own [memory] config points at, so this project's knowledge and OpenHuman's ordinary-chat memory are meant to be the same store, not two separate ones. Discipline: recall relevant memory before starting a task, save a lesson only after a fix is confirmed working (not speculatively before), don't duplicate what's already recorded, supersede stale entries rather than piling up contradictions, and never write secrets (.env values, Supabase service_role keys, GitHub/Vercel tokens, passwords, API keys) into memory — repo scripts run a secret-scan before every write and refuse to store matches. Repo code: lib/collective-brain/index.js + scripts/collective-brain-*.js (check/cycle/recall/export/doctor/security/route/replay/benchmark/full).`,
  },
  {
    slug: 'quality-system',
    title: 'World_server / Quality System',
    concepts: ['World_server', 'quality', 'release-gate', 'regression', 'error-prevention-registry'],
    content: `World_server already has an extensive quality/regression tooling suite — reuse it, never build a parallel one for the same purpose. Key npm scripts: quality:knowledge (knowledge graph of prior fixes), quality:root-cause (root-cause graph, not just symptom tracking), quality:risk, quality:tournament, release:gate (the mandatory full pre-merge gate, which runs essentially every check in the repo and must pass before a PR is considered ready), quality:error-prevention (backed by data/error-prevention-registry.json, the canonical list of previously-hit bugs and their permanent regression protections), duplicates:check, contracts:check (cross-system API/schema contracts). Golden components (data/golden-components.json) are systems verified working that must not regress. The required discipline for any bug: root-cause → fix → regression test → shared Collective Brain lesson — never patch a symptom and move on.`,
  },
  {
    slug: 'multi-ai-rules',
    title: 'World_server / Multi-AI Collaboration Rules',
    concepts: ['World_server', 'multi-ai', 'worktrees', 'coordination', 'git'],
    content: `Several AI agents work on this repo in parallel, usually each on its own ai/<agent>/<topic> branch, merged forward into the shared integration branch ai/opencode/multi-ai-peer-improvement before master. Rules: don't interfere with another agent's in-progress branch; prefer an isolated git worktree (git worktree add ../World_server_<name> -b <branch>) over editing the shared, often-dirty main checkout directly; when two agents solve the same problem, compare the solutions rather than blindly picking one; when you fix a bug, turn the fix into a permanent regression test/registry entry so no other agent (or future session) reintroduces it; never force-push over another agent's unmerged work, and always check git status/log before any destructive git operation.`,
  },
  {
    slug: 'deployment',
    title: 'World_server / Deployment',
    concepts: ['World_server', 'deployment', 'Vercel', 'Supabase', 'native', 'Godot'],
    content: `Web apps deploy via Vercel: apps/* are served as static assets, and api/*.js files become Vercel serverless functions; server.js is local-dev-only and never runs in production. All persistent state lives in Supabase, not on the Vercel deployment, so deployments are stateless and safely redeployable. Where a native/Godot build of the same game logic exists (native/godot/*.gd, integrations/godot/*.gd contract files), Web and Native are meant to be kept behaviorally identical via those shared contracts rather than developed as two independently-diverging codebases — a differential test (world:recipe:native:strict) checks this when a Godot build environment is available, and is recorded as BLOCKED/NOT AVAILABLE (never silently assumed PASS) when it isn't.`,
  },
  {
    slug: 'operational-rules',
    title: 'World_server / Operational Rules',
    concepts: ['World_server', 'operational-rules', 'root-cause', 'secrets', 'regression-protection'],
    content: `Never break a working ("golden") system in order to adopt a new technology — bridge or extend it in instead (see how VFX Engine V3 was bridged onto Recipe Engine V3 through a new adapter module rather than by modifying either engine's internals). Prefer strengthening an existing system over building a parallel one for the same purpose — e.g. reuse collective-brain:cycle/export before writing a new memory-sync script, reuse quality:* before writing a new quality check. For any bug: find the actual root cause (not just the symptom), fix it, add a regression test and/or error-prevention-registry entry so it can't silently return, then record the confirmed-working lesson in Collective Brain. Never commit secrets — .env contents, Supabase service_role/anon keys, GitHub/Vercel tokens, API keys, passwords — to git or to agentmemory; use environment variables and redact before writing to shared memory.`,
  },
];

function ledgerPath(root) { return path.join(root, 'data', 'collective-brain', 'knowledge-pack-ledger.json'); }
function loadLedger(root) { try { return JSON.parse(fs.readFileSync(ledgerPath(root), 'utf8')); } catch { return { schemaVersion: '1.0.0', entries: {} }; } }
function saveLedger(root, ledger) {
  const dir = path.dirname(ledgerPath(root));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${ledgerPath(root)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  fs.renameSync(tmp, ledgerPath(root));
}

function outboxPath(root) { return path.join(root, 'data', 'collective-brain', 'runtime', 'outbox.jsonl'); }
function queueOffline(root, payload, hash) {
  const dir = path.dirname(outboxPath(root));
  fs.mkdirSync(dir, { recursive: true });
  let items = [];
  try { items = fs.readFileSync(outboxPath(root), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)); } catch {}
  if (!items.some((x) => x.hash === hash)) items.push({ queuedAt: new Date().toISOString(), hash, payload, attempts: 0, nextAttemptAt: null });
  fs.writeFileSync(outboxPath(root), items.map((x) => JSON.stringify(x)).join('\n') + '\n');
}

async function run(root = process.cwd(), opts = {}) {
  const sourceCommit = gitHead(root);
  const h = opts.skipNetwork ? { ok: false, skipped: true } : await health(opts);
  const ledger = loadLedger(root);
  const results = [];

  const allEntries = [
    ...ENTRIES,
    {
      slug: 'index',
      title: 'World_server / Start Here (knowledge index)',
      concepts: ['World_server', 'index', 'this project', 'current project', 'start here'],
      content: `This is the World_server project — a Node.js multi-app web-game server with a shared Supabase backend, procedural Recipe/VFX engines, a Navigator conversational layer (in progress), and a Collective Brain shared-memory layer connecting every AI agent (including this OpenHuman session) working on it. For full detail, search this memory store (project="World_server") for: "World_server Project Identity", "World_server Navigator", "World_server User Experience", "World_server Graphics & Procedural Systems", "World_server Supabase Schema", "World_server Collective Brain", "World_server Quality System", "World_server Multi-AI Collaboration Rules", "World_server Deployment", "World_server Operational Rules", "World_server Current State". If asked "what do you know about World_server", volunteer several of these facts unprompted rather than only answering narrowly.`,
    },
  ];

  for (const entry of allEntries) {
    const content = redactText(entry.content);
    const scan = securityScanText(content);
    if (!scan.ok) { results.push({ slug: entry.slug, status: 'REFUSED_SECRET_LIKE', findings: scan.findings }); continue; }
    const hash = sha256(`${entry.slug}:${content}`);
    const prior = ledger.entries[entry.slug];
    if (prior && prior.hash === hash) { results.push({ slug: entry.slug, status: 'UNCHANGED', hash }); continue; }

    const payload = {
      project: PROJECT,
      title: entry.title,
      content: `${content}\n\n[source commit: ${sourceCommit}]`,
      type: 'fact',
      concepts: entry.concepts,
      sessionIds: [`knowledge-pack:${entry.slug}`],
    };

    if (!h.ok) {
      queueOffline(root, payload, hash);
      results.push({ slug: entry.slug, status: 'QUEUED_OFFLINE', hash });
      continue;
    }
    try {
      const res = await remember(payload, opts);
      ledger.entries[entry.slug] = { hash, sourceCommit, updatedAt: new Date().toISOString(), memoryId: res && res.id ? res.id : (res && res.memory && res.memory.id) || null };
      results.push({ slug: entry.slug, status: res && res.duplicate ? 'DUPLICATE' : 'WRITTEN', hash });
    } catch (e) {
      queueOffline(root, payload, hash);
      results.push({ slug: entry.slug, status: 'QUEUED_ON_ERROR', hash, error: e.message });
    }
  }

  saveLedger(root, ledger);
  return { sourceCommit, agentmemoryOk: h.ok, entries: results };
}

if (require.main === module) {
  run(process.cwd()).then((r) => {
    console.log(`[KNOWLEDGE_PACK] source=${r.sourceCommit.slice(0, 8)} agentmemory=${r.agentmemoryOk ? 'online' : 'OFFLINE(queued)'}`);
    for (const e of r.entries) console.log(`  - ${e.slug}: ${e.status}`);
    const failed = r.entries.some((e) => e.status === 'REFUSED_SECRET_LIKE');
    if (failed) process.exitCode = 1;
  }).catch((e) => { console.error('[KNOWLEDGE_PACK]', e.message); process.exitCode = 1; });
}

module.exports = { run, ENTRIES };
