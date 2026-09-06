# OpenHuman upgrade gate

**Installed:** v0.63.12 (released 2026-08-07)

**Local chat blocker:** tool/context overflow. Every ordinary-chat turn injects the
full tool catalog (76–315 tools) as prompt text for models without native
tool-calling support, producing ~48,750–49,119-token prompts against local Ollama
models' actual runtime context of only 4096 tokens (up to ~1199% utilization,
measured). See `data/error-prevention-registry.json#openhuman-local-model-tool-context-overflow`
and `OPENHUMAN_LOCAL_CHAT_E2E.json` for the full evidence trail.

**Upstream feature to watch:** `toolpacks` — selective tool disclosure gated behind
`load_skill`/`use_skill`, plus compact tool-schema serialization and reduced
per-field prose in delegation schemas. Work started 2026-08-21, still active as of
2026-08-31, **not in any tagged release yet** (checked: v0.63.12, 2026-08-07, is
still the latest tag). Full investigation: `OPENHUMAN_UPSTREAM_TOOLPACKS_INVESTIGATION.md`.

**Interim solution in place (this cycle):** AnythingLLM Desktop (v1.16.1, official,
MIT-licensed) installed alongside OpenHuman — not a replacement, a stopgap for local
agentic chat. Verified live: its `IntelligentSkillSelector` keeps the default agent
tool count at 3 (rag-memory, document-summarizer, web-scraping) and only reranks
when a workspace's tool count exceeds 15 — the same class of fix `toolpacks` is
building for OpenHuman, already shipped and observed working. OpenHuman itself is
untouched, still installed, and still the system of record for World_server access,
agentmemory/Collective Brain integration, and OpenRouter/free cloud fallback.

## When a new official OpenHuman release ships

Before treating a new release as the fix and switching back to OpenHuman as the
primary local-chat interface, run this sandboxed test sequence — do not assume:

1. Check the release notes / commit range for the `toolpacks` work specifically
   (search for "toolpacks", "tool catalog", "selective tool disclosure", "context
   budget" in the changelog between v0.63.12 and the new tag).
2. Re-run `npm run collective-brain:doctor` (via `scripts/openhuman-local-chat-e2e-check.js`)
   against the new version with a real local-model agentic chat turn — confirm
   `openhumanOrdinaryChatLocal` reports something other than `CONTEXT_BUDGET_EXCEEDED`
   or `FAIL`, using the same qwen3/gemma3 models already pulled (don't download new
   ones for this check).
3. Confirm `tool_count` in the agent_loop log for a real turn is a small, bounded
   number, not the full catalog.
4. Confirm agentmemory and World_server (action_dir + trusted_roots) integration
   still work exactly as before — do not assume an unrelated version bump preserved
   them.
5. Confirm the new version ships an MCP-capable Windows binary if that matters at
   the time (as of v0.63.12, `openhuman-core` binaries in GitHub Releases are
   Linux-only — check whether this has changed).

Only if all of the above pass should OpenHuman be promoted back to the primary
local-chat interface in `World_server AI\Launchers\WORLD_SERVER_AI.cmd`. Until then,
this file's existence is itself the record that this is a known, tracked,
intentionally-deferred limitation — not something to silently re-investigate from
scratch in a future session.
