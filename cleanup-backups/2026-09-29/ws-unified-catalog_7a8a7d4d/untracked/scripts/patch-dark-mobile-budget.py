from pathlib import Path
p=Path(__file__).resolve().parents[1]/'apps'/'dark-void-scene'/'client.js'
t=p.read_text(encoding='utf-8-sig')
if "const coarsePointer = matchMedia('(pointer:coarse)').matches;" not in t:
 t=t.replace("const renderer = new THREE.WebGLRenderer({ antialias: true });","const coarsePointer = matchMedia('(pointer:coarse)').matches;\nconst renderer = new THREE.WebGLRenderer({ antialias: !coarsePointer, powerPreference: 'high-performance' });",1)
t=t.replace("renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));","renderer.setPixelRatio(Math.min(coarsePointer ? 1.25 : 2, devicePixelRatio || 1));",1)
p.write_text(t,encoding='utf-8')
print('patched dark mobile renderer budget')