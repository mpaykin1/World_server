from pathlib import Path
p=Path(__file__).resolve().parents[1]/'apps'/'pixel-panorama-360'/'client.js'
t=p.read_text(encoding='utf-8-sig')
repls=[
("new THREE.WebGLRenderer({canvas:ui.stage,antialias:false,powerPreference:'high-performance'})","new THREE.WebGLRenderer({canvas:ui.stage,antialias:false,powerPreference:'high-performance',alpha:true})"),
("S.scene.add(S.sphere);resize()","S.scene.add(S.sphere);S.sphere.visible=false;S.renderer.setClearAlpha(0);document.body.style.backgroundSize='cover';document.body.style.backgroundRepeat='repeat-x';document.body.style.imageRendering='pixelated';resize()"),
("const baseUrl=base.frames[index%base.frames.length];const im=await image(baseUrl);","const baseUrl=base.frames[index%base.frames.length];document.body.style.backgroundImage=`url(\"${baseUrl}\")`;const im=await image(baseUrl);"),
("S.camera.rotation.x=S.pitch}","S.camera.rotation.x=S.pitch;document.body.style.backgroundPosition=`${50+S.yaw*18}% ${50-S.pitch*22}%`}")]
for old,new in repls:
 if new in t: continue
 if old not in t: raise SystemExit('anchor missing: '+old[:80])
 t=t.replace(old,new,1)
p.write_text(t,encoding='utf-8')
print('patched resilient pixel background fallback')