'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

test('CPU reconstruction creates real volumetric GLB (not placeholder plane)', () => {
  const py = spawnSync('python', ['-c', `
import sys
sys.path.insert(0, 'services/ai3d-worker')
from pathlib import Path
from ai3d.plugins.cpu_reconstruction import CpuReconstructionEngine
from ai3d.validation import quality_score, mesh_quality
import tempfile
e = CpuReconstructionEngine()
for name in ['cube_object','house','city_street','terrain','voxel_building']:
    p = Path(f'test/fixtures/{name}.png')
    out = Path(tempfile.mktemp(suffix='.glb'))
    glb, cls = e.run(p, out, {})
    qs = quality_score(out)
    mq = mesh_quality(out)
    print(f"{name}: verts={mq['vertexCount']} faces={mq['faceCount']} zDepth={mq['zDepth']:.3f} placeholder={mq['isPlaceholder']} size={out.stat().st_size}")
    # Check evidence-gated metrics
    assert qs['Geometry Integrity %']['status'] == 'VERIFIED', name
    assert qs['Geometry Integrity %']['percent'] == 100, name
    assert qs['GLB Validity %']['status'] == 'VERIFIED' and qs['GLB Validity %']['percent'] == 100, name
    assert qs['Real Image->3D Artifact %']['status'] == 'VERIFIED' and qs['Real Image->3D Artifact %']['percent'] == 100, name
    assert qs['Real Image->3D Artifact %']['isPlaceholder'] == False, name
    assert qs['Depth Accuracy %']['status'] == 'UNTESTED', name
    assert qs['Silhouette Accuracy %']['status'] == 'UNTESTED', name
    assert mq['isPlaceholder'] == False, f"{name} is placeholder"
    assert mq['zDepth'] > 0.01, f"{name} zDepth too small"
    assert mq['vertexCount'] >= 100, f"{name} vertexCount too small"
    assert mq['faceCount'] >= 50, f"{name} faceCount too small"
    assert out.stat().st_size > 10000, f"{name} file too small"
print("CPU REAL 3D OK")
`], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  assert.equal(py.status, 0, py.stderr || py.stdout);
  assert.match(py.stdout, /CPU REAL 3D OK/);
});

test('Depth Anything fallback still produces depth map', () => {
  const py = spawnSync('python', ['-c', `
import sys
sys.path.insert(0, 'services/ai3d-worker')
from pathlib import Path
from ai3d.plugins.cpu_reconstruction import CpuReconstructionEngine
import tempfile
e = CpuReconstructionEngine()
p = Path('test/fixtures/cube_object.png')
out = Path(tempfile.mktemp(suffix='.glb'))
glb, cls = e.run(p, out, {})
print(cls)
`], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  assert.equal(py.status, 0, py.stderr || py.stdout);
});
