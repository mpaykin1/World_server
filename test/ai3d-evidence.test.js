'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

function py(code) {
  const res = spawnSync('python', ['-c', code], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  return res;
}

// Negative tests — must FAIL (enforce throws)
test('UNTESTED + percent=85 -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Depth Accuracy %":{"status":"UNTESTED","percent":85,"reason":"x"}}})
    print("should fail")
    sys.exit(0)
except ValueError as e:
    print("caught", e)
    sys.exit(1)
`);
  assert.equal(r.status, 1, r.stdout + r.stderr);
});

test('ESTIMATED + percent=80 -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Depth Accuracy %":{"status":"ESTIMATED","percent":80,"estimatedPercent":80,"basis":["x"]}}})
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('VERIFIED without evidence -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Geometry Integrity %":{"status":"VERIFIED","percent":100}}})
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('placeholder + Real Image->3D 85 -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Real Image->3D Artifact %":{"status":"VERIFIED","percent":85,"evidence":["PLACEHOLDER -- NOT REAL 3D RECONSTRUCTION"],"isPlaceholder":True}}})
    sys.exit(0)
except ValueError as e:
    print(e)
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('Godot VERIFIED without runtime -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Godot Runtime Compatibility %":{"status":"VERIFIED","percent":100,"evidence":["package ready"]}}})
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('Silhouette VERIFIED without render-back -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Silhouette Accuracy %":{"status":"VERIFIED","percent":90,"evidence":["some basis"]}}})
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('Depth Accuracy VERIFIED without ground truth -> FAIL', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"Depth Accuracy %":{"status":"VERIFIED","percent":90,"evidence":["depth map exists"]}}})
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});

// Positive tests — must PASS
test('GLB validity VERIFIED + concrete evidence -> PASS', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{
  "Geometry Integrity %":{"status":"VERIFIED","percent":100,"evidence":["vertexCount=8192","faceCount=15876"]},
  "GLB Validity %":{"status":"VERIFIED","percent":100,"evidence":["glTF magic OK","zDepth=0.85"]},
  "Real Image->3D Artifact %":{"status":"VERIFIED","percent":100,"evidence":["not placeholder","vertexCount=8192"]},
  "Depth Accuracy %":{"status":"UNTESTED","reason":"No ground-truth depth comparison available"},
  "Silhouette Accuracy %":{"status":"UNTESTED","reason":"No render-back comparison available"},
  "Structural Similarity %":{"status":"UNTESTED","reason":"No render-back comparison available"},
  "Texture Quality %":{"status":"UNTESTED","reason":"No render-back comparison available"},
  "Godot Runtime Compatibility %":{"status":"UNTESTED","reason":"Godot runtime not launched"},
  "Voxel Runtime Compatibility %":{"status":"UNTESTED","reason":"Voxel runtime not launched"},
  "Overall Quality %":{"status":"UNTESTED","reason":"Critical visual metrics are UNTESTED"}
}})
print("pass")
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('pipeline completion VERIFIED 100 + completed stages evidence -> PASS', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import verified
v = verified(100, evidence=["depth stage completed","geometry stage completed","glb export completed"])
print(v)
assert v["status"]=="VERIFIED" and v["percent"]==100
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
