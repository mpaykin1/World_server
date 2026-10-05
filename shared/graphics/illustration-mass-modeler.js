// Illustration-first 3D: build visible objects from painted masses and semantic strokes.
// The 3D mesh is scaffolding for depth/animation; the illustration grammar owns the visible form.
import {stableSeed} from './living-watercolor-3d.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function makeRng(seed){
  let s=(stableSeed(seed)||1)>>>0;
  return ()=>{
    s^=s<<13;s^=s>>>17;s^=s<<5;
    return (s>>>0)/4294967295;
  };
}

export function createMassProfile({
  seed='mass',width=5,height=2.2,topWidth=.62,
  leftShoulder=.68,rightShoulder=.72,baseLift=.02
}={}){
  const r=makeRng(seed),hw=width*.5,tw=topWidth*.5;
  const jitter=(a)=>1+(r()-.5)*a;
  return [
    [-hw,baseLift],
    [-hw*.83, height*.12*jitter(.20)],
    [-hw*.62, height*.31*jitter(.16)],
    [-hw*.42, height*.52*jitter(.12)],
    [-hw*leftShoulder*.34, height*.73*jitter(.10)],
    [-tw, height*.93*jitter(.06)],
    [ tw, height*jitter(.045)],
    [ hw*rightShoulder*.34, height*.75*jitter(.10)],
    [ hw*.44, height*.54*jitter(.12)],
    [ hw*.65, height*.33*jitter(.16)],
    [ hw*.86, height*.13*jitter(.20)],
    [ hw,baseLift]
  ];
}

function shapeFromPoints(THREE,points){
  const shape=new THREE.Shape();
  shape.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);
  shape.closePath();
  return shape;
}

export function createPaintMass(THREE,{
  seed='mass',profile=null,width=5,height=2.2,topWidth=.62,
  depth=1.1,color='#aab3bd',opacity=1,position=[0,0,0],
  outline=true,name='illustration-mass'
}={}){
  const pts=profile||createMassProfile({seed,width,height,topWidth});
  const shape=shapeFromPoints(THREE,pts);
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth,steps:1,curveSegments:16,bevelEnabled:true,
    bevelSegments:2,bevelSize:.018,bevelThickness:.018
  });
  geometry.translate(0,0,-depth*.5);
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({
    color,roughness:1,metalness:0,transparent:opacity<1,opacity
  });
  const m=new THREE.Mesh(geometry,material);
  m.name=name;
  m.position.set(...position);
  m.userData={...(m.userData||{}),watercolorOutline:outline,illustrationMass:true,seed:stableSeed(seed)};
  return m;
}

function irregularEllipse(seed,rx,rz,count=28){
  const r=makeRng(seed),pts=[];
  for(let i=0;i<count;i++){
    const a=i/count*TAU;
    const wobble=1+(r()-.5)*.24+.045*Math.sin(a*3+stableSeed(seed)*.0001);
    pts.push([Math.cos(a)*rx*wobble,Math.sin(a)*rz*wobble]);
  }
  return pts;
}

export function createPaintedVoid(THREE,{
  seed='void',rx=.62,rz=.34,color='#2e425d',opacity=.46,
  position=[0,2.05,.08],name='painted-void'
}={}){
  const pts=irregularEllipse(seed,rx,rz);
  const shape=shapeFromPoints(THREE,pts);
  const geometry=new THREE.ShapeGeometry(shape,24);
  const material=new THREE.MeshBasicMaterial({
    color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide
  });
  const m=new THREE.Mesh(geometry,material);
  m.rotation.x=-Math.PI/2;
  m.position.set(...position);
  m.name=name;
  m.userData={watercolorOutline:false,watercolorSkipWash:true,illustrationVoid:true,seed:stableSeed(seed)};
  return m;
}

export function createPaintStroke(THREE,points,{
  seed='stroke',color='#2e425d',radius=.055,opacity=.62,name='illustration-stroke'
}={}){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geometry=new THREE.TubeGeometry(curve,Math.max(18,points.length*8),radius,7,false);
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true});
  const m=new THREE.Mesh(geometry,material);
  m.name=name;
  m.userData={
    watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,
    illustrationStroke:true,seed:stableSeed(seed)
  };
  return m;
}

export function createIllustrationMassModeler(THREE,{ink='#2e425d',wash='#aab3bd'}={}){
  return {
    mass:(options={})=>createPaintMass(THREE,{color:wash,...options}),
    void:(options={})=>createPaintedVoid(THREE,{color:ink,...options}),
    stroke:(points,options={})=>createPaintStroke(THREE,points,{color:ink,...options})
  };
}
