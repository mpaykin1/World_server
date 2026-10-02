import * as THREE from './vendor/three-r160/three.module.min.js';

export const STYLE={
  paper:0xf8f4ed,
  ink:0x43566a,
  inkSoft:0x71808e,
  wash:0x9aa8b2,
  warm:0xc7b7a4,
  plant:0x7f9185,
  glass:0xdfe8ec,
  screen:0xeaf0f2,
  suit:[0x506579,0x667684,0x756c66,0x58695f,0x445a70,0x68717d]
};

export function seeded(seed,a=0,b=0){
  let x=(seed^Math.imul(a+1,0x9e3779b1)^Math.imul(b+1,0x85ebca6b))>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return (x>>>0)/4294967296;
}

function makeSoftTexture(inner='#71808e',outer='rgba(113,128,142,0)'){
  const c=document.createElement('canvas');c.width=c.height=128;
  const x=c.getContext('2d'),g=x.createRadialGradient(64,64,4,64,64,61);
  g.addColorStop(0,inner);g.addColorStop(.38,inner);g.addColorStop(1,outer);
  x.fillStyle=g;x.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}

export function createNprContext(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
  renderer.setClearColor(STYLE.paper,1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.sortObjects=true;

  const scene=new THREE.Scene();scene.background=new THREE.Color(STYLE.paper);
  scene.fog=new THREE.FogExp2(STYLE.paper,.018);
  const camera=new THREE.PerspectiveCamera(52,1,.08,90);
  camera.position.set(0,1.62,-2.2);
  const hemi=new THREE.HemisphereLight(0xffffff,0xc8b9aa,1.9);scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffffff,.55);key.position.set(-5,10,-2);scene.add(key);

  const shadowTexture=makeSoftTexture('rgba(64,79,92,.48)','rgba(64,79,92,0)');
  const washTexture=makeSoftTexture('rgba(125,143,157,.40)','rgba(125,143,157,0)');
  const metrics={meshes:0,edgeSets:0,triangles:0,drawCalls:0,hiddenLine:true,depthTest:true};

  function resize(){
    const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;
    const pr=Math.min(devicePixelRatio||1,1.7);
    if(canvas.width!==Math.round(w*pr)||canvas.height!==Math.round(h*pr)){
      renderer.setPixelRatio(pr);renderer.setSize(w,h,false);
      camera.aspect=w/h;camera.fov=w<h?58:48;camera.updateProjectionMatrix();
    }
  }

  function material(color,opacity=.16){
    return new THREE.MeshLambertMaterial({
      color,transparent:true,opacity,depthTest:true,depthWrite:true,
      side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1
    });
  }

  function edgeMaterial(color=STYLE.ink,opacity=.42){
    return new THREE.LineBasicMaterial({color,transparent:true,opacity,depthTest:true,depthWrite:false,toneMapped:false});
  }

  function addInkMesh(parent,geometry,opt={}){
    const mesh=new THREE.Mesh(geometry,material(opt.color??STYLE.wash,opt.opacity??.13));
    mesh.position.copy(opt.position||new THREE.Vector3());
    if(opt.rotation)mesh.rotation.set(opt.rotation.x||0,opt.rotation.y||0,opt.rotation.z||0);
    if(opt.scale)mesh.scale.copy(opt.scale);
    mesh.renderOrder=opt.renderOrder??1;
    mesh.userData.semantic=opt.semantic||'prop';
    mesh.userData.importance=opt.importance??.6;
    parent.add(mesh);metrics.meshes++;
    const pos=geometry.attributes?.position;
    if(pos)metrics.triangles+=geometry.index?geometry.index.count/3:pos.count/3;
    if(opt.edges!==false){
      const threshold=opt.edgeThreshold??32;
      const eg=new THREE.EdgesGeometry(geometry,threshold);
      const edges=new THREE.LineSegments(eg,edgeMaterial(opt.edgeColor??STYLE.ink,opt.edgeOpacity??.42));
      edges.renderOrder=(opt.renderOrder??1)+1;
      edges.userData.isInkEdge=true;edges.userData.semantic=mesh.userData.semantic;
      mesh.add(edges);metrics.edgeSets++;
    }
    return mesh;
  }

  function box(parent,size,pos,opt={}){
    return addInkMesh(parent,new THREE.BoxGeometry(size[0],size[1],size[2]),{...opt,position:new THREE.Vector3(pos[0],pos[1],pos[2])});
  }
  function cyl(parent,radius,height,pos,opt={}){
    return addInkMesh(parent,new THREE.CylinderGeometry(radius,radius*.92,height,opt.segments||8),{...opt,position:new THREE.Vector3(pos[0],pos[1],pos[2])});
  }
  function sphere(parent,radius,pos,opt={}){
    return addInkMesh(parent,new THREE.SphereGeometry(radius,opt.w||10,opt.h||7),{...opt,position:new THREE.Vector3(pos[0],pos[1],pos[2])});
  }

  function softPlane(parent,pos,sx,sz,opacity=.10,kind='shadow',seed=1){
    const mat=new THREE.MeshBasicMaterial({
      map:kind==='shadow'?shadowTexture:washTexture,color:kind==='shadow'?0x66717b:0xa1acb4,
      transparent:true,opacity,depthWrite:false,depthTest:true,side:THREE.DoubleSide
    });
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),mat);
    plane.rotation.x=-Math.PI/2;plane.position.set(pos[0],pos[1],pos[2]);
    plane.position.x+=(seeded(seed,2)-.5)*.04;plane.position.z+=(seeded(seed,3)-.5)*.04;
    plane.renderOrder=0;parent.add(plane);return plane;
  }

  function glassPanel(parent,w,h,pos,seed=1){
    const g=new THREE.PlaneGeometry(w,h);
    const mat=new THREE.MeshBasicMaterial({color:STYLE.glass,transparent:true,opacity:.045,depthTest:true,depthWrite:false,side:THREE.DoubleSide});
    const p=new THREE.Mesh(g,mat);p.position.set(pos[0],pos[1],pos[2]);parent.add(p);
    const frame=edgeMaterial(STYLE.inkSoft,.24);
    const points=[
      new THREE.Vector3(-w/2,-h/2,0),new THREE.Vector3(w/2,-h/2,0),
      new THREE.Vector3(w/2,h/2,0),new THREE.Vector3(-w/2,h/2,0),new THREE.Vector3(-w/2,-h/2,0)
    ];
    const lg=new THREE.BufferGeometry().setFromPoints(points),line=new THREE.Line(lg,frame);
    line.position.z=.006;p.add(line);
    const divisions=Math.max(1,Math.floor(w/1.5));
    for(let i=1;i<divisions;i++){
      if(Math.abs(i/divisions-.5)<.18)continue;
      const x=-w/2+w*i/divisions;
      const vg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,-h/2,.006),new THREE.Vector3(x,h/2,.006)]);
      p.add(new THREE.Line(vg,edgeMaterial(STYLE.inkSoft,.17)));
    }
    p.userData.semantic='glass';p.userData.seed=seed;return p;
  }

  function applyArtisticLod(root,cameraPos){
    root.traverse(o=>{
      if(!o.visible||!o.userData)return;
      const nearOnly=o.userData.nearOnly,midOnly=o.userData.midOnly;
      if(!nearOnly&&!midOnly)return;
      const wp=new THREE.Vector3();o.getWorldPosition(wp);const d=wp.distanceTo(cameraPos);
      if(nearOnly)o.visible=d<11;
      if(midOnly)o.visible=d<22;
    });
  }

  function render(){
    resize();applyArtisticLod(scene,camera.position);
    renderer.render(scene,camera);
    const info=renderer.info.render;metrics.drawCalls=info.calls;metrics.triangles=info.triangles;
    return {...metrics};
  }

  return {THREE,renderer,scene,camera,metrics,resize,render,addInkMesh,box,cyl,sphere,softPlane,glassPanel,edgeMaterial,material};
}
