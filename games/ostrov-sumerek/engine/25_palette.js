/* -----------------------------------------------------------------------------
   9 · Palettes: dusk → twilight → night, and the dawn the beacon brings
       (every visual lever lives here and is blended continuously)
----------------------------------------------------------------------------- */
const PALETTES = {
  dusk: {
    skyTop: '#2c3c7e', skyHor: '#ffaf78', fog: '#d99a86', fogD: 0.0155,
    keyCol: '#ffc48a', keyI: 2.7, sunEl: 0.16, sunVis: 1, moonMix: 0, hemiSky: '#ffd9bf', hemiGnd: '#4b3552', hemiI: 1.6,
    deep: '#1c4277', shallow: '#3fb2c2', foam: '#fff2dc', wSky: '#f6b48e', bloom: 0.5, exposure: 1.0,
    motes: 1, flies: 0, mist: 0.16, mistCol: '#ffd6c2', stars: 0, wisp: 0.3, grain: 0.045, vig: 0.32,
    gain: [1.03, 1.0, 0.95], lift: [0.03, 0.0, 0.04], coinGlow: 1.1, beam: 0.12, halo: 0.3,
    aurora: 0, auroraA: '#3dffa8', auroraB: '#b56bff',
  },
  twi: {
    skyTop: '#1b2056', skyHor: '#d0687c', fog: '#7a4a72', fogD: 0.021,
    keyCol: '#ff8a66', keyI: 1.5, sunEl: 0.015, sunVis: 0.85, moonMix: 0.25, hemiSky: '#a58ed6', hemiGnd: '#2a2038', hemiI: 1.1,
    deep: '#15294f', shallow: '#2d7c98', foam: '#f7dbe9', wSky: '#c27a96', bloom: 0.68, exposure: 1.02,
    motes: 0.45, flies: 0.55, mist: 0.24, mistCol: '#b88fbd', stars: 0.35, wisp: 1, grain: 0.055, vig: 0.4,
    gain: [1.0, 0.97, 1.02], lift: [0.04, 0.0, 0.06], coinGlow: 1.6, beam: 0.25, halo: 0.42,
    aurora: 0, auroraA: '#3dffa8', auroraB: '#b56bff',
  },
  night: {
    skyTop: '#050a1d', skyHor: '#222a5e', fog: '#1b2042', fogD: 0.026,
    keyCol: '#9fb6ff', keyI: 1.05, sunEl: -0.25, sunVis: 0, moonMix: 1, hemiSky: '#4d5ea8', hemiGnd: '#0c0a17', hemiI: 0.66,
    deep: '#0b1631', shallow: '#1b4e78', foam: '#8f9fd8', wSky: '#2c3570', bloom: 0.92, exposure: 1.08,
    motes: 0.12, flies: 1, mist: 0.3, mistCol: '#6170ae', stars: 1, wisp: 1, grain: 0.07, vig: 0.5,
    gain: [0.95, 0.98, 1.07], lift: [0.02, 0.0, 0.07], coinGlow: 2.2, beam: 0.38, halo: 0.55,
    aurora: 0, auroraA: '#3dffa8', auroraB: '#b56bff',
  },
  dawn: {
    skyTop: '#3b66b9', skyHor: '#ffd2a2', fog: '#efc0aa', fogD: 0.0135,
    keyCol: '#ffe2ae', keyI: 3.0, sunEl: 0.2, sunVis: 1, moonMix: 0, hemiSky: '#ffe8d0', hemiGnd: '#5c4c62', hemiI: 1.85,
    deep: '#255290', shallow: '#56cad2', foam: '#ffffff', wSky: '#ffd2b2', bloom: 0.45, exposure: 1.0,
    motes: 1, flies: 0.15, mist: 0.22, mistCol: '#fff0e4', stars: 0, wisp: 0.4, grain: 0.04, vig: 0.28,
    gain: [1.04, 1.0, 0.96], lift: [0.03, 0.01, 0.02], coinGlow: 1.0, beam: 0.1, halo: 0.25,
    aurora: 0, auroraA: '#3dffa8', auroraB: '#b56bff',
  },
};
const prepPal = (p) => { const o = {}; for (const k in p) o[k] = typeof p[k] === 'string' ? new THREE.Color(p[k]) : Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; };
const PAL = {}; for (const k in PALETTES) PAL[k] = prepPal(PALETTES[k]);
// a biome may override any lever of any phase: biome.palette = { dusk: { fog: '#…' }, night: { … } }
function biomePalettes(biome) {
  for (const k in PALETTES) PAL[k] = prepPal(Object.assign({}, PALETTES[k], (biome && biome.palette && biome.palette[k]) || {}));
}
const pal = prepPal(PALETTES.dusk);
function mixInto(out, a, b, t) {
  for (const k in out) {
    const v = out[k];
    if (v && v.isColor) v.copy(a[k]).lerp(b[k], t);
    else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) v[i] = lerp(a[k][i], b[k][i], t);
    else out[k] = lerp(a[k], b[k], t);
  }
}
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), keyDir = new THREE.Vector3();
function applyPalette(tod, dawn) {
  if (tod < 0.5) mixInto(pal, PAL.dusk, PAL.twi, smooth(0, 1, tod / 0.5));
  else mixInto(pal, PAL.twi, PAL.night, smooth(0, 1, (tod - 0.5) / 0.5));
  eventPalette(pal);                 // a world event (storm, blizzard …) leans on every lever by its intensity
  if (dawn > 0.001) mixInto(pal, pal, PAL.dawn, dawn);
  const az = G.sunAz;
  sunDir.set(Math.cos(pal.sunEl) * Math.cos(az), Math.sin(pal.sunEl), Math.cos(pal.sunEl) * Math.sin(az));
  keyDir.copy(sunDir).lerp(moonDir, pal.moonMix).normalize();
  scene.fog.color.copy(pal.fog); scene.fog.density = pal.fogD; U.fogD.value = pal.fogD;
  skyU.uTop.value.copy(pal.skyTop); skyU.uHorizon.value.copy(pal.skyHor); skyU.uBottom.value.copy(pal.fog);
  skyU.uSunCol.value.copy(pal.keyCol); skyU.uSunDir.value.copy(sunDir); skyU.uSunVis.value = pal.sunVis;
  skyU.uNight.value = pal.stars; skyU.uMoonDir.value.copy(moonDir);
  skyU.uAurora.value = pal.aurora; skyU.uAuroraA.value.copy(pal.auroraA); skyU.uAuroraB.value.copy(pal.auroraB);
  keyLight.color.copy(pal.keyCol); keyLight.intensity = pal.keyI;
  keyLight.position.copy(keyLight.target.position).addScaledVector(keyDir, 60);
  hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGnd); hemi.intensity = pal.hemiI;
  waterU.uDeep.value.copy(pal.deep); waterU.uShallow.value.copy(pal.shallow); waterU.uFoam.value.copy(pal.foam);
  waterU.uSky.value.copy(pal.wSky); waterU.uSunCol.value.copy(pal.keyCol); waterU.uSunDir.value.copy(keyDir);
  renderer.toneMappingExposure = pal.exposure;
  mistColor.copy(pal.mistCol); mistAlpha.value = pal.mist;
  flyU.uFly.value = pal.flies; flyU.uMote.value = pal.motes;
  coinMat.uniforms.uGlow.value = pal.coinGlow;
  coinBeamMat.uniforms.uIntensity.value = pal.beam;
  coinHaloMat.uniforms.uIntensity.value = pal.halo;
  heartHaloMat.uniforms.uIntensity.value = pal.halo * 0.8;
  FX.uGrain.value = pal.grain * (REDUCED ? 0.5 : 1);
  FX.uGain.value.setRGB(pal.gain[0], pal.gain[1], pal.gain[2]);
  FX.uLift.value.setRGB(pal.lift[0], pal.lift[1], pal.lift[2]);
}
