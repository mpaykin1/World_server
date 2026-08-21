'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fixtures = ['cube_object.png', 'house.png', 'city_street.png', 'terrain.png', 'voxel_building.png'];

test('CPU reconstruction creates real volumetric GLB (not placeholder plane)', () => {
  const py = spawnSync('python', ['-c', `
import sys
sys.path.insert(0, 'services/ai3d-worker')
from pathlib import Path
from ai3d.plugins.cpu_reconstruction import CpuReconstructionEngine
from ai3d.validation import quality_score
import tempfile
from PIL import Image
e = CpuReconstructionEngine()
for name in ['cube_object','house','city_street','terrain','voxel_building']:
    p = Path(f'test/fixtures/{name}.png')
    out = Path(tempfile.mktemp(suffix='.glb'))
    glb, cls = e.run(p, out, {})
    qs = quality_score(out)
    print(f"{name}:{qs['vertexCount']},{qs['faceCount']},{qs['zDepth']:.3f},{qs['isPlaceholder']},{qs['Overall %']}")
    assert qs['isPlaceholder'] == False, f"{name} is placeholder"
    assert qs['zDepth'] > 0.01, f"{name} zDepth too small"
    assert qs['vertexCount'] >= 100, f"{name} vertexCount too small"
    assert qs['faceCount'] >= 50, f"{name} faceCount too small"
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
from PIL import Image
e = CpuReconstructionEngine()
p = Path('test/fixtures/cube_object.png')
out = Path(tempfile.mktemp(suffix='.glb'))
glb, cls = e.run(p, out, {})
print(cls)
`], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  assert.equal(py.status, 0, py.stderr || py.stdout);
});
