import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { reconstructVoxelModel, editVoxelModel } from '../../shared/pixel3d/multiview-voxel.mjs';

const $=id=>document.getElementById(id);
const canvas=$('canvas'),status=$('status');
let frontView=null,rightView=null,model=null,group=null,tool='orbit';
let yaw=.72,pitch=.42,distance=72,drag=null;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(2,devicePixelRatio));
renderer.setClearColor(0x0e1013,1);
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x0e1013,.006);
const camera=new THREE.PerspectiveCamera(48,1,.1,1000);
scene.add(new THREE.HemisphereLight(0xdcecff,0x251e18,2.2));
const key=new THREE.DirectionalLight(0xfff0d0,2.6);key.position.set(5,9,7);scene.add(key);
const rim=new THREE.DirectionalLight(0x8fc9ff,1.4);rim.position.set(-8,4,-6);scene.add(rim);
const gridHelper=new THREE.GridHelper(120,120,0x58616d,0x242b33);gridHelper.position.y=-.55;scene.add(gridHelper);

function resize(){
  const r=canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);
  camera.aspect=Math.max(.1,r.width/Math.max(1,r.height));camera.updateProjectionMatrix();
}
function updateCamera(){
  const cp=Math.cos(pitch);
  camera.position.set(Math.sin(yaw)*cp*distance,Math.sin(pitch)*distance,Math.cos(yaw)*cp*distance);
  camera.lookAt(0,0,0);
}
function rgbHex(n){return '#'+(Number(n)>>>0).toString(16).padStart(6,'0').slice(-6);}
function disposeGroup(){
  if(!group)return;scene.remove(group);
  group.traverse(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose?.();});
  group=null;
}
function buildMeshes(){
  disposeGroup();if(!model||!model.voxels.length)return;
  group=new THREE.Group();const buckets=new Map();
  for(const v of model.voxels){const a=buckets.get(v[3])||[];a.push(v);buckets.set(v[3],a);}
  const off=[(model.dimensions.width-1)/2,(model.dimensions.height-1)/2,(model.dimensions.depth-1)/2];
  for(const [pi,voxels] of buckets){
    const geo=new THREE.BoxGeometry(.96,.96,.96),mat=new THREE.MeshStandardMaterial({color:rgbHex(model.palette[pi]),roughness:.72,metalness:.04});
    const mesh=new THREE.InstancedMesh(geo,mat,voxels.length),m=new THREE.Matrix4();
    voxels.forEach((v,i)=>{m.makeTranslation(v[0]-off[0],v[1]-off[1],v[2]-off[2]);mesh.setMatrixAt(i,m);});
    mesh.instanceMatrix.needsUpdate=true;mesh.userData.voxels=voxels;group.add(mesh);
  }
  scene.add(group);document.body.classList.add('has-model');fitView();
}
function fitView(){
  if(!model)return;distance=Math.max(16,Math.max(model.dimensions.width,model.dimensions.height,model.dimensions.depth)*1.75);updateCamera();
}
function report(extra=''){
  if(!model){status.textContent='2 ортографических пиксельных эскиза → visual hull → редактируемый voxel 3D';return;}
  const f=model.validation?.perView?.front?.iou,r=model.validation?.perView?.right?.iou;
  const bad=model.inference?.incompatibleRows?.length||0;
  status.textContent=`VOXELS ${model.voxels.length.toLocaleString()} · IoU FRONT ${f==null?'edited':(f*100).toFixed(1)+'%'} · RIGHT ${r==null?'edited':(r*100).toFixed(1)+'%'} · conflict rows ${bad}${extra?' · '+extra:''}`;
}
function rebuild(){
  if(!frontView||!rightView){report();return;}
  model=reconstructVoxelModel([{...frontView,side:'front'},{...rightView,side:'right'}],{maxAxis:Number($('grid').value),includeFaceColors:true});
  buildMeshes();report(model.inference.incompatibleRows.length?'views disagree on some rows':'visual hull built');
}
function cornerColor(data,w,h){
  const pts=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]],sum=[0,0,0];
  for(const [x,y] of pts){const i=(y*w+x)*4;sum[0]+=data[i];sum[1]+=data[i+1];sum[2]+=data[i+2];}
  return sum.map(v=>v/4);
}
function clearConnectedBackground(imageData){
  const {data,width:w,height:h}=imageData,bg=cornerColor(data,w,h),seen=new Uint8Array(w*h),q=[];
  const near=i=>{const dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2];return dr*dr+dg*dg+db*db<42*42;};
  const push=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const p=y*w+x;if(seen[p])return;seen[p]=1;const i=p*4;if(near(i))q.push([x,y]);};
  for(let x=0;x<w;x++){push(x,0);push(x,h-1);}for(let y=0;y<h;y++){push(0,y);push(w-1,y);}
  for(let p=0;p<q.length;p++){const [x,y]=q[p],i=(y*w+x)*4;data[i+3]=0;push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1);}
  return imageData;
}
async function decodeFile(file){
  const bitmap=await createImageBitmap(file),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0);bitmap.close();
  let im=ctx.getImageData(0,0,c.width,c.height);if($('backgroundMode').value==='auto')im=clearConnectedBackground(im);
  return {width:c.width,height:c.height,data:im.data};
}
function rgbaImage(w,h,draw){
  const data=new Uint8ClampedArray(w*h*4),set=(x,y,c)=>{if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;data.set(c,i);};
  draw(set);return {width:w,height:h,data};
}
function makeDemo(){
  const front=rgbaImage(24,24,set=>{
    const stone=[166,118,78,255],light=[220,181,118,255],glass=[69,151,184,255];
    for(let y=6;y<22;y++)for(let x=5;x<19;x++)if(!(x>8&&x<15&&y>15))set(x,y,stone);
    for(let y=2;y<8;y++)for(let x=9-y%2;x<16+y%2;x++)set(x,y,light);
    for(let y=9;y<14;y++)for(const x of [7,11,16])set(x,y,glass);
    for(let y=18;y<24;y++){for(let x=4;x<9;x++)set(x,y,stone);for(let x=15;x<20;x++)set(x,y,stone);}
  });
  const right=rgbaImage(18,24,set=>{
    const stone=[135,94,67,255],light=[210,165,105,255],glass=[54,119,160,255];
    for(let y=6;y<22;y++)for(let z=5;z<14;z++)if(!(z>7&&z<11&&y>15))set(z,y,stone);
    for(let y=2;y<8;y++)for(let z=7;z<12;z++)set(z,y,light);
    for(let y=9;y<14;y++)for(const z of [6,10,13])set(z,y,glass);
    for(let y=18;y<24;y++){for(let z=4;z<8;z++)set(z,y,stone);for(let z=11;z<15;z++)set(z,y,stone);}
  });
  frontView=front;rightView=right;rebuild();
}
function setTool(next){
  tool=next;document.body.classList.toggle('editing',tool!=='orbit');
  document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
}
function hitVoxel(event){
  if(!group)return null;const r=canvas.getBoundingClientRect();
  pointer.set(((event.clientX-r.left)/r.width)*2-1,-((event.clientY-r.top)/r.height)*2+1);
  raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(group,true)[0];
  if(!hit||hit.instanceId==null)return null;const voxel=hit.object.userData.voxels?.[hit.instanceId];
  return voxel?{hit,voxel}:null;
}
function editAt(event){
  const found=hitVoxel(event);if(!found)return;const [x,y,z]=found.voxel,color=$('color').value;
  if(tool==='erase')model=editVoxelModel(model,[{type:'erase',x,y,z}]);
  if(tool==='paint')model=editVoxelModel(model,[{type:'paint',x,y,z,color}]);
  if(tool==='add'){
    const n=found.hit.face?.normal?.clone().round();if(!n)return;
    const p={x:x+n.x,y:y+n.y,z:z+n.z};const d=model.dimensions;
    if(p.x<0||p.y<0||p.z<0||p.x>=d.width||p.y>=d.height||p.z>=d.depth)return;
    model=editVoxelModel(model,[{type:'add',...p,color}]);
  }
  model.validation=null;buildMeshes();report(tool.toUpperCase());
}
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||tool!=='orbit')return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;yaw=drag.yaw-dx*.008;pitch=THREE.MathUtils.clamp(drag.pitch+dy*.006,-1.2,1.2);updateCamera();});
canvas.addEventListener('pointerup',e=>{if(tool!=='orbit'&&!drag?.moved)editAt(e);drag=null;try{canvas.releasePointerCapture(e.pointerId);}catch{}});
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(e.deltaY*.001),5,400);updateCamera();},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('frontFile').addEventListener('change',async e=>{frontView=e.target.files[0]?await decodeFile(e.target.files[0]):null;rebuild();});
$('rightFile').addEventListener('change',async e=>{rightView=e.target.files[0]?await decodeFile(e.target.files[0]):null;rebuild();});
$('grid').addEventListener('change',rebuild);$('backgroundMode').addEventListener('change',()=>report('reload images for BG mode'));
$('demo').addEventListener('click',makeDemo);$('resetView').addEventListener('click',fitView);
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
new ResizeObserver(resize).observe(canvas);resize();updateCamera();setTool('orbit');
renderer.setAnimationLoop(()=>renderer.render(scene,camera));
makeDemo();
