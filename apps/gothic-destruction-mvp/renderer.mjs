export function createGothicRenderer(THREE,coarse,{width=innerWidth,height=innerHeight,dpr=devicePixelRatio||1}={}){
  const renderer=new THREE.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance'});
  const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName=String(debugRenderer?gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
  const softwareRenderer=/swiftshader|llvmpipe|software/i.test(rendererName);
  const shadowsEnabled=!softwareRenderer;
  const maxDpr=softwareRenderer?.5:(coarse?1.12:1.45);
  const physicsHz=softwareRenderer?12:(coarse?32:48);
  const perShotFragmentBudget=softwareRenderer?48:(coarse?90:120);
  const activeFragmentBudget=softwareRenderer?96:(coarse?180:240);
  renderer.setPixelRatio(Math.min(dpr,maxDpr));
  renderer.setSize(width,height);
  renderer.shadowMap.enabled=shadowsEnabled;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  return {renderer,rendererName,softwareRenderer,shadowsEnabled,maxDpr,physicsHz,perShotFragmentBudget,activeFragmentBudget};
}
