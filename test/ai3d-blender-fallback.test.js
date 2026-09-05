const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('AI3D preserves a valid source GLB when Blender is unavailable', () => {
  const repo = path.resolve(__dirname, '..');
  const code = String.raw`
import json, os, pathlib, sys, tempfile
sys.path.insert(0, str(pathlib.Path(r'${repo.replace(/\\/g, '\\\\')}') / 'services' / 'ai3d-worker'))
os.environ['BLENDER_BIN'] = '__missing_blender_for_ci__'
from ai3d.plugins.mesh_quality_optimizer import MeshQualityOptimizer
with tempfile.TemporaryDirectory() as td:
    job = pathlib.Path(td)
    src = job / 'model.glb'
    src.write_bytes(b'glTF' + b'0' * 128)
    report, lods = MeshQualityOptimizer().prepare(src, job, {})
    payload = json.loads(report.read_text(encoding='utf-8'))
    assert payload['status'] == 'SKIPPED_BLENDER_UNAVAILABLE'
    assert payload['sourcePreserved'] is True
    assert lods == []
`;
  const result = spawnSync('python', ['-c', code], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
