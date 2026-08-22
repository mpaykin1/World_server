'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runPython(code) {
  return spawnSync('python', ['-c', code], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
}

const smoke = String.raw`
import hashlib, json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'services/ai3d-worker')
from PIL import Image, ImageDraw
from ai3d.plugins.voxel_city import VoxelCityEngine
from ai3d_voxel_verifier.verifier import verify_voxel_city

tmp = Path(tempfile.mkdtemp(prefix='voxel-city-test-'))
img = Image.new('RGB', (128, 96), (190, 90, 80))
d = ImageDraw.Draw(img)
d.rectangle([0, 58, 127, 95], fill=(32, 25, 27))
d.rectangle([18, 28, 43, 95], fill=(45, 36, 40))
d.polygon([(16,28),(31,9),(45,28)], fill=(38,30,35))
d.rectangle([64, 22, 104, 95], fill=(48, 34, 39))
d.polygon([(62,22),(73,5),(82,22)], fill=(42,28,35))
d.polygon([(78,22),(88,1),(98,22)], fill=(39,26,33))
d.rectangle([53,70,60,95], fill=(150,70,40))
source = tmp/'input.png'; img.save(source)

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
engine = VoxelCityEngine()
params = {'voxelGridWidth':96,'maxDepth':28,'maxThickness':5,'structureCell':4,'depthLayers':8,'paletteColors':32,'foundation':True}
w1 = tmp/'a'/'voxel-city.json'; w1.parent.mkdir()
r1 = engine.run(source,w1,params)
w2 = tmp/'b'/'voxel-city.json'; w2.parent.mkdir()
r2 = engine.run(source,w2,params)
assert sha(w1) == sha(w2), 'voxel output must be deterministic'
data = json.loads(w1.read_text(encoding='utf-8'))
stats = json.loads((w1.parent/'voxel-city-stats.json').read_text(encoding='utf-8'))
assert data['schema'] == 'ai3d-voxel-city-v2'
assert len(data['voxels']) > 1000
coords = {(v[0],v[1],v[2]) for v in data['voxels']}
assert len(coords) == len(data['voxels']), 'duplicate voxels'
assert stats['foundationVoxels'] > 0
assert stats['frontDepthLayersUsed'] >= 3
report_path, projection_path = verify_voxel_city(source,w1,w1.parent)
report = json.loads(report_path.read_text(encoding='utf-8'))
assert report['technical']['status'] == 'VERIFIED'
assert report['technical']['duplicateCoordinates'] == 0
assert report['frontProjection2D']['cityColorSimilarityPercent'] >= 80
assert report['frontProjection2D']['maskedEdgeSimilarityPercent'] >= 70
assert report['image3dCorrespondence']['status'] == 'UNTESTED'
assert projection_path.is_file()
print(json.dumps({'voxels':len(data['voxels']),'color':report['frontProjection2D']['cityColorSimilarityPercent'],'edge':report['frontProjection2D']['maskedEdgeSimilarityPercent']}))
`;

test('Voxel City v2 is deterministic, cubical and independently verifiable', () => {
  const r = runPython(smoke);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const last = r.stdout.trim().split(/\r?\n/).at(-1);
  const result = JSON.parse(last);
  assert.ok(result.voxels > 1000);
});

test('Voxel City verifier refuses a tampered world artifact', () => {
  const code = String.raw`
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'services/ai3d-worker')
from PIL import Image
from ai3d.plugins.voxel_city import VoxelCityEngine
from ai3d_voxel_verifier.verifier import verify_voxel_city

t=Path(tempfile.mkdtemp()); p=t/'i.png'; Image.new('RGB',(64,64),(30,30,30)).save(p); w=t/'voxel-city.json'; VoxelCityEngine().run(p,w,{'voxelGridWidth':64})
d=json.loads(w.read_text()); d['voxels'].append(d['voxels'][0]); w.write_text(json.dumps(d))
try:
    verify_voxel_city(p,w,t)
except ValueError:
    raise SystemExit(0)
raise SystemExit(2)
`;
  const r = runPython(code);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
