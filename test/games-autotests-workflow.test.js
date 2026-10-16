'use strict';
// AGENTS.md §21.5: the owner's game link is opened in a real browser right before it is sent.
// Agents whose own browser cannot reach the site (Claude's and ChatGPT's sandboxes block it)
// dispatch Games autotests with the link; the live-link job opens it on desktop and phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const file = path.join(__dirname, '..', '.github', 'workflows', 'games-autotests.yml');
const workflow = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.CORE_SCHEMA });

test('a dispatch with a link runs only the live-link check', () => {
  assert.equal(workflow.on.workflow_dispatch.inputs.url.required, false);
  assert.equal(workflow.on.workflow_dispatch.inputs.url.default, '');
  assert.equal(workflow.jobs.autotests.if, "${{ github.event_name != 'workflow_dispatch' || inputs.url == '' }}");
  assert.equal(workflow.jobs['live-link'].if, "${{ github.event_name == 'workflow_dispatch' && inputs.url != '' }}");
  assert.ok(workflow.on.pull_request.paths.includes('games/**'), 'PRs in games/** still run the game checks');
});

test('the live link reaches the script through env, never inlined into it', () => {
  const step = workflow.jobs['live-link'].steps.find((s) => s.env && s.env.LINK);
  assert.equal(step.env.LINK, '${{ inputs.url }}');
  assert.doesNotMatch(step.run, /\$\{\{/, 'no expression may be expanded inside the script');
  assert.match(step.run, /LINK = os\.environ\["LINK"\]\.strip\(\)/);
  assert.match(step.run, /scheme != "https"/, 'only https links are opened');
});

test('the live-link verdict needs a started game, a clean console and no host error page', () => {
  const run = workflow.jobs['live-link'].steps.find((s) => s.env && s.env.LINK).run;
  assert.match(run, /"desktop": \{"viewport": \{"width": 1280, "height": 720\}\}/);
  assert.match(run, /"phone": \{"viewport": \{"width": 390, "height": 844\}, "is_mobile": True, "has_touch": True/);
  assert.match(run, /window\.__isle\.startGame\(\)/);
  assert.match(run, /ok = 200 <= status < 300 and not marker and state == "play" and not errors/);
  for (const marker of ['site not found', 'page not found', 'deployment_not_found']) assert.ok(run.includes(marker), marker);
  assert.match(run, /::notice/);
  assert.match(run, /::error/);
});
