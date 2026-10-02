// Canonical pure terrain contract shared by World Server renderers and cinematic.
export const TERRAIN_CONTRACT_VERSION=1;
export const SEA_LEVEL=22;
export const TERRAIN_TOP=96;
export function hash32(x,z,seed){
  let h=(Math.imul(x,374761393)^Math.imul(z,668265263)^seed)|0;
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967295;
}
export function smooth(t){return t*t*(3-2*t);}
export function valueNoise(x,z,scale,seed){
  const fx=x/scale,fz=z/scale,x0=Math.floor(fx),z0=Math.floor(fz);
  const tx=smooth(fx-x0),tz=smooth(fz-z0);
  const a=hash32(x0,z0,seed),b=hash32(x0+1,z0,seed);
  const c=hash32(x0,z0+1,seed),d=hash32(x0+1,z0+1,seed);
  const ab=a+(b-a)*tx,cd=c+(d-c)*tx;
  return ab+(cd-ab)*tz;
}
export function fbm(x,z,seed){
  return valueNoise(x,z,72,seed)*.52+valueNoise(x,z,31,seed+97)*.28+
    valueNoise(x,z,13,seed+197)*.14+valueNoise(x,z,6,seed+313)*.06;
}
export function biomeAt(x,z,seed,theme='mixed',emergenceSample=()=>null){
  const macro=emergenceSample(x,z);
  if(macro?.biome)return macro.biome;
  const t=valueNoise(x,z,180,seed+900),m=valueNoise(x,z,150,seed+1400);
  if(theme==='desert')return t>.14?'desert':'plains';
  if(theme==='snow')return t<.86?'snow':'plains';
  if(theme==='forest')return m>.18?'forest':'plains';
  if(theme==='mountains')return t<.72?'snow':'plains';
  if(theme==='islands')return m>.72?'forest':'plains';
  if(t>.72)return 'desert';
  if(t<.22)return 'snow';
  if(m>.62)return 'forest';
  return 'plains';
}
export function heightAt(x,z,seed,theme='mixed',emergenceSample=()=>null){
  const b=biomeAt(x,z,seed,theme,emergenceSample);
  const n=fbm(x,z,seed),ridge=Math.abs(valueNoise(x,z,105,seed+77)-.5)*2;
  let h=16+n*21;
  if(theme==='mountains')h=20+n*25+ridge*20;
  else if(theme==='islands')h=9+n*17-ridge*4;
  else if(b==='snow')h+=ridge*15;
  else if(b==='desert')h=17+n*11;
  else if(b==='forest')h+=4;
  const macro=emergenceSample(x,z);
  if(macro?.heightDelta)h+=macro.heightDelta;
  return Math.max(5,Math.min(TERRAIN_TOP-12,Math.floor(h)));
}
export function sampleTerrain(x,z,seed,theme='mixed',emergenceSample=()=>null){
  return {height:heightAt(x,z,seed,theme,emergenceSample),
    biome:biomeAt(x,z,seed,theme,emergenceSample)};
}
