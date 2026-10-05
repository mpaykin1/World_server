// Structural + visual-contract gate for WORKER VISUAL SHELL V2.

function luminance(material){
  const c=material?.color;
  if(!c)return null;
  const r=Number(c.r),g=Number(c.g),b=Number(c.b);
  if(!Number.isFinite(r+g+b))return null;
  return .2126*r+.7152*g+.0722*b;
}

export function inspectIllustrationCharacter(root){
  const m={
    meshes:0,directOutlinedMeshes:0,outerContours:0,
    massLayers:0,detailLayers:0,inkLayers:0,
    hasJacket:false,hasShirt:false,hasTie:false,hasBriefcase:false,
    hasPelvisBridge:false,hasHeadOval:false,hasTrouserEnvelope:false,
    hasJointBlend:false,hasShell:false,hasGrip:false,poseAware:false,
    shellVersion:Number(root?.userData?.workerVisualShellVersion||0),
    jacketLuma:null,shirtLuma:null
  };
  root?.traverse?.(node=>{
    if(node.isMesh)m.meshes++;
    if(node.userData?.watercolorOutline!==false&&node.userData?.illustrationCharacterShell)m.directOutlinedMeshes++;
    if(node.userData?.outlineRole==='outer')m.outerContours++;
    if(node.userData?.paintLayer==='mass')m.massLayers++;
    if(node.userData?.paintLayer==='detail')m.detailLayers++;
    if(node.userData?.paintLayer==='ink')m.inkLayers++;
    const name=node.name||'';
    if(/jacket-mass/i.test(name)){m.hasJacket=true;m.jacketLuma=luminance(node.material);}
    if(/shirt-wash/i.test(name)){m.hasShirt=true;m.shirtLuma=luminance(node.material);}
    if(/black-tie/i.test(name))m.hasTie=true;
    if(/briefcase$/i.test(name))m.hasBriefcase=true;
    if(/pelvis-bridge/i.test(name))m.hasPelvisBridge=true;
    if(/head-oval/i.test(name))m.hasHeadOval=true;
    if(/trouser-(upper|lower)/i.test(name))m.hasTrouserEnvelope=true;
    if(/(knee|elbow)-blend/i.test(name))m.hasJointBlend=true;
  });
  m.hasShell=Boolean(root?.userData?.characterIllustrationShell);
  m.hasGrip=Boolean(root?.userData?.propGripConstraint);
  m.poseAware=Boolean(root?.userData?.poseAwareSilhouette);
  m.jacketDarkerThanShirt=
    m.jacketLuma!=null&&m.shirtLuma!=null&&(m.shirtLuma-m.jacketLuma)>=.18;
  return m;
}

export function scoreIllustrationCharacter(root){
  const m=inspectIllustrationCharacter(root);
  const checks=[
    ['shell v2',m.hasShell&&m.shellVersion>=2,12],
    ['pose-aware silhouette',m.poseAware,10],
    ['single outer contour',m.outerContours===1,10],
    ['no per-part shell outlines',m.directOutlinedMeshes===0,10],
    ['jacket',m.hasJacket,8],
    ['shirt',m.hasShirt,6],
    ['jacket darker than shirt',m.jacketDarkerThanShirt,10],
    ['black tie',m.hasTie,6],
    ['pelvis bridge',m.hasPelvisBridge,10],
    ['continuous trouser envelopes',m.hasTrouserEnvelope&&m.hasJointBlend,8],
    ['oval head shell',m.hasHeadOval,4],
    ['briefcase + grip',m.hasBriefcase&&m.hasGrip,4],
    ['semantic paint layers',m.massLayers>0&&m.detailLayers>0&&m.inkLayers>0,2]
  ];
  const score=checks.reduce((sum,[,pass,weight])=>sum+(pass?weight:0),0);
  return {score,pass:score>=85,checks:checks.map(([name,pass,weight])=>({name,pass,weight})),metrics:m};
}
