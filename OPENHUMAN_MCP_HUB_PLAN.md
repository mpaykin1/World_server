# OpenHuman-as-MCP-Hub — architecture & security plan (Phase F)

Planning document only. Nothing in this file has been built, installed, or connected —
per the explicit instruction, a `cargo build` only happens after separate, explicit
permission, and only after this plan is reviewed.

## MCP_BUILD_REQUIRED = YES

Discovery results (Phases D and E, both evidence-based, not assumed):

- **Bundled/installed `openhuman-core` binary: NOT FOUND.** Searched `C:\Program Files\OpenHuman\`,
  `%LOCALAPPDATA%\OpenHuman`, `%APPDATA%\OpenHuman`, `%USERPROFILE%\.openhuman\` — no standalone
  core/CLI/MCP binary anywhere. Confirmed by the runtime log itself: `[core] spawning embedded
  in-process core server on preferred port 7788` — the core runs inside `OpenHuman.exe`, it is
  not a separate process on Windows.
- **Official Windows standalone core binary: NOT FOUND.** Checked `tinyhumansai/openhuman`'s
  GitHub Releases (public repo, verified via `gh repo view`) for the latest tag, v0.63.12
  (2026-08-07). Release assets include `openhuman-core-0.63.12-x86_64-unknown-linux-gnu.tar.gz`
  and the `aarch64` equivalent, each with a `.sha256` — **Linux only**. Windows assets are only
  the full GUI installer (`x64-setup.exe`, `x64_en-US.msi`, 169–232MB) — no lightweight
  standalone core.

Since both A (bundled) and B (official Windows binary) are confirmed absent, condition C
("MCP genuinely requires a separate binary") is the only remaining question, and building would
be the only way to get one on this machine.

**If a build is authorized in a future cycle, here is what it would mean:**

| | |
|---|---|
| Repository | `https://github.com/tinyhumansai/openhuman` (public, verified legitimate) |
| Target | `cargo build --release --bin openhuman-core` — the same source the Linux release binary already ships (Windows target is just uncommon in their release matrix, not unsupported in source) |
| Commit/tag | Recommend pinning to the `v0.63.12` tag (matches the installed GUI version) rather than `main`, unless the toolpacks fix (see `OPENHUMAN_UPSTREAM_TOOLPACKS_INVESTIGATION.md`) is specifically wanted — that work is unreleased and still in flux as of 2026-08-31 |
| What the binary gets | Whatever `openhuman-core mcp` exposes over stdio to whatever process launches it — in this case, that would be Claude Desktop (a separate app, not this session — see below) |
| Risk | Building from source means compiling and then running code this session has not read line-by-line; the binary would run with this Windows user's permissions, same as the installed GUI does today |
| Mitigation if approved | Verify against the pinned tag's commit SHA before building; do not build from `main`/an arbitrary branch; review `Cargo.toml` for the `openhuman-core` bin target's actual dependency surface before compiling if feasible |

## Tool surface classification (from the `/schema` endpoint discovery earlier this session, not
from the un-built MCP server — the MCP surface is presumed similar but not yet confirmed identical)

| Tool | Class | Notes |
|---|---|---|
| `memory.search`, `memory.recall`, `tree.browse`, `tree.read_chunk`, `tree.top_entities`, `tree.list_sources` | READ-ONLY | Query agentmemory/tree — no mutation |
| `core.list_tools`, `core.tool_instructions` | READ-ONLY | Discovery only |
| `agent.list_subagents` | READ-ONLY | Enumeration |
| `agent.run_subagent` | HIGH RISK | Executes an arbitrary sub-agent with whatever tool access that sub-agent's profile has — this is the one that, as this session already found (`tools_agent`'s `file_write`), can perform real filesystem writes. Do not include in an initial allowlist. |

**Recommended initial World_server MCP profile, if this is ever wired up:**
`memory.search`, `memory.recall`, `tree.browse`, `tree.read_chunk`, `tree.top_entities`,
`tree.list_sources`, `core.list_tools` — read-only, matches section 13's own recommendation.
Add `agent.run_subagent` only after a dedicated review of what that sub-agent's own tool
allowlist would be, since it is the actual side-effect-capable path.

## Why editing `claude_desktop_config.json` would not have worked anyway

`%APPDATA%\Claude\claude_desktop_config.json` configures **Claude Desktop**, a separate
application from this session. This session runs inside whatever launched it (a CLI/SDK
host), not Claude Desktop. Editing that file:
- would not give **this** session (or any Claude Code session) a new tool,
- would only take effect if the user separately opens the Claude Desktop app,
- and even then, only after Claude Desktop itself performs a real MCP `initialize` +
  `tools/list` handshake with the (currently nonexistent) binary — never assume
  "config file written" == "MCP CONNECTED".

If MCP access for **this** session specifically is ever wanted, that is a different mechanism
entirely (this session's own MCP client configuration, not Claude Desktop's), and is a separate
question from whether `openhuman-core mcp` exists at all.

## Multi-client architecture (target state, not yet built)

```
Claude Desktop ─┐
Codex           ─┤── MCP ──▶ openhuman-core mcp ──▶ agentmemory (shared memory)
OpenCode        ─┘                               ──▶ Ollama (local inference)
                                                  ──▶ World_server (read-only action_dir)
```

Each client speaks MCP to the same `openhuman-core` process; none gets its own separate memory.
Codex/OpenCode config templates should follow the same shape as whatever Claude Desktop's ends
up being, once a real binary exists to point at — not written speculatively before that, per the
existing "no config for a target that doesn't exist yet" discipline this session has held.

## Status

Phase D: closed (NOT FOUND, evidenced).
Phase E: closed (NOT FOUND, evidenced).
Phase F: this document — closed as a plan; not a build authorization.
Phase G (build): **not started, not authorized**. Requires a separate, explicit user decision
after reading this document.
