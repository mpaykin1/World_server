#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const task=process.env.DESKTOP_AI_TASK||process.argv.slice(2).join(' ').trim();
if(!task)throw new Error('usage: npm run desktop-ai:new-task -- "<task>" or DESKTOP_AI_TASK=...');
const now=new Date().toISOString();
const body=`# WORK IN PROGRESS

> Updated ${now}. Mandatory Desktop AI task context.

## Task
${task}

## Why
Document the concrete reason before editing. Desktop AI must replace this sentence with task-specific context.

## Current state
Record the verified starting state, including existing failures and relevant quality percentages.

## Target state
Describe the measurable end state.

## Files / systems involved
- List exact apps/shared systems/data/workflows that may change.

## Known risks
- List likely regressions and blast radius.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- Copy relevant protected IDs from \`data/error-prevention-registry.json\`.

## Exact patch / change plan
1. Inspect current source and impact graph.
2. Apply the smallest compatible change.
3. Add/extend tests.
4. Run all affected gates.
5. Propagate reusable Golden solution if applicable.

## Tests to run
- \`npm run release:gate\`
- \`npm run quality:fuzz\`
- \`npm run quality:stability\`
- \`npm run quality:impact\`
- Playwright affected projects/devices.

## Deployment / PR plan
Task branch -> CI -> PR -> preview/canary -> verified production promotion.

## Current progress
0%

## Next action
Inspect baseline and fill the task-specific sections above before editing.

## Completion criteria
- No accepted metric decreases.
- Required gates PASS.
- All affected apps verified.
- Regression protection added for fixed recurring bugs.
- Golden propagation handled for reusable successes.
- Final evidence recorded.

## Final evidence
Not completed.
`;
fs.writeFileSync(path.join(ROOT,'WORK_IN_PROGRESS.md'),body);
console.log(`[DESKTOP_AI_TASK] initialized: ${task}`);
