'use strict';const {buildProfile}=require('./procedural-quality-profile.js');
function tune(body={}){
  const c=body.capabilities||{},scene=body.scene||{},perf=body.performance||{},base=buildProfile({webgpu:c.webgpu?'1':'0',webgl2:c.webgl2?'1':'0',memory:c.memory,cores:c.cores,dpr:c.dpr,reducedMotion:c.reduced?'1':'0'}),s={...base.settings};
  const conf=Number(scene.semanticConfidence||0),motion=Number(scene.motionConfidence||0),cov=Number(scene.coverage||0),objects=Number(scene.objectCount||0),fps=Number(body.fps||60),p95=Number(perf.p95FrameMs||0),native=!!scene.nativeGBuffer,nativeCov=Number(scene.nativeCoveragePct||0),golden=Number(scene.goldenConfidence||0);
  if(motion>.55)s.temporal=Math.max(.16,s.temporal-.08);
  if(conf>.65){s.gi=Math.min(.72,s.gi+.06);s.radiance=Math.min(.84,s.radiance+.05);s.ddgi=Math.min(.86,s.ddgi+.05)}
  if(nativeCov>=60){s.renderScale=Math.min(1,s.renderScale+.04);s.pbr=Math.min(1,s.pbr+.05)}if(golden>.8){s.sharpen=Math.min(.16,s.sharpen+.01)}if(native){s.tsr=Math.min(1,s.tsr+.08);s.ddgi=Math.min(.9,s.ddgi+.08)}
  if(cov>.82)s.detail=Math.max(.22,s.detail-.04);if(scene.hasBrightLight)s.volumetric=Math.min(.55,s.volumetric+.06);if(objects>650)s.culling=Math.max(.72,s.culling);
  if(fps<46||p95>24){const p=(fps<38||p95>30)?.65:.82;for(const k of ['gi','radiance','ddgi','volumetric'])s[k]*=p;s.radianceScale*=p;s.renderScale=Math.max(.68,s.renderScale-(p<.7?.16:.08));s.culling=Math.min(.96,s.culling+.12)}
  return{version:7,tier:base.tier,targetFps:base.targetFps,settings:s,reason:{semanticConfidence:conf,motionConfidence:motion,coverage:cov,objectCount:objects,nativeGBuffer:native,nativeCoveragePct:nativeCov,goldenConfidence:golden,p95FrameMs:p95,serverAdaptive:true}}
}
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store,max-age=0');if(req.method!=='POST')return res.status(405).json({error:'POST required'});res.status(200).json(tune(req.body||{}))};module.exports.tune=tune;
