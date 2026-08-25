from pathlib import Path
import json
import py_compile
import trimesh
import numpy as np

BASE=Path(__file__).resolve().parent
OUT=BASE/'output'/'demo_build'
for p in (BASE/'pixel3dgs').glob('*.py'):
    py_compile.compile(str(p),doraise=True)
required=['viewer_auto.html','scene_lod0.ply','scene_lod1.ply','scene_lod2.ply','scene_manifest.json','quality_report.json','capture_quality.json','capture_template.json','collision_proxy.glb','navgrid.json','covariance_lod0.npz']
missing=[x for x in required if not (OUT/x).exists()]
assert not missing,missing
m=json.loads((OUT/'scene_manifest.json').read_text(encoding='utf-8'));q=json.loads((OUT/'quality_report.json').read_text(encoding='utf-8'))
assert m['lod_counts']['lod0']>=m['lod_counts']['lod1']>=m['lod_counts']['lod2']>0
assert m['features']['weighted_blended_oit'] and m['features']['per_splat_ewa_covariance']
assert m['features']['global_pose_graph_loop_closure'] and m['features']['sparse_tsdf_cpu_fusion']
assert abs(m['planes']['ground_y'])<0.05
cov=np.load(OUT/'covariance_lod0.npz')['covariance6'];assert cov.shape[1]==6 and np.isfinite(cov).all()
mesh=trimesh.load(OUT/'collision_proxy.glb',force='mesh');assert len(mesh.vertices)>=8 and len(mesh.faces)>=8
html=(OUT/'viewer_auto.html').read_text(encoding='utf-8');assert 'weighted OIT' in html and 'outerProduct' in html and 'hierarchical' in html
print(json.dumps({'ok':True,'pipeline_health_percent':q['pipeline_health_percent'],'capture_quality_percent':q['capture_quality_percent'],'lod_counts':m['lod_counts'],'feature_count':sum(bool(v) for v in m['features'].values()),'collision_vertices':len(mesh.vertices)},indent=2))
