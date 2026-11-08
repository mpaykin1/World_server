# REA internal MCP integration — 2026-11-08
Task: Add the official pinned REA agent bridge to World_server for authorized internal AI work.
Why: Allow static JavaScript inspection of our own code with a reusable private MCP integration.
Current state: World_server has its own public META GAMES MCP, but REA is not configured in this checkout.
Target state: REA v6.8.0 available to local Claude Code/Codex agents via stdio; repeatable installation/handshake in isolated GitHub Actions.
Files / systems involved: project MCP client configs, REA smoke runner, opt-in GitHub Actions; no public endpoints, games, assets, existing MCP workers or 5 scheduled automations changed.
Known risks: REA MCP is local stdio, not a hardened public service. It requires Node 24.22.1+; older 24.x local runtimes cannot start it. Package download needs npm network.
Golden systems that must be preserved: Existing Meta Games MCP 8 tools, game donors/rights allowlist, Cloudflare/Render/Vercel deployments, user controls, graphics, all production services.
Errors that must not return: Unauthenticated remote REA exposure, unpinned installation, mutation of master, use of third-party games as donors.
Exact patch / change plan: project-scoped stdio registration for Claude Code and Codex; pinned npm package; self-contained JSON-RPC initialize + tools/list smoke; isolated workflow install and static JavaScript analysis.
Tests to run: CI workflow bootstrap; existing repository checks on PR. Local execution unavailable through GitHub connector.
Deployment / PR plan: feature branch -> PR to master; no production deployment. Merge only when required checks pass.
Current progress: Branch created; integration in progress.
Next action: Add configuration/runner/workflow, open PR, review workflow outcome.
Completion criteria: REA MCP responds to initialize and exposes tools in CI on exact PR head; no public listener added. A local agent still needs a supported Node runtime and must approve project MCP.
Final evidence: Pending workflow/PR results; no runtime verification claimed yet.
