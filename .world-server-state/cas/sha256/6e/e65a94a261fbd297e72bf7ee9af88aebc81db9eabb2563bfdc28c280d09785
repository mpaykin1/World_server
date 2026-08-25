#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const planPath = path.join(ROOT, 'QUALITY_IMPROVEMENT_PLAN.json');
const policyPath = path.join(ROOT, 'data/self-improvement-policy.json');

if (!fs.existsSync(planPath) || !fs.existsSync(policyPath)) {
  console.log('[ENRICH_PLAN] no plan or policy');
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

plan.tasks = (plan.tasks || []).map(task => ({
  ...task,
  selfImprovementPolicy: {
    priorities: policy.priorities,
    animationRules: policy.animationRules,
    visualRules: policy.visualRules,
    safetyRules: policy.safetyRules
  }
}));

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
console.log(`[ENRICH_PLAN] tasks=${plan.tasks.length} policy=${policy.schemaVersion}`);
