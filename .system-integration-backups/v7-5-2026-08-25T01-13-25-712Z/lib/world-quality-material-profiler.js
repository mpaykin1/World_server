'use strict';
function rgb(c){return[(c>>>16)&255,(c>>>8)&255,c&255]}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function profileColor(c){
  const[r,g,b]=rgb(+c||0),mx=Math.max(r,g,b),mn=Math.min(r,g,b),lum=(.299*r+.587*g+.114*b)/255,ch=(mx-mn)/255;
  const warm=(r-b)/255,green=(g-Math.max(r,b))/255;
  let materialClass='stone';
  if(lum>.58&&warm>.12&&ch>.16)materialClass='emissive';
  else if(lum<.42&&ch<.13)materialClass='metal';
  else if(green>.08)materialClass='vegetation';
  else if(warm>.12&&lum<.58)materialClass='wood';
  const table={
    stone:{roughness:.88,metalness:.03,emissiveIntensity:0,normalStrength:.72,aoStrength:.82},
    metal:{roughness:.42,metalness:.72,emissiveIntensity:0,normalStrength:.46,aoStrength:.70},
    vegetation:{roughness:.96,metalness:0,emissiveIntensity:0,normalStrength:.60,aoStrength:.72},
    wood:{roughness:.80,metalness:.01,emissiveIntensity:0,normalStrength:.58,aoStrength:.78},
    emissive:{roughness:.38,metalness:.04,emissiveIntensity:clamp(.8+(lum-.58)*3,.8,2.2),normalStrength:.20,aoStrength:.45}
  };
  return{color:+c||0,materialClass,...table[materialClass],luma:+lum.toFixed(4),chroma:+ch.toFixed(4)};
}
function buildMaterialProfiles(palette){return(palette||[]).map(profileColor)}
module.exports={profileColor,buildMaterialProfiles,rgb};
