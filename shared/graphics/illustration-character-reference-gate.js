// Structural reference gate for Illustration-First characters.
// It deliberately judges construction invariants that correlate with the approved sketch language.

export function inspectIllustrationCharacter(root){
  const metrics={
    meshes:0,
    directOutlinedMeshes:0,
    outerContours:0,
    massLayers:0,
    detailLayers:0,
    inkLayers:0,
    hasJacket:false,
    hasTie:false,
    hasBriefcase:false,
    hasShell:false,
    hasGrip:false,
    poseAware:false
  };
  root?.traverse?.((node)=>{
    if(node.isMesh)metrics.meshes++;
    if(node.userData?.watercolorOutline!==false&&node.userData?.illustrationCharacterShell)metrics.directOutlinedMeshes++;
    if(node.userData?.outlineRole==='outer')metrics.outerContours++;
    if(node.userData?.paintLayer==='mass')metrics.massLayers++;
    if(node.userData?.paintLayer==='detail')metrics.detailLayers++;
    if(node.userData?.paintLayer==='ink')metrics.inkLayers++;
    if(/jacket/i.test(node.name||''))metrics.hasJacket=true;
    if(/black-tie|tie-body|tie-knot/i.test(node.name||''))metrics.hasTie=true;
    if(/briefcase/i.test(node.name||''))metrics.hasBriefcase=true;
  });
  metrics.hasShell=Boolean(root?.userData?.characterIllustrationShell);
  metrics.hasGrip=Boolean(root?.userData?.propGripConstraint);
  metrics.poseAware=Boolean(root?.userData?.poseAwareSilhouette);
  return metrics;
}

export function scoreIllustrationCharacter(root){
  const m=inspectIllustrationCharacter(root);
  const checks=[
    ['shell',m.hasShell,18],
    ['pose-aware silhouette',m.poseAware,14],
    ['single outer contour',m.outerContours===1,14],
    ['no per-part shell outlines',m.directOutlinedMeshes===0,14],
    ['jacket grammar',m.hasJacket,10],
    ['black tie',m.hasTie,8],
    ['briefcase',m.hasBriefcase,8],
    ['prop grip',m.hasGrip,6],
    ['semantic paint layers',m.massLayers>0&&m.detailLayers>0&&m.inkLayers>0,8]
  ];
  const score=checks.reduce((sum,[,pass,weight])=>sum+(pass?weight:0),0);
  return {
    score,
    pass:score>=85,
    checks:checks.map(([name,pass,weight])=>({name,pass,weight})),
    metrics:m
  };
}