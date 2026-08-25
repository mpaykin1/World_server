'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {auditOverlaps,discoverTechnologies}=require('../scripts/system-cohesion-engine.js');

test('system cohesion has no medium overlaps',()=>{
  const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/system-cohesion-registry.json'),'utf8'));
  const overlaps=auditOverlaps(reg);
  const medium=overlaps.filter(o=>o.severity==='medium');
  assert.equal(medium.length,0,`medium overlaps found: ${JSON.stringify(medium,null,2)}`);
});

test('enhancement matrix covers critical pairs',()=>{
  const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/system-cohesion-registry.json'),'utf8'));
  const matrix=reg.enhancementMatrix||[];
  const hasGoldToWorld=matrix.some(m=>m.from==='golden-standard'&&m.to==='world-quality-autopilot');
  const hasWorldToEnsemble=matrix.some(m=>m.from==='world-quality-autopilot'&&m.to==='cpu-visual-ensemble');
  assert.ok(hasGoldToWorld,'golden -> world-quality should be in matrix');
  assert.ok(hasWorldToEnsemble,'world-quality -> cpu-visual-ensemble should be in matrix');
});

test('technology discovery proposes WebGPU with fallback',()=>{
  const reg=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/system-cohesion-registry.json'),'utf8'));
  const discovered=discoverTechnologies(reg);
  const webgpu=discovered.find(d=>d.name==='WebGPU');
  assert.ok(webgpu,'WebGPU should be discovered');
  assert.equal(webgpu.category,'web-api');
  assert.ok(webgpu.proposal.includes('WebGL fallback'),'proposal should mention fallback');
});

test('system cohesion report is generated and has high score',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../SYSTEM_COHESION_REPORT.json'),'utf8'));
  assert.ok(report.cohesionScore>=90,`cohesionScore ${report.cohesionScore} should be >=90`);
  assert.ok(report.enhancementCoverage>=10,'enhancementCoverage should be >=10');
});
