'use strict';
const METRICS=['nearDetail','nearTextureResolution','nearMeshDensity','nearShadowQuality','nearAnisotropy','nearPixelRatio'];
function gateNearFieldQuality(before,after,opts={}){const allowed=opts.allowedRelativeDrop??0;const violations=[];for(const k of METRICS){if(!Number.isFinite(before?.[k])||!Number.isFinite(after?.[k]))continue;const drop=(before[k]-after[k])/Math.max(1e-9,Math.abs(before[k]));if(drop>allowed)violations.push({metric:k,before:before[k],after:after[k],relativeDrop:drop});}return {ok:violations.length===0,status:violations.length?'REJECT':'PASS',preserveNearPlayerQuality:true,violations,note:'Distance LOD/fog/occlusion may improve FPS; near-player visual quality may not decrease.'};}
module.exports={METRICS,gateNearFieldQuality};
