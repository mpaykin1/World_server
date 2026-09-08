# Universal AI Onboarding + Connections — World_server

## Goal
Any new ChatGPT account, browser AI, cloud agent, desktop agent, or future AI should be able to join `World_server` with minimal owner effort, learn the canonical project rules, verify its actual tool access, and communicate with the existing agent fleet through the single canonical AI Bridge.

The target UX is:

1. Give the new AI one bootstrap instruction.
2. It reads `AI_START_HERE.md` and `.ai/project-context-index.json` from `master`.
3. It reads `.ai/connection-manifest.json` and checks which required connections it actually has.
4. Already-connected providers are used automatically.
5. If a provider requires OAuth or explicit owner permission, the AI asks for the smallest possible owner action (ideally one Connect/Authorize action for that provider).
6. The AI verifies the connection instead of assuming success.
7. It posts an `AI-BRIDGE HELLO` to GitHub issue #55 and becomes available to the existing coordination system.

## Non-negotiable security rule
Connections are portable; credentials are not.

Never copy ChatGPT session tokens, browser cookies, OAuth refresh tokens, personal access tokens, Supabase service keys, Vercel tokens, device credentials, or other secrets between accounts or into the repository.

Use provider OAuth/Connect, a provider-managed app installation, device authorization, or a server-side World_server gateway backed by an approved secret store. The repository contains only capability metadata and instructions.

## Canonical sources
- `AI_START_HERE.md` — first project context
- `AGENTS.md` — mandatory agent rules
- `.ai/project-context-index.json` — machine-readable context discovery
- `.ai/connection-manifest.json` — machine-readable connector requirements
- `.ai/bridge/README.md` — canonical agent-to-agent coordination protocol
- GitHub issue #55 — canonical bridge conversation surface
- `CLOUD_AI_HANDOFF.md` — cloud continuation/handoff state
- `WORK_IN_PROGRESS.md` — current scoped implementation state when applicable

## Connection levels

### Required for a useful new browser AI
**GitHub** is the primary bootstrap connection because it gives the agent the source of truth, AI Bridge, PRs/issues, and CI evidence.

After GitHub works, the AI Bridge itself requires no separate secret: it uses repository/issue access.

### Conditional connections
Vercel, Supabase, Netlify, Google Drive, PostHog, Neon and similar providers are connected only when the task needs them. A new AI must not block onboarding just because optional providers are absent.

### Local/device connection
Remote Desktop or local agents are a last resort. Normal onboarding must remain cloud/browser-first and must not require the user's PC.

## Capability handshake
After reading the project and checking tools, the new agent posts this to GitHub issue #55:

```text
[AI-BRIDGE HELLO]
agent_name: <human-readable name>
provider: <provider/company>
model_or_product: <product/model if known>
github_access: read | write | none
write_capabilities: <branches/PR/issues/etc>
available_connections: <comma-separated verified providers>
missing_required_connections: <none or list>
limitations: <important restrictions>
ready_for_tasks: yes | no
```

The agent must report verified capabilities only. Never infer access from a prompt or from another account's access.

## Peer communication
Agents do not need direct private chat access to one another. They communicate through shared durable surfaces:

- GitHub issue #55 for bridge messages and structured task ingress;
- `.ai/bridge/tasks.jsonl` for queued task records;
- `.ai/bridge/results.jsonl` for durable results;
- `.ai/bridge/state.json` for bridge checkpoint/lease state;
- branches/PRs for implementation and review evidence.

This lets ChatGPT help another browser AI and vice versa even when the models are hosted by different companies or use different accounts.

## One-click direction
The long-term preferred architecture is a **World_server AI Gateway** exposed through a standard tool protocol such as MCP or another provider-supported tool interface. A new AI would connect to one World_server gateway and receive the project's safe server-side capabilities behind least-privilege authorization.

The gateway must not bypass provider consent requirements. If GitHub, Google, Vercel, Supabase, or another provider requires owner authorization, the gateway should route the owner to a minimal authorization screen and then verify access.

### Gateway responsibilities
- identify the connecting agent/session without trusting self-reported identity for privileged actions;
- expose project context and capability registry;
- proxy only approved World_server operations;
- keep provider secrets server-side;
- enforce least privilege and task-scoped permissions;
- write auditable task/result records to the canonical bridge;
- support revocation;
- never expose raw provider credentials to an AI.

## Bootstrap algorithm for every new AI

1. Resolve `mpaykin1/World_server` and read `master`.
2. Read `AI_START_HERE.md`.
3. Read `.ai/project-context-index.json`.
4. Read `AGENTS.md` sections relevant to the task.
5. Read `.ai/connection-manifest.json`.
6. Enumerate actual available tools/connections in the current AI environment.
7. Match actual capabilities against the manifest.
8. Verify GitHub repo access and issue #55 access.
9. Ask the owner only for missing required authorization that cannot be completed automatically.
10. Post `AI-BRIDGE HELLO` to issue #55.
11. Check current coordination state before claiming work.
12. Use the existing bridge/master coordinator rather than building a duplicate orchestration stack.

## Rules for asking the owner to connect something
- Never ask for a raw secret when OAuth/Connect is possible.
- Never ask the owner to repeat a connection already verified in the current environment.
- Group missing provider authorizations into the smallest possible number of actions.
- Explain exactly what capability each authorization unlocks.
- Verify the authorization immediately after the owner completes it.
- Optional providers never block unrelated work.

## Definition of onboarded
A new AI is considered onboarded only when:
- it has read the canonical project bootstrap files;
- it has verified GitHub access or explicitly reported that GitHub is the blocker;
- it has reported its actual capability set;
- it has read the AI Bridge protocol;
- it has posted or prepared the `AI-BRIDGE HELLO` handshake;
- it agrees to `AGENTS.md`, cloud-first, zero-secrets and Zero-Chaos rules.

Onboarding does **not** imply production deploy permission, permission to merge `master`, or permission to use personal/local resources. Those remain task- and provider-specific.
