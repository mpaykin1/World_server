# WORK IN PROGRESS — GitHub write-access regression probe + connector-403 diagnosis

## Task
Per the user's explicit point 11 in the safe remote-bridge specification:
diagnose the GitHub Connector 403 root cause conclusively, apply the
minimal-necessary fix (or hand the user exactly one concrete manual action
if the fix requires it), add a regression test proving GitHub write access
genuinely works end-to-end, and record the finding into
`data/error-prevention-registry.json`.

## Why
Earlier this engagement, a Browser ChatGPT GitHub connector hit a 403 when
trying to read/write this repo. The root cause was only inferred, not
conclusively diagnosed or protected with a regression test - this task
closes that gap.

## Current state
- Root cause, as conclusively as it can be determined without the user's own
  GitHub UI access: GitHub Apps default their repository access to "Only
  select repositories" on install. If `World_server` was not explicitly
  selected for the connector's App installation, every API call against
  this repo 403s, independent of anything in this repo's own code or CI.
- **This cannot be confirmed or fixed via the REST API**, even with a
  personal-access-token-authenticated `gh` CLI that has full repo `admin`
  permission on `World_server` (verified this session: `permissions.admin`
  is `true` for this token, yet `GET /user/installations` and
  `GET /repos/{owner}/{repo}/installation` both still require the App's own
  installation/JWT auth and 403 regardless). App-installation repository
  selection is genuinely only visible/editable in GitHub's own web UI
  (Settings -> Applications -> Installed GitHub Apps). This is the one
  concrete manual action for the user - see "Next action".
- Also checked and ruled out: repo collaborators list only shows
  `mpaykin1` (no bot/App user with explicit collaborator access); repo
  events show no chatgpt/openai bot activity at all (consistent with the
  App never successfully reaching this repo, not with a narrower
  permission problem).
- Registered `github-app-connector-403-repo-not-selected` in
  `data/error-prevention-registry.json` with this root cause and the
  concrete fix + verification step.
- Built and verified `scripts/github-write-access-probe.js`: a real,
  repeatable regression test that proves the *official* write path (a
  properly-scoped token going through branch -> commit -> push -> PR ->
  verify -> cleanup, the same flow every AI-authored PR in this repo already
  uses) genuinely works, rather than relying on "it worked last time". Run
  via `npm run github:probe`.
- **Found and fixed a real bug while building the probe itself**: the
  script's cleanup originally did `git checkout master` to return the
  worktree to a "known-good" state. Local branch refs (including `master`)
  are shared across every `git worktree add` worktree of the same
  repository - a stale local `master` ref left over from an earlier
  worktree/session landed this worktree on 338-line-old content instead of
  real `origin/master` after the probe ran once. Fixed by capturing
  `git symbolic-ref --short -q HEAD` (or the exact commit SHA) at script
  start and restoring exactly that on cleanup - never a hardcoded branch
  name. Registered as `git-worktree-shared-local-branch-refs` in the same
  registry file. Re-ran the probe after the fix and confirmed the worktree
  correctly returns to its own prior branch.
- Ran the probe for real twice against the live repo (before and after the
  fix): both times it created a real branch, committed a real probe file,
  pushed, opened a real PR (#19 on the second run), verified it via the API,
  then closed the PR and deleted the branch - `[GITHUB_WRITE_ACCESS_PROBE]
  PASS` both times, fully cleaned up (confirmed via `git ls-remote` showing
  no leftover probe branch).

## Target state
- `data/error-prevention-registry.json` has a permanent record of the 403
  root cause, so a future session hitting the same symptom doesn't have to
  re-diagnose it from scratch.
- `npm run github:probe` is available as a standing, reusable regression
  test - for this session's own credentials, and equally usable by any
  future properly-scoped credential (including the connector itself, once
  the user adds repo access) to prove write access actually works, not just
  that an App shows as "installed".

## Files / systems involved
- `scripts/github-write-access-probe.js` (new)
- `data/error-prevention-registry.json` (2 new entries)
- `package.json` (`github:probe` script)

## Known risks
- The probe script performs real, live branch/commit/push/PR/close/delete
  operations against the real repo every time it runs. It is self-cleaning
  (tested twice), scoped to a uniquely-timestamped throwaway branch/file
  each run, and never touches any existing branch or file - but it is not a
  dry-run, by design (a read-only check would not actually prove write
  access).

## Golden systems that must be preserved
Untouched by this change - no app/game code modified.

## Errors that must not return
- GitHub Connector 403 being re-diagnosed from scratch in a future session
  instead of being looked up in `data/error-prevention-registry.json`.
- A future script assuming `git checkout master` (or any bare branch name)
  safely returns a worktree to a known-good state.

## Exact patch / change plan
Single new script + two registry entries + one npm script line. No other
files touched.

## Tests to run
- `node --test` (full suite): 145/145 PASS (after `npm install` in this
  freshly created worktree, which had no `node_modules` yet).
- `npm run release:gate`: running in background at time of writing this
  entry; result to be recorded before push.
- `npm run github:probe`: PASS (run twice, live, including after the
  worktree-ref bug fix).

## Deployment / PR plan
`ai/desktop/github-write-access-probe` -> `master`. Merge once this PR's own
checks are green (pre-existing unrelated red on master, e.g. the
`hud-visual-audit`/`golden-controls`/`perceptual-visual` Playwright suite
for `ai3d-voxel-city`/`voxel-world`/`catalog`, confirmed present on master's
own current HEAD before PR #18 too, is acceptable per PR #16/#17/#18
precedent).

## Current progress
Probe script built, bug found and fixed, verified live twice. Registry
entries added. `release:gate` running.

## Next action
Wait for `release:gate` to finish, commit, push, open PR, wait for CI,
merge. Then hand the user the one concrete manual action from the registry
entry: open https://github.com/settings/installations (or the org
equivalent), find the ChatGPT/Browser AI connector's GitHub App, and under
Repository access add `World_server` (or switch to All repositories) -
this is the one step that requires the user's own GitHub UI access and
cannot be done via API by this session.

## Completion criteria
PR merged; registry entries in place; `npm run github:probe` available and
proven working; user has the one concrete manual action needed to actually
close the connector's 403 (verifying that fix itself is out of this
session's reach until the user performs it - re-running the probe cannot
substitute for the connector's own credential, only for proving what the
*official* write path is capable of).

## Final evidence
- `node --test`: 145/145 PASS.
- `npm run github:probe`: PASS x2 (live, real PR opened/closed each time -
  PR #19 on the fix-verification run).
- `release:gate`: pending at time of writing, to be updated before push.
