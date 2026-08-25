'use strict';
const crypto=require('crypto');

function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0));}
function round(v,n=4){const p=10**n;return Math.round(v*p)/p;}
function seed01(text){const h=crypto.createHash('sha256').update(String(text)).digest();return h.readUInt32LE(0)/0xffffffff;}

function synthesizeProfile(profile,index=0,options={}){
  const c=profile?.materialClass||'stone';
  const base={
    stone:{roughness:.84,metalness:.02,normalStrength:.62,aoStrength:.76,detailScale:5.5,emissiveScale:0},
    metal:{roughness:.42,metalness:.78,normalStrength:.38,aoStrength:.62,detailScale:3.2,emissiveScale:0},
    wood:{roughness:.72,metalness:.02,normalStrength:.55,aoStrength:.70,detailScale:4.2,emissiveScale:0},
    vegetation:{roughness:.90,metalness:0,normalStrength:.48,aoStrength:.55,detailScale:5.8,emissiveScale:0},
    emissive:{roughness:.48,metalness:.04,normalStrength:.22,aoStrength:.38,detailScale:2.8,emissiveScale:1},
    plaster:{roughness:.78,metalness:0,normalStrength:.32,aoStrength:.58,detailScale:6.2,emissiveScale:0}
  }[c]||{roughness:.8,metalness:.03,normalStrength:.4,aoStrength:.6,detailScale:4,emissiveScale:0};
  const jitter=(seed01(`${options.seed||'wqa4'}:${index}:${profile?.hex||''}`)-.5)*.10;
  const sal=clamp(profile?.saliency??.5,0,1);
  const out={
    materialClass:c,
    roughness:round(clamp((profile?.roughness??base.roughness)+jitter,.08,.98)),
    metalness:round(clamp(profile?.metalness??base.metalness,0,1)),
    normalStrength:round(clamp(base.normalStrength*(.75+sal*.4),0,1.5)),
    aoStrength:round(clamp(base.aoStrength*(.85+sal*.25),0,1)),
    detailScale:round(clamp(base.detailScale*(.85+sal*.3),1,12),2),
    emissiveIntensity:round(clamp((profile?.emissiveIntensity||0)*(.8+base.emissiveScale*.4),0,8)),
    virtualTexturePriority:Math.max(0,Math.min(3,Math.round(sal*3))),
    textureMemoryWeight:round(.45+sal*.55,3),
    proceduralOnly:true,
    destructiveTextureBake:false
  };
  out.candidateId=crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0,16);
  return out;
}
function synthesizePbrProfiles(materialProfiles=[],options={}){return materialProfiles.map((p,i)=>synthesizeProfile(p,i,options));}
function estimateTextureBudget(profiles=[],deviceTier='HIGH'){
  const scale={SAFE:.42,BALANCED:.62,HIGH:.82,ULTRA:1}[deviceTier]??.72;
  const weighted=profiles.reduce((a,p)=>a+(Number(p.textureMemoryWeight)||.5),0);
  return {tier:deviceTier,virtualMegapixels:round(weighted*scale*1.5,2),atlasScale:scale,maxAnisotropy:deviceTier==='ULTRA'?8:deviceTier==='HIGH'?4:2};
}
module.exports={synthesizeProfile,synthesizePbrProfiles,estimateTextureBudget};
