// Sketch-first procedural geometry for Living Watercolor 3D v2.
// The helpers clone/deform geometry and never mutate gameplay source meshes.
import {stableSeed,hash01} from './living-watercolor-3d.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function organicDisplacementAt(x,y,z,{seed=0,amount=.03,scale=1}={}){
  const s=(stableSeed(seed)%10000)*.001;
  const f=Math.max(.05,Number(scale)||1);
  const n1=Math.sin((x*1.73+y*.91+z*1.27)*f+s*1.3);
  const n2=Math.sin((x*.61-y*1.43+z*1.91)*f+s*2.1);
  const n3=Math.sin((x*2.31+y*1.17-z*.53)*f+s*.7);
  return (n1*.52+n2*.31+n3*.17)*amount;
}

export function deformGeometryOrganic(THREE,geometry,options={}){
  if(!THREE||!geometry?.attributes?.position)return geometry?.clone?.()||geometry;
  const g=geometry.clone();
  const p=g.attributes.position;
  const amount=clamp(options.amount??.03,0,.25);
  const scale=options.scale??1;
  const vertical=clamp(options.vertical??1,0,2);
  const seed=options.seed??0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const d=organicDisplacementAt(x,y,z,{seed,amount,scale});
    const len=Math.max(.001,Math.hypot(x,y,z));
    p.setXYZ(i,x+(x/len)*d,y+(y/len)*d*vertical,z+(z/len)*d);
  }
  p.needsUpdate=true;g.computeVertexNormals?.();g.computeBoundingBox?.();g.computeBoundingSphere?.();
  g.userData={...(g.userData||{}),livingWatercolorOrganic:true,seed:stableSeed(seed)};
  return g;
}

function stdMat(THREE,color,opacity=1){
  return new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,transparent:opacity<1,opacity});
}
function inkMat(THREE,color,opacity=.78){
  const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true});
  m.userData={livingWatercolorSemanticInk:true};return m;
}
function mesh(THREE,geometry,material,{outline=true,skipWash=false,name=''}={}){
  const m=new THREE.Mesh(geometry,material);m.name=name;
  m.userData={...(m.userData||{}),watercolorOutline:outline,watercolorSkipWash:skipWash};
  return m;
}

export function createSemanticStroke(THREE,points,{color='#2e425d',radius=.025,opacity=.76,seed=0}={}){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>p.clone?.()||new THREE.Vector3(p.x,p.y,p.z)));
  const g=new THREE.TubeGeometry(curve,Math.max(8,points.length*6),radius,6,false);
  const s=mesh(THREE,g,inkMat(THREE,color,opacity),{outline:false,skipWash:true,name:'__watercolorSemanticStroke'});
  s.userData.watercolorSemantic=true;s.userData.seed=stableSeed(seed);return s;
}

function gableGeometry(THREE,w=2.6,h=.9,d=2.1){
  const x=w/2,z=d/2,y0=0,y1=h;
  const verts=[
    -x,y0,-z, x,y0,-z, 0,y1,-z,
    -x,y0, z, x,y0, z, 0,y1, z
  ];
  const idx=[0,1,2, 3,5,4, 0,2,5,0,5,3, 1,4,5,1,5,2];
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function lumpyCanopyGeometry(THREE,{seed='tree-canopy',radius=1.6}={}){
  const g=new THREE.SphereGeometry(radius,36,24);
  const p=g.attributes.position,s=stableSeed(seed);
  for(let i=0;i<p.count;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const len=Math.max(.001,Math.hypot(x,y,z)),nx=x/len,ny=y/len,nz=z/len;
    const lobes=.16*Math.sin(nx*5.2+(s%17))+.12*Math.sin(nz*6.1+(s%29)*.31)+.08*Math.sin((nx+nz)*8.3+ny*2.2);
    const jitter=organicDisplacementAt(nx,ny,nz,{seed:s,amount:.065,scale:1.7});
    const r=1+lobes+jitter;
    x=nx*radius*r*1.18;y=ny*radius*r*.78;z=nz*radius*r*.96;
    p.setXYZ(i,x,y,z);
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();return g;
}

function taperedBentTrunk(THREE,{seed='tree-trunk',height=2.45,r0=.48,r1=.24,segments=14,radial=14}={}){
  const verts=[],idx=[],s=stableSeed(seed);
  for(let j=0;j<=segments;j++){
    const t=j/segments,y=t*height;
    const bx=Math.sin(t*2.2+s*.0002)*.10*t+Math.sin(t*5.1+s*.0007)*.025;
    const bz=Math.sin(t*2.9+s*.0004)*.055*t;
    const r=(r0+(r1-r0)*t)*(1+organicDisplacementAt(t,0,0,{seed:s,amount:.06,scale:2}));
    for(let i=0;i<radial;i++){
      const a=i/radial*Math.PI*2;
      verts.push(bx+Math.cos(a)*r,y,bz+Math.sin(a)*r);
    }
  }
  for(let j=0;j<segments;j++)for(let i=0;i<radial;i++){
    const a=j*radial+i,b=j*radial+(i+1)%radial,c=(j+1)*radial+(i+1)%radial,d=(j+1)*radial+i;
    idx.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function volcanoGeometry(THREE,{seed='volcano',height=2.4,radius=2.35,segments=36,rings=8}={}){
  const verts=[],idx=[],s=stableSeed(seed);
  for(let j=0;j<=rings;j++){
    const t=j/rings,y=t*height;
    const base=(radius*(1-t*.72))*(1-.05*Math.sin(t*Math.PI));
    for(let i=0;i<segments;i++){
      const a=i/segments*Math.PI*2;
      const asymmetric=1+.08*Math.sin(a*2.3+s*.0003)+.05*Math.sin(a*5.1+s*.0007)+organicDisplacementAt(Math.cos(a),t,Math.sin(a),{seed:s,amount:.045,scale:1.4});
      const r=base*asymmetric;
      verts.push(Math.cos(a)*r,y,Math.sin(a)*r*.90);
    }
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){
    const a=j*segments+i,b=j*segments+(i+1)%segments,c=(j+1)*segments+(i+1)%segments,d=(j+1)*segments+i;
    idx.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

export function createWatercolorHouse(THREE,{seed='house',ink='#2e425d',wash='#aeb7c0'}={}){
  const g=new THREE.Group();g.name='watercolor-house';
  const body=mesh(THREE,deformGeometryOrganic(THREE,new THREE.BoxGeometry(2.55,1.72,2.05,3,3,3),{seed:seed+':body',amount:.018,scale:.9}),stdMat(THREE,wash),{name:'house-body'});
  body.position.y=.86;g.add(body);
  const roof=mesh(THREE,deformGeometryOrganic(THREE,gableGeometry(THREE,2.9,1.0,2.35),{seed:seed+':roof',amount:.025,scale:1.1}),stdMat(THREE,'#738296'),{name:'house-roof'});
  roof.position.y=1.68;g.add(roof);
  const chimney=mesh(THREE,deformGeometryOrganic(THREE,new THREE.BoxGeometry(.32,.85,.34,2,3,2),{seed:seed+':chimney',amount:.012}),stdMat(THREE,'#98a4b1'),{name:'house-chimney'});
  chimney.position.set(.58,2.48,.14);g.add(chimney);
  const door=mesh(THREE,new THREE.BoxGeometry(.55,.92,.045),inkMat(THREE,ink,.42),{outline:false,skipWash:true,name:'house-door'});door.position.set(-.58,.50,1.04);g.add(door);
  const win=mesh(THREE,new THREE.BoxGeometry(.72,.58,.04),inkMat(THREE,ink,.25),{outline:false,skipWash:true,name:'house-window'});win.position.set(.55,.93,1.05);g.add(win);
  g.add(createSemanticStroke(THREE,[new THREE.Vector3(-1.45,1.68,1.17),new THREE.Vector3(0,2.68,1.17),new THREE.Vector3(1.45,1.68,1.17)],{color:ink,radius:.035,seed:seed+':gable'}));
  g.add(createSemanticStroke(THREE,[new THREE.Vector3(-1.32,1.68,1.18),new THREE.Vector3(1.32,1.68,1.18)],{color:ink,radius:.028,opacity:.62,seed:seed+':eave'}));
  g.add(createSemanticStroke(THREE,[new THREE.Vector3(.55,.48,1.08),new THREE.Vector3(.55,1.38,1.08)],{color:ink,radius:.018,opacity:.52,seed:seed+':window-v'}));
  g.add(createSemanticStroke(THREE,[new THREE.Vector3(.18,.93,1.08),new THREE.Vector3(.92,.93,1.08)],{color:ink,radius:.018,opacity:.52,seed:seed+':window-h'}));
  g.add(createSemanticStroke(THREE,[new THREE.Vector3(-.86,.05,1.08),new THREE.Vector3(-.86,.98,1.08),new THREE.Vector3(-.30,.98,1.08)],{color:ink,radius:.020,opacity:.48,seed:seed+':door-frame'}));
  return g;
}

export function createWatercolorTree(THREE,{seed='tree',ink='#2e425d',wash='#98a5b3'}={}){
  const g=new THREE.Group();g.name='watercolor-tree';
  const trunk=mesh(THREE,taperedBentTrunk(THREE,{seed:seed+':trunk'}),stdMat(THREE,'#7f8c9d'),{name:'tree-trunk'});g.add(trunk);
  const branchL=createSemanticStroke(THREE,[new THREE.Vector3(-.02,1.65,0),new THREE.Vector3(-.38,2.15,.02),new THREE.Vector3(-.62,2.52,.03)],{color:ink,radius:.075,opacity:.60,seed:seed+':branch-l'});
  const branchR=createSemanticStroke(THREE,[new THREE.Vector3(.04,1.70,0),new THREE.Vector3(.40,2.16,0),new THREE.Vector3(.62,2.50,-.04)],{color:ink,radius:.07,opacity:.60,seed:seed+':branch-r'});g.add(branchL,branchR);
  const canopy=mesh(THREE,lumpyCanopyGeometry(THREE,{seed:seed+':canopy',radius:1.46}),stdMat(THREE,wash),{name:'tree-canopy'});canopy.position.set(.04,3.05,0);g.add(canopy);
  return g;
}

export function createWatercolorVolcano(THREE,{seed='volcano',ink='#2e425d',wash='#aab3bd'}={}){
  const g=new THREE.Group();g.name='watercolor-volcano';
  const cone=mesh(THREE,volcanoGeometry(THREE,{seed}),stdMat(THREE,wash),{name:'volcano-body'});g.add(cone);
  const rim=mesh(THREE,deformGeometryOrganic(THREE,new THREE.TorusGeometry(.72,.105,10,42),{seed:seed+':rim',amount:.018,scale:1.3}),inkMat(THREE,ink,.45),{outline:false,skipWash:true,name:'volcano-rim'});
  rim.position.y=2.38;rim.rotation.x=Math.PI/2;g.add(rim);
  const channels=[-.95,-.26,.44,1.12];
  channels.forEach((x,i)=>{
    const a=x*.52,top=new THREE.Vector3(Math.sin(a)*.56,2.30,Math.cos(a)*.48);
    const mid=new THREE.Vector3(Math.sin(a)*1.10+(i-1.5)*.04,1.30,Math.cos(a)*.88);
    const bot=new THREE.Vector3(Math.sin(a)*2.02+(i-1.5)*.08,.12,Math.cos(a)*1.55);
    g.add(createSemanticStroke(THREE,[top,mid,bot],{color:ink,radius:.045+.01*(i%2),opacity:.67,seed:seed+':channel:'+i}));
  });
  return g;
}

export function createWatercolorPlant(THREE,{seed='plant',ink='#2e425d',wash='#aab3bd'}={}){
  const g=new THREE.Group();g.name='watercolor-plant';
  const body=mesh(THREE,deformGeometryOrganic(THREE,new THREE.BoxGeometry(2.35,1.20,1.72,3,3,3),{seed:seed+':body',amount:.015}),stdMat(THREE,wash),{name:'plant-body'});body.position.y=.60;g.add(body);
  const annex=mesh(THREE,deformGeometryOrganic(THREE,new THREE.BoxGeometry(1.05,.78,1.0,2,2,2),{seed:seed+':annex',amount:.018}),stdMat(THREE,wash),{name:'plant-annex'});annex.position.set(1.25,.39,.28);g.add(annex);
  const stack=mesh(THREE,deformGeometryOrganic(THREE,new THREE.CylinderGeometry(.22,.30,3.0,24,4),{seed:seed+':stack',amount:.012}),stdMat(THREE,'#98a4b1'),{name:'plant-stack'});stack.position.set(-.64,2.04,0);g.add(stack);
  const pts=[];for(let i=0;i<=28;i++){const y=i/28*2.82,r=.61+.37*Math.pow(Math.abs(y/2.82-.50)*2,1.65);pts.push(new THREE.Vector2(r,y));}
  const tower=mesh(THREE,deformGeometryOrganic(THREE,new THREE.LatheGeometry(pts,40),{seed:seed+':tower',amount:.022,scale:.8,vertical:.35}),stdMat(THREE,'#aeb7c0'),{name:'plant-cooling-tower'});tower.position.set(1.55,0,-.30);g.add(tower);
  const door=mesh(THREE,new THREE.BoxGeometry(.45,.62,.04),inkMat(THREE,ink,.40),{outline:false,skipWash:true});door.position.set(-.55,.35,.88);g.add(door);
  for(let i=0;i<4;i++){const w=mesh(THREE,new THREE.BoxGeometry(.22,.18,.035),inkMat(THREE,ink,.26),{outline:false,skipWash:true});w.position.set(-.96+i*.43,.78,.88);g.add(w);}
  for(let i=0;i<3;i++)g.add(createSemanticStroke(THREE,[new THREE.Vector3(-.82+i*.48,1.23,.66),new THREE.Vector3(-.58+i*.48,1.23,.66)],{color:ink,radius:.027,opacity:.48,seed:seed+':roof:'+i}));
  for(let i=0;i<2;i++){const band=mesh(THREE,new THREE.TorusGeometry(.255,.024,6,24),inkMat(THREE,ink,.46),{outline:false,skipWash:true,name:'plant-stack-band'});band.position.set(-.64,2.35+i*.42,0);band.rotation.x=Math.PI/2;g.add(band);}
  const towerRim=mesh(THREE,new THREE.TorusGeometry(.98,.032,8,40),inkMat(THREE,ink,.52),{outline:false,skipWash:true,name:'plant-tower-rim'});towerRim.position.set(1.55,2.82,-.30);towerRim.rotation.x=Math.PI/2;g.add(towerRim);
  return g;
}

export function createIllustrationCamera(THREE,{width=1,height=1,viewHeight=7.2,position=[6.5,5.2,9.5],lookAt=[0,1.4,0]}={}){
  const aspect=Math.max(.2,width/Math.max(1,height)),half=viewHeight/2;
  const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.1,100);
  camera.position.set(...position);camera.lookAt(...lookAt);
  camera.userData={...(camera.userData||{}),livingWatercolorIllustrationCamera:true,viewHeight};
  camera.updateForViewport=(w,h)=>{const a=Math.max(.2,w/Math.max(1,h)),hh=camera.userData.viewHeight/2;camera.left=-hh*a;camera.right=hh*a;camera.top=hh;camera.bottom=-hh;camera.updateProjectionMatrix();};
  return camera;
}
