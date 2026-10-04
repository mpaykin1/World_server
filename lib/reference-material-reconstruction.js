'use strict';
const {buildMaterialProfiles}=require('./world-quality-material-profiler');
const {synthesizePbrProfiles,estimateTextureBudget}=require('./world-quality-pbr-synthesizer');

function colorInt(value){
  if(Number.isInteger(value))return value>>>0;
  const s=String(value||'').trim();
  if(/^#[0-9a-f]{6}$/i.test(s))return parseInt(s.slice(1),16);
  if(/^0x[0-9a-f]{6}$/i.test(s))return parseInt(s.slice(2),16);
  return null;
}
function terms(reference={}){
  const values=[reference.style,reference.styles,reference.tags,reference.objects].flat().filter(Boolean);
  return values.map(x=>String(x).toLowerCase());
}
function has(values,words){return words.some(w=>values.some(v=>v.includes(w)));}

function reconstructReferenceMaterials(reference={},options={}){
  const palette=(reference.palette||[]).map(colorInt).filter(Number.isInteger).slice(0,32);
  const semantic=terms(reference),seed=options.seed||'reference-materials-v1';
  const profiled=buildMaterialProfiles(palette);
  let profiles=synthesizePbrProfiles(profiled,{seed});
  const semanticStone=has(semantic,['gothic','cathedral','stone','кам']);
  const semanticWood=has(semantic,['wood','timber','дерев']);
  const semanticMetal=has(semantic,['metal','steel','iron','steampunk','металл']);
  if(semanticStone)profiles.unshift({materialClass:'stone',roughness:has(semantic,['wet','rain','мокр']) ? .38 : .84,metalness:.02,normalStrength:.72,aoStrength:.82,detailScale:5.5,emissiveIntensity:0,source:'semantic'});
  else if(semanticWood)profiles.unshift({materialClass:'wood',roughness:.74,metalness:.02,normalStrength:.55,aoStrength:.72,detailScale:4.2,emissiveIntensity:0,source:'semantic'});
  else if(semanticMetal)profiles.unshift({materialClass:'metal',roughness:.42,metalness:.78,normalStrength:.38,aoStrength:.62,detailScale:3.2,emissiveIntensity:0,source:'semantic'});
  if(!profiles.length)profiles=[{materialClass:'generic',roughness:.72,metalness:.03,normalStrength:.4,aoStrength:.6,detailScale:4,emissiveIntensity:0,source:'fallback'}];
  const unique=[];const seen=new Set();
  for(const profile of profiles){const key=profile.materialClass+':'+(profile.hex??profile.color??'semantic');if(seen.has(key))continue;seen.add(key);unique.push(profile);if(unique.length>=12)break;}
  return{schemaVersion:'1.0.0',source:palette.length?'reference-palette+semantics':'semantics-or-fallback',profiles:unique,textureBudget:estimateTextureBudget(unique,options.deviceTier||'HIGH')};
}
module.exports={colorInt,reconstructReferenceMaterials};
