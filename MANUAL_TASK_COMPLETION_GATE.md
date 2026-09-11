# MANUAL TASK COMPLETION GATE

This policy applies to every AI agent and automation working on a manual user request for World_server.

## Core rule

A manual task is not complete at analysis, code generation, commit, PR, build start, deploy start, or report generation. The task remains active until the requested user-visible behavior is verified live, or a genuine owner-only blocker is reached.

## Mandatory execution loop

1. Inspect current production/live state.
2. Implement the requested change.
3. Run required checks.
4. Commit and push through the repository's normal safe workflow.
5. Deploy through the current production pipeline.
6. Verify the exact production SHA / URL and the requested user-visible behavior.
7. If any step fails, treat that failure as part of the same task, repair it, and continue from the failed step.
8. Repeat until the delivery gate passes.

## Non-terminal states

The following are never valid stopping conditions by themselves:

- blocker discovered;
- CI failure;
- deploy failure;
- broken live link;
- missing dependency/config that the agent can repair;
- test failure;
- intermediate commit or PR;
- diagnostics/report/status summary;
- a percentage estimate without live evidence;
- temporary tool failure when another available route can continue the task.

## Only valid early stop: OWNER_BLOCKED

The agent may stop before live verification only when exactly one unavoidable owner-only action is required, for example:

- OAuth or login confirmation;
- CAPTCHA;
- payment or billing approval;
- secret/credential value that only the owner can provide;
- provider UI permission/domain toggle not writable by available tools.

When OWNER_BLOCKED, ask the user for one concrete click/action only. After it is completed, resume the same task and continue to live verification.

## Delivery gate

A final response to a manual implementation request is allowed only in one of two states:

### PASS

All of the following are true:

- requested change is implemented;
- required tests/checks passed;
- production deployment completed;
- exact live URL is verified;
- requested user-visible behavior is verified on the live version;
- any requested before -> after metrics are based on verified evidence.

### OWNER_BLOCKED

Exactly one unavoidable owner action prevents PASS.

## No intermediate reports by default

During a manual task, agents must not emit progress-only responses such as "working", "prepared", "found the issue", "deployed but not verified", or a percentage-only status unless the user explicitly asks for progress. Continue working until PASS or OWNER_BLOCKED.

## Regression rule

Every failure that previously caused an agent to stop before delivery should, where feasible, become regression protection in code, CI, deployment checks, or agent policy so the same failure mode is less likely to recur.
