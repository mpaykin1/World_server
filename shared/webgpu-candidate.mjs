export async function probeWebGPU(){
  const report={supported:!!navigator.gpu,active:false,renderPipeline:false,error:null};if(!navigator.gpu)return report;
  let renderer;
  try{
    const THREE=await import('three/webgpu'); const {pass}=await import('three/tsl');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.style.cssText='position:fixed;left:-10000px;top:-10000px;width:64px;height:64px';document.body.appendChild(canvas);
    renderer=new THREE.WebGPURenderer({canvas,antialias:false});await renderer.init();renderer.setSize(64,64,false);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.1,10);camera.position.z=2;scene.add(new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicNodeMaterial({color:0xffaa33})));
    const pipeline=new THREE.RenderPipeline(renderer);pipeline.outputNode=pass(scene,camera);pipeline.render();await renderer.backend?.device?.queue?.onSubmittedWorkDone?.();report.active=true;report.renderPipeline=true;canvas.remove();
  }catch(error){report.error=String(error?.message||error);try{renderer?.dispose?.()}catch{}}
  window.__WEBGPU_CANDIDATE_REPORT__=report;return report;
}
