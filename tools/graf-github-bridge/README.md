# GRAF GitHub Bridge 1.0

Independent Node.js GitHub App relay for **mpaykin1/World_server** and **mpaykin1/meta6**. The bridge is a *separate service*, **not a new game engine or an additional AKA scheduled task**. World Server `master`, accepted games, the five AKA tasks, and their 50/50 CLEAN_SERVER / GRAPHICS allocation remain untouched.

## What is implemented

- GitHub App installation-token authentication; no personal access token committed.
- Repository allowlist, authenticated REST API, 6 narrowly scoped write actions.
- Durable **single-writer** JSON queue on persistent volume, recovery after process restart, bounded retries with exponential backoff and GitHub rate-limit handling.
- Safe deduplication of issue/PR/comment creates with a hidden per-job marker, scan reconciliation before any retry. **If reconciliation is uncertain, block instead of duplicating.**
- Docker Compose with HTTPS reverse proxy Caddy, zero external Node/npm dependencies.
- `cli.mjs` command-line client and `mcp.mjs` local **stdio MCP connector** for Codex and Claude Code.
- Diagnostic endpoint checks actual GitHub App access to repository, Issues and PRs. It **does not perform write operations**.
- Tests with mocked GitHub (no live writes).

## What is not done automatically

This code does **not** create a GitHub App, issue hosting/DNS credentials, install an app, or deploy a live bridge. It cannot change the managed proxy used by ChatGPT or make ChatGPT Cloud automations directly call an arbitrary remote server. Desktop agents can use this bridge via the MCP adapter **only if their execution environment can reach the Bridge URL**. A hosted ChatGPT integration needs an additional approved remote connector.

## GitHub App initial setup (user-controlled, one time)

1. Open **https://github.com/settings/apps/new** (GitHub → Settings → Developer settings → GitHub Apps → New GitHub App).
2. Name `GRAF GitHub Bridge`; set a valid Homepage URL and leave webhooks **disabled** (not needed for polling queue). Choose installation availability **Only on this account**.
3. Repository permissions: **Metadata: Read**, **Contents: Read**, **Issues: Read and write**, **Pull requests: Read and write**. No Administration permission needed. App permissions are independent from the user's admin rights.
4. Create App; copy numeric **App ID**. Generate a private key and store it locally as `github-app.pem` (never commit/share it).
5. Install App **only** on `World_server` and `meta6`; find numeric **Installation ID** on the installation settings URL.
6. Securely configure `.env` from `.env.example`. Generate random bearer token (`openssl rand -hex 32`), record it in `BRIDGE_API_TOKEN`. Never paste credentials into ChatGPT.

## Hosting (Linux server / VPS with Docker)

1. Point DNS for `bridge.example.com` (your actual name) to VPS public IP. Allow TCP 80/443; on VPS, verify HTTPS outbound access to `api.github.com`.
2. Put this directory on the VPS. Copy `.env.example` to `.env`; fill `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `BRIDGE_API_TOKEN`, `ALLOWED_REPOS`, and `BRIDGE_DOMAIN`. Copy the private key to `./github-app.pem` outside version control.
3. Run `docker compose up -d --build` from this directory. Caddy requests and renews TLS automatically.
4. Verify locally: `docker compose exec bridge node cli.mjs diagnostics mpaykin1/World_server`; repeat for `mpaykin1/meta6`.
5. Verify externally from each agent host using `BRIDGE_URL=https://<your-domain>` and `BRIDGE_API_TOKEN` securely provisioned: `node cli.mjs diagnostics mpaykin1/World_server`.

**Local Windows/PC mode** (not remotely accessible by default): install Node.js >=22, set environment variables and `GITHUB_APP_PRIVATE_KEY_PATH`, use `HOST=127.0.0.1`, `PORT=8765`, `BRIDGE_DATA_FILE=./data/queue.json`, run `node bridge.mjs`. No Docker or VPS is required for local-only use. For 24/7 multi-agent use, prefer a remote host and HTTPS.

## API

All `/v1` routes require `Authorization: Bearer $BRIDGE_API_TOKEN`.

`GET /health/live` — process health (unauthenticated; no secrets).

`GET /health/ready` — service local readiness, not GitHub API connectivity.

`POST /v1/diagnostics` — body `{"repo":"mpaykin1/World_server"}` checks remote reads and install-token functionality.

`POST /v1/jobs` — requires **stable** `Idempotency-Key` header. This is the primary write interface. The request is queued and returns a job ID.

```json
{
  "repo":"mpaykin1/World_server",
  "action":"create_pr",
  "payload":{
    "title":"feat: isolated improvement",
    "head":"ai/example-branch",
    "base":"master",
    "body":"What changed, exact SHA, tests, evidence",
    "draft":true
  }
}
```

Other `action` values and payloads:

- `create_issue`: `{title,body}`
- `update_issue`: `{issue_number,title?,body?,state?}`
- `comment_issue`: `{issue_number,body}` (also posts a comment on a PR conversation)
- `update_comment`: `{comment_id,body}` (for in-place ledger updates)
- `create_pr`: `{title,head,base,body?,draft?}`
- `update_pr`: `{pr_number,title?,body?,base?,state?}`

`GET /v1/jobs/<job_id>` — statuses: `queued`, `running`, `done`, `blocked`; `GET /v1/jobs?limit=20` — recent status. When blocked, inspect the error and handle explicitly. **Do not auto-merge PRs.**

CLI (from same directory, with `BRIDGE_URL` and `BRIDGE_API_TOKEN` in environment):

```bash
node cli.mjs diagnostics mpaykin1/World_server
node cli.mjs submit example-job.json stable-task-20261017-001
node cli.mjs list
node cli.mjs status <job-id>
```

Use a stable `Idempotency-Key` on retries; never automatically generate a different one for the same logical change.

## Agent MCP connection

Run the MCP server with `node /full/path/to/graf-github-bridge/mcp.mjs`. Set environment variables `BRIDGE_URL` and `BRIDGE_API_TOKEN` in the **local agent's secured MCP configuration**. It provides `graf_submit_job`, `graf_job_status`, `graf_recent_jobs`, and `graf_diagnostics`. It uses MCP stdio JSON-RPC. Test actual network reachability from each agent; some sandboxed agents restrict custom network destinations.

## Operational limits / safety

- **One running bridge replica** per queue directory; not cluster-safe. Do **not** run multiple replicas against the same JSON queue. Back up the persistent `bridge-data` volume.
- Actual GitHub write access is not proven until a deliberate harmless write succeeds with the installed App. Read diagnostics do not validate write privileges.
- A remote timeout after GitHub accepted a write can be ambiguous. This bridge performs marker reconciliation for *create* actions; if matching cannot be proven it blocks rather than risking duplicates.
- Rate limits, GitHub outages, missing GitHub App installations or downstream network restrictions can still block operations. No infrastructure eliminates all external failures.
- Do not expose the Node port directly on the internet, only Caddy HTTPS. Use dedicated service credentials; rotate tokens if compromised. Provide agent secrets through environment/secret store, not source files or prompts.
- Check `node --test` before deployment. Process liveness and GitHub API availability are separate diagnostic signals.
- This service does not bypass repository review gates, branch protection, Fleet QA, or user acceptance.
