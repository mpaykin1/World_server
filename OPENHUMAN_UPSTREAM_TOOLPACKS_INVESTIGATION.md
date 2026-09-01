# Upstream investigation: local-model tool-catalog overflow (Phase B)

## v0.63.12 (installed) behavior
Confirmed via runtime log (see `data/error-prevention-registry.json#openhuman-local-model-tool-context-overflow`):
every ordinary-chat turn, regardless of model, is offered the full tool catalog (76–315 tools
depending on layer) as part of the prompt. For models without native tool-calling support
(`supports_native_tools=false` — all tested local Ollama models), this catalog is injected as
raw prompt text, producing ~48,750–49,119-token prompts against a 4096-token actual Ollama
runtime context.

## Upstream (unreleased) behavior
Repo: `tinyhumansai/openhuman` (public, verified via `gh repo view`).

A `toolpacks` module has been under active development:

| Date (UTC) | Commit | Message |
|---|---|---|
| 2026-08-21 20:19 | `42538c5b9` | fix(tools): handle missing toolpack directory gracefully |
| 2026-08-21 23:40–23:44 | `16573dcab`, `054aac4fc`, `d624c34cd` | feat/fix(toolpacks): tool registry type aliases |
| 2026-08-22 00:22 | `4dee65de4` | test(toolpacks): external effect + timeout forwarding on `use_skill` |
| 2026-08-23 18:41–19:22 | `b4943fc49`, `b752cd128`, `bde9ba6d8`, `789ab1341` | feat/fix/test(toolpacks): owner field for selective packing, groups module |
| 2026-08-31 12:13 | `369a8f638` | docs: expand prompt token budget plan with disclosure architecture |

A separate design-doc commit (undated exact SHA not captured, found via message search)
explicitly states the goal:

> "Document the structural cost of advertising every tool and compare deferred exposure,
> tool search, skill-based capabilities, and collapsed tool families. Rework the
> implementation plan to prioritize measurement, caching, per-tool disclosure, schema
> reduction, budget-aware injection, and a future Code Mode evaluation."

Mechanism (from commit messages, source not fully read line-by-line — this is a summary of
stated intent, not a verified working implementation): `toolpacks` groups tool families behind
`load_skill`/`use_skill`, gated via `split_packed_tools` in the tool pipeline, "after all other
gates have run" — meaning the model is NOT shown the full catalog by default; packed families
are loaded on demand. Related, separately-landed token-reduction fixes in the same period:
compact (not pretty-printed) JSON tool-schema serialization (~1/3 fewer tokens), and removal of
redundant per-field prose descriptions in a delegation envelope schema (was 39% of the
orchestrator's tool-schema budget on its own).

## Exact architectural difference
v0.63.12 predates the entire `toolpacks` effort by 2 weeks (released 2026-08-07; toolpacks work
started 2026-08-21). **No tagged release exists yet that includes this work** — checked via
`gh release list`, v0.63.12 (2026-08-07) is still the most recent tag as of this investigation.
A safe "upgrade to a newer official release" (Option A from the earlier local-chat-hang
diagnosis) is therefore **not currently available** — there is nothing to upgrade to.

## What this does NOT mean
This is not a verified, working fix this session tested — it's evidence that upstream
recognizes and is actively addressing the same problem class, sourced from commit messages
only (the actual `toolpacks` source was not read in full; no build was performed). Treat
"toolpacks would fix this" as a plausible, well-evidenced hypothesis, not a confirmed fact,
until either an official release ships it or someone builds and tests the relevant commit.

## Recommendation
Do not build from this unreleased commit range without separate explicit permission (per the
established build-only-with-permission boundary). Two realistic paths:
1. **Wait** for an official release that includes the toolpacks work, then upgrade normally
   (OpenHuman's own auto-update, already enabled, will pick this up once it ships).
2. **Selective tool routing as a World_server-side mitigation is not possible** — tool
   catalog composition is entirely inside OpenHuman's own agent harness, not something
   this repo's code can influence. The only real World_server-side mitigation remains what
   is already in place: keep local Ollama models scoped to non-agentic workloads
   (embeddings) and use OpenRouter/free for full agentic chat until toolpacks ships.
