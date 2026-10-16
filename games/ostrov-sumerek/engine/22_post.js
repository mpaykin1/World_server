/* -----------------------------------------------------------------------------
   8 · Post-processing: bloom → tilt-shift → tone map → aberration/grain/glitch
----------------------------------------------------------------------------- */
const composer = new EffectComposer(renderer);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.8);
const dofH = new ShaderPass(DOFShader), dofV = new ShaderPass(DOFShader);
dofH.uniforms.uDir.value.set(1, 0); dofV.uniforms.uDir.value.set(0, 1);
const finalPass = new ShaderPass(FinalShader);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(bloom);
composer.addPass(dofH);
composer.addPass(dofV);
composer.addPass(new OutputPass());
composer.addPass(finalPass);
const FX = finalPass.uniforms;

const perf = { scale: 0.8, acc: 0, frames: 0, cool: 0 };
function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, 1.75) * perf.scale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(19)) / camera.aspect))) : 46;
  camera.updateProjectionMatrix();
  const rw = Math.round(w * pr), rh = Math.round(h * pr);
  dofH.uniforms.uRes.value.set(rw, rh); dofV.uniforms.uRes.value.set(rw, rh); FX.uRes.value.set(rw, rh);
  U.pScale.value = rh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize);
resize();
