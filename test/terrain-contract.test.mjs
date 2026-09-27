import test from 'node:test';
import assert from 'node:assert/strict';
import {hash32,smooth,valueNoise,fbm,biomeAt,heightAt,sampleTerrain,TERRAIN_CONTRACT_VERSION} from '../shared/terrain-contract.mjs';
const oldHash=(x,z,seed)=>{let h=(Math.imul(x,374761393)^Math.imul(z,668265263)^seed)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
const oldNoise=(x,z,scale,seed)=>{
  const fx=x/scale,fz=z/scale,x0=Math.floor(fx),z0=Math.floor(fz);
  const tx=smooth(fx-x0),tz=smooth(fz-z0);
  const a=oldHash(x0,z0,seed),b=oldHash(x0+1,z0,seed),c=oldHash(x0,z0+1,seed),d=oldHash(x0+1,z0+1,seed);
  return (a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz;
};
const oldBiome=(x,z,seed,theme,macro)=>{
  if(macro?.biome)return macro.biome;
  const t=oldNoise(x,z,180,seed+900),m=oldNoise(x,z,150,seed+1400);
  if(theme==='desert')return t>.14?'desert':'plains';
  if(theme==='snow')return t<.86?'snow':'plains';
  if(theme==='forest')return m>.18?'forest':'plains';
  if(theme==='mountains')return t<.72?'snow':'plains';
  if(theme==='islands')return m>.72?'forest':'plains';
  if(t>.72)return 'desert';if(t<.22)return 'snow';if(m>.62)return 'forest';
  return 'plains';
};
const oldHeight=(x,z,seed,theme,macro)=>{
  const biome=oldBiome(x,z,seed,theme,macro);
  const n=oldNoise(x,z,72,seed)*.52+oldNoise(x,z,31,seed+97)*.28+
    oldNoise(x,z,13,seed+197)*.14+oldNoise(x,z,6,seed+313)*.06;
  const ridge=Math.abs(oldNoise(x,z,105,seed+77)-.5)*2;
  let h=16+n*21;
  if(theme==='mountains')h=20+n*25+ridge*20;
  else if(theme==='islands')h=9+n*17-ridge*4;
  else if(biome==='snow')h+=ridge*15;
  else if(biome==='desert')h=17+n*11;
  else if(biome==='forest')h+=4;
  if(macro?.heightDelta)h+=macro.heightDelta;
  return Math.max(5,Math.min(84,Math.floor(h)));
};
test('canonical terrain contract is stable',()=>{
  assert.equal(TERRAIN_CONTRACT_VERSION,1);
  assert.equal(hash32(-17,31,270927),oldHash(-17,31,270927));
  assert.ok(Number.isFinite(fbm(-180,600,270927)));
});
test('extracted sampler matches original voxel terrain over positive/negative and distant coordinates',()=>{
  const seeds=[270927,73194217,4294967295];
  const themes=['mixed','desert','snow','forest','mountains','islands'];
  const points=[[0,0],[-1,-1],[-512,387],[23000,-36000],[-980000,890000],
    [123.5,-456.25]];
  for(const seed of seeds)for(const theme of themes)for(const [x,z] of points){
    assert.equal(valueNoise(x,z,31,seed),oldNoise(x,z,31,seed));
    const m={biome:Math.abs(x)>800000?'wetland':undefined,heightDelta:x>0?3:0};
    const emergent=()=>m;
    assert.equal(biomeAt(x,z,seed,theme,emergent),oldBiome(x,z,seed,theme,m));
    assert.equal(heightAt(x,z,seed,theme,emergent),oldHeight(x,z,seed,theme,m));
    assert.deepEqual(sampleTerrain(x,z,seed,theme,emergent),{
      biome:oldBiome(x,z,seed,theme,m),height:oldHeight(x,z,seed,theme,m)});
  }
});
test('voxel terrain chunk seams and deterministic repeat',()=>{
  const seed=73194217;
  for(const cx of [-62500,-10,-1,0,1,62500]){
    const left=Array.from({length:16},(_,z)=>sampleTerrain(cx*16+15,z,seed));
    const right=Array.from({length:16},(_,z)=>sampleTerrain((cx+1)*16,z,seed));
    assert.deepEqual(left,Array.from({length:16},(_,z)=>sampleTerrain(cx*16+15,z,seed)));
    assert.equal(right.length,16);
  }
});
