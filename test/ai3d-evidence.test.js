'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

function py(code) {
  const res = spawnSync('python', ['-c', code], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  return res;
}

// Helper to build minimal valid report with canonical IDs and structured evidence
const baseEvidence = (overrides = {}) => {
  const base = {
    evidencePolicy: "ai3d-evidence-v1",
    qualityEvidence: {
      pipeline_completion: { status: "VERIFIED", percent: 100, evidence: [{ kind: "stage_completion", stage: "depth", status: "completed", startedAt: 1, finishedAt: 2, artifactSha256: "a".repeat(64), verifier: "pipeline", verifierVersion: "2", passed: true, inputSha256: "b".repeat(64), artifactSha256: "a".repeat(64) }, { kind: "stage_completion", stage: "geometry", status: "completed", startedAt: 1, finishedAt: 2, artifactSha256: "a".repeat(64), verifier: "pipeline", verifierVersion: "2", passed: true, inputSha256: "b".repeat(64), artifactSha256: "a".repeat(64) }, { kind: "stage_completion", stage: "export", status: "completed", startedAt: 1, finishedAt: 2, artifactSha256: "a".repeat(64), verifier: "pipeline", verifierVersion: "2", passed: true, inputSha256: "b".repeat(64), artifactSha256: "a".repeat(64) }, { kind: "stage_completion", stage: "validation", status: "completed", startedAt: 1, finishedAt: 2, artifactSha256: "a".repeat(64), verifier: "mesh_validator", verifierVersion: "2", passed: true, inputSha256: "b".repeat(64), artifactSha256: "a".repeat(64) }] },
      geometry_integrity: { status: "VERIFIED", percent: 100, evidence: [{ kind: "geometry_integrity", inputSha256: "a".repeat(64), artifactSha256: "b".repeat(64), verifier: "mesh_validator", verifierVersion: "2", measurement: { vertexCount: 8192 }, threshold: { minVertexCount: 100 }, passed: true }] },
      glb_validity: { status: "VERIFIED", percent: 100, evidence: [{ kind: "glb_validation", inputSha256: "a".repeat(64), artifactSha256: "b".repeat(64), verifier: "glb_validator", verifierVersion: "2", measurement: {}, threshold: {}, passed: true }] },
      volumetric_artifact_integrity: { status: "VERIFIED", percent: 100, evidence: [{ kind: "artifact_measurement", inputSha256: "a".repeat(64), artifactSha256: "b".repeat(64), verifier: "mesh_validator", verifierVersion: "2", measurement: { vertexCount: 8192 }, threshold: { minVertexCount: 100 }, passed: true }], isPlaceholder: false },
      image3d_correspondence: { status: "UNTESTED", reason: "No render-back" },
      depth_accuracy: { status: "UNTESTED", reason: "No ground truth" },
      silhouette_accuracy: { status: "UNTESTED", reason: "No render-back" },
      structural_similarity: { status: "UNTESTED", reason: "No render-back" },
      texture_quality: { status: "UNTESTED", reason: "No render-back" },
      godot_runtime_compatibility: { status: "UNTESTED", reason: "Godot not tested" },
      voxel_runtime_compatibility: { status: "UNTESTED", reason: "Voxel not tested" },
      overall_visual_quality: { status: "UNTESTED", reason: "Critical metrics untested" },
    }
  };
  // Apply overrides
  for (const [k, v] of Object.entries(overrides)) {
    base.qualityEvidence[k] = v;
  }
  return JSON.stringify(base);
};

// Negative tests — must FAIL
test('UNTESTED + percent=85 -> FAIL', () => {
  const r = py(`import sys, json; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; e=${baseEvidence({ depth_accuracy: { status: "UNTESTED", percent: 85, reason: "x" } })}; enforce_evidence_report(e)`);
  assert.equal(r.status, 1, r.stdout + r.stderr);
});
test('ESTIMATED + percent=80 -> FAIL', () => {
  const r = py(`import sys, json; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; e=${baseEvidence({ depth_accuracy: { status: "ESTIMATED", percent: 80, estimatedPercent: 80, basis: ["x"] } })}; enforce_evidence_report(e)`);
  assert.equal(r.status, 1);
});
test('VERIFIED without evidence -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"geometry_integrity":{"status":"VERIFIED","percent":100}}})`);
  assert.equal(r.status, 1);
});
test('placeholder + volumetric 85 -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":85,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":False}],"isPlaceholder":True},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})`);
  assert.equal(r.status, 1);
});
test('Godot VERIFIED without runtime -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"godot_runtime","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","godotExecutable":"godot","exitCode":0,"importLogSha256":"abc","outputSha256":"def","passed":True}]},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})`);
  // This should actually PASS if evidence is correct, but we test without runtime evidence
  const r2 = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"godot_runtime","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","passed":True}]},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
});
test('Silhouette VERIFIED without render-back -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"VERIFIED","percent":90,"evidence":[{"kind":"silhouette_accuracy","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('Depth Accuracy VERIFIED without ground truth -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"VERIFIED","percent":90,"evidence":[{"kind":"depth_accuracy","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('Unknown metric ID -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"},"Amazing AI Quality":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('Missing required metric -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('Empty qualityEvidence -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('VERIFIED without structured evidence -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":["just a string"]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('Fake GLB with vertexCount 100000 but empty buffer -> FAIL via validation', () => {
  const r = py(`
import sys, tempfile, json, struct
from pathlib import Path
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.validation import validate_glb
# Create fake GLB with lying accessor counts but empty buffer
import json, struct
gltf = {"asset":{"version":"2.0","generator":"fake"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1}]}],"accessors":[{"bufferView":0,"componentType":5126,"count":100000,"type":"VEC3"},{"bufferView":0,"componentType":5126,"count":100000,"type":"VEC2"},{"bufferView":1,"componentType":5125,"count":300000,"type":"SCALAR"}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":0},{"buffer":0,"byteOffset":0,"byteLength":0}],"buffers":[{"byteLength":0}]}
json_bytes = json.dumps(gltf).encode()
json_pad = (4 - len(json_bytes)%4)%4
json_bytes += b' '*json_pad
bin_data = b''
glb_len = 12+8+len(json_bytes)+8+len(bin_data)
header = struct.pack("<4sII", b"glTF", 2, glb_len)
jchunk = struct.pack("<II", len(json_bytes), 0x4E4F534A)+json_bytes
bchunk = struct.pack("<II", len(bin_data), 0x004E4942)+bin_data
p = Path(tempfile.mktemp(suffix=".glb"))
p.write_bytes(header+jchunk+bchunk)
try:
    validate_glb(p)
    print("should fail")
    sys.exit(0)
except ValueError:
    print("caught fake glb")
    sys.exit(1)
`);
  assert.equal(r.status, 1, r.stdout + r.stderr);
});
test('Solid red image should not get Image3D Correspondence VERIFIED 100', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
# Try to cheat: solid red -> fake volumetric but claim correspondence
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    sys.exit(0)
except ValueError:
    sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('House -> random cube should not get correspondence VERIFIED', () => {
  const r = py(`
import sys
sys.path.insert(0,'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
# Same as above — geometry may be valid but correspondence must be UNTESTED without render-back
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});

test('ESTIMATED without basis -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"ESTIMATED","estimatedPercent":80},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
test('UNTESTED with estimatedPercent -> FAIL', () => {
  const r = py(`import sys; sys.path.insert(0,'services/ai3d-worker'); from ai3d.evidence import enforce_evidence_report; 
try:
    enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v1","qualityEvidence":{"pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},"geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{},"threshold":{},"passed":True}]},"image3d_correspondence":{"status":"UNTESTED","reason":"x"},"depth_accuracy":{"status":"UNTESTED","reason":"x"},"silhouette_accuracy":{"status":"UNTESTED","reason":"x"},"structural_similarity":{"status":"UNTESTED","reason":"x"},"texture_quality":{"status":"UNTESTED","reason":"x"},"godot_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"voxel_runtime_compatibility":{"status":"UNTESTED","reason":"x"},"overall_visual_quality":{"status":"UNTESTED","estimatedPercent":50,"reason":"x"}}})
    print("should fail")
    import sys; sys.exit(0)
except ValueError:
    import sys; sys.exit(1)
`);
  assert.equal(r.status, 1);
});
// Positive tests — must PASS
test('GLB validity VERIFIED + concrete evidence -> PASS', () => {
  const r = py(`
import sys
sys.path.insert(0, 'services/ai3d-worker')
from ai3d.evidence import enforce_evidence_report
enforce_evidence_report({"evidencePolicy":"ai3d-evidence-v2","qualityEvidence":{
  "pipeline_completion":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"stage_completion","stage":"depth","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"export","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"input_validation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"classification","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"depth_or_explicit_depth_fallback","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64},{"kind":"stage_completion","stage":"evidence_generation","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}]},
  "geometry_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"geometry_integrity","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{"vertexCount":8192},"threshold":{"minVertexCount":100},"passed":True}]},
  "glb_validity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"glb_validation","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{"zDepth":0.85},"threshold":{"minZDepth":0.01},"passed":True}]},
  "volumetric_artifact_integrity":{"status":"VERIFIED","percent":100,"evidence":[{"kind":"artifact_measurement","inputSha256":"a"*64,"artifactSha256":"b"*64,"verifier":"x","verifierVersion":"2","measurement":{"vertexCount":8192},"threshold":{"minVertexCount":100},"passed":True}]},
  "image3d_correspondence":{"status":"UNTESTED","reason":"No render-back"},
  "depth_accuracy":{"status":"UNTESTED","reason":"No ground-truth"},
  "silhouette_accuracy":{"status":"UNTESTED","reason":"No render-back"},
  "structural_similarity":{"status":"UNTESTED","reason":"No render-back"},
  "texture_quality":{"status":"UNTESTED","reason":"No render-back"},
  "godot_runtime_compatibility":{"status":"UNTESTED","reason":"Godot not tested"},
  "voxel_runtime_compatibility":{"status":"UNTESTED","reason":"Voxel not tested"},
  "overall_visual_quality":{"status":"UNTESTED","reason":"Critical metrics untested"}
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
v = verified(100, evidence=[{"kind":"stage_completion","stage":"geometry","status":"completed","startedAt":1,"finishedAt":2,"artifactSha256":"a"*64,"verifier":"x","verifierVersion":"2","passed":True,"inputSha256":"b"*64,"artifactSha256":"a"*64}], verifier="pipeline", verifierVersion="2")
print(v)
assert v["status"]=="VERIFIED" and v["percent"]==100
`);
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
