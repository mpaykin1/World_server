#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const load=r=>{const p=path.join(ROOT,r);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null};
const score=load('data/quality-scorecard.json');
const metrics=score?.metrics||{};
const overall=Math.round(Object.values(metrics).reduce((a,m)=>a+Number(m.percent||0),0)/Math.max(1,Object.keys(metrics).length));
const report={
 generatedAt:new Date().toISOString(),
 candidateStatus:score?.candidateStatus||'UNKNOWN',
 overallPercent:overall,
 metrics,
 technologyUsage:score?.technologyUsage||{},
 regression:load('QUALITY_REGRESSION_REPORT.json'),
 projectReview:load('PROJECT_QUALITY_REVIEW.json'),
 evidenceScore:load('EVIDENCE_QUALITY_REPORT.json'),
 duplicateReview:load('DUPLICATE_SYSTEM_REPORT.json'),
 systemContracts:load('SYSTEM_CONTRACT_REPORT.json'),
 technologyRuntime:load('TECHNOLOGY_RUNTIME_HEALTH.json'),
 visualBaselines:load('VISUAL_BASELINE_REPORT.json'),
 growthBacklog:load('QUALITY_GROWTH_BACKLOG.json'),
 improvementPlan:load('QUALITY_IMPROVEMENT_PLAN.json'),
 trend:load('QUALITY_TREND_REPORT.json'),
 appMatrix:load('APP_QUALITY_MATRIX.json'),
 testGaps:load('TEST_GAP_MANIFEST.json'),
 promotionCandidate:load('QUALITY_PROMOTION_CANDIDATE.json'),
 autoFix:load('AUTOFIX_REPORT.json'),
 technologyOrchestrator:load('TECHNOLOGY_ORCHESTRATOR_REPORT.json'),
 realDevices:load('REAL_DEVICE_REPORT.json'),
 goldenAssets:load('GOLDEN_ASSET_REPORT.json'),
 issueCandidates:load('QUALITY_ISSUE_CANDIDATES.json'),
 productionQuality:load('PRODUCTION_QUALITY_REPORT.json'),
 impactGraph:load('QUALITY_IMPACT_GRAPH.json'),
 changeImpact:load('QUALITY_CHANGE_IMPACT.json'),
 patchSynthesis:load('QUALITY_PATCH_SYNTHESIS_REPORT.json'),
 visualPerceptual:load('VISUAL_PERCEPTUAL_REPORT.json'),
 evolutionCycle:load('QUALITY_EVOLUTION_CYCLE.json'),
 goldenPropagation:load('GOLDEN_PROPAGATION_REPORT.json'),
 governance:load('QUALITY_REPORT.json')
};
fs.writeFileSync(path.join(ROOT,'QUALITY_MASTER_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[QUALITY_MASTER_REPORT] overall=${overall}% status=${report.candidateStatus}`);
