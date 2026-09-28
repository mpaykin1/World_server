import * as THREE from 'three';
import {createLivingWatercolor3D,createWatercolorStyle} from '../../shared/graphics/living-watercolor-3d.js';

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(39,innerWidth/innerHeight,.1,100);
camera.position.set(6.7,5.4,10.8);camera.lookAt(0,1.45,0);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const quality=window.GoldenQualityDirector?.create?.({renderer,targetFps:50});
const style=createWatercolorStyle({seed:'living-watercolor-lab',inkColor:'#2e425d',washColor:'#718399',edgeWidth:.046,edgeJitter:.28,granulation:.5,bleed:.24,shadowWash:.13});
const watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style});
scene.add(new THREE.HemisphereLight(0xffffff,0x9aa4b0,2.6));const key=new THREE.DirectionalLight(0xffffff,1.45);key.position.set(4,8,5);scene.add(key);
const stage=new THREE.Group();scene.add(stage);
const mat=(color='#8794a4')=>new THREE.MeshStandardMaterial({color,roughness:1,metalness:0});
const ink='#526176',pale='#8794a4',light='#aeb7c0';
function mesh(g,m=mat()){const x=new THREE.Mesh(g,m);x.castShadow=false;x.receiveShadow=false;return x;}
function house(){const g=new THREE.Group();const body=mesh(new THREE.BoxGeometry(2.55,1.75,2.1),mat(light));body.position.y=.88;g.add(body);const roof=mesh(new THREE.ConeGeometry(1.95,1.0,4),mat(ink));roof.position.y=2.17;roof.rotation.y=Math.PI/4;roof.scale.z=.82;g.add(roof);const chimney=mesh(new THREE.BoxGeometry(.34,.82,.34),mat(pale));chimney.position.set(.58,2.62,.12);g.add(chimney);const door=mesh(new THREE.BoxGeometry(.56,.96,.055),mat(ink));door.position.set(-.58,.52,1.075);g.add(door);const windowMesh=mesh(new THREE.BoxGeometry(.72,.62,.05),mat(pale));windowMesh.position.set(.55,.92,1.08);g.add(windowMesh);return g;}
function tree(){const g=new THREE.Group();const trunk=mesh(new THREE.CylinderGeometry(.3,.5,2.45,20),mat(ink));trunk.position.y=1.22;trunk.rotation.z=-.07;g.add(trunk);for(const [x,y,a] of [[-.23,2.18,-.65],[.25,2.2,.58]]){const b=mesh(new THREE.CylinderGeometry(.12,.18,1.15,14),mat(ink));b.position.set(x,y,0);b.rotation.z=a;g.add(b);}const centers=[[-.72,2.72,0],[.02,3.0,.06],[.78,2.78,.02],[-.2,3.48,.04],[.52,3.47,-.14]];for(const [x,y,z] of centers){const leaf=mesh(new THREE.SphereGeometry(.94,32,22),mat(pale));leaf.position.set(x,y,z);leaf.scale.set(1.15,.82,1);g.add(leaf);}return g;}
function volcano(){const g=new THREE.Group();const cone=mesh(new THREE.CylinderGeometry(.72,2.35,2.45,40,3,false),mat(pale));cone.position.y=1.22;g.add(cone);const rim=mesh(new THREE.TorusGeometry(.78,.11,10,40),mat(ink));rim.position.y=2.48;rim.rotation.x=Math.PI/2;g.add(rim);return g;}
function plant(){const g=new THREE.Group();const body=mesh(new THREE.BoxGeometry(2.25,1.25,1.7),mat(light));body.position.y=.63;g.add(body);const annex=mesh(new THREE.BoxGeometry(1.05,.82,1.08),mat(light));annex.position.set(1.18,.41,.28);g.add(annex);const stack=mesh(new THREE.CylinderGeometry(.22,.3,3,22),mat(pale));stack.position.set(-.6,2.05,0);g.add(stack);const pts=[];for(let i=0;i<=24;i++){const y=i/24*2.8,r=.62+.34*Math.pow(Math.abs(y/2.8-.52)*2,1.7);pts.push(new THREE.Vector2(r,y));}const tower=mesh(new THREE.LatheGeometry(pts,32),mat(pale));tower.position.set(1.35,0,-.34);g.add(tower);return g;}
const names=['house','tree','volcano','plant'],items=[house(),tree(),volcano(),plant()];
items.forEach((o,i)=>{o.rotation.y=[.42,-.18,.28,-.34][i];o.scale.setScalar([1.05,.92,1.08,.9][i]);stage.add(o);watercolor.apply(o,{seed:names[i]});watercolor.addGroundWash(o,{x:0,z:0,width:i===1?2.5:3.0,depth:i===1?1.55:1.8,seed:'shadow:'+i});});
const smokeVol=watercolor.createBrushEmitter({parent:items[2],origin:new THREE.Vector3(0,2.62,0),count:13,scale:.5,rise:.55,spread:.55,wind:.07,seed:'volcano-smoke',opacity:.18});
const smokePlant=watercolor.createBrushEmitter({parent:items[3],origin:new THREE.Vector3(-.6,3.58,0),count:10,scale:.4,rise:.46,spread:.38,wind:.1,seed:'plant-smoke',opacity:.16});
let active=Math.max(0,names.indexOf(new URLSearchParams(location.search).get('object')||'house'));
function show(index){active=(index+items.length)%items.length;items.forEach((o,i)=>o.visible=i===active);document.querySelectorAll('#chooser button').forEach((b,i)=>b.classList.toggle('active',i===active));document.getElementById('label').textContent='LIVING WATERCOLOR 3D · '+names[active].toUpperCase();history.replaceState(null,'','?object='+names[active]);}
document.querySelectorAll('#chooser button').forEach((button,index)=>button.addEventListener('click',()=>show(index)));show(active);
let targetX=0,targetY=0,currentX=0,currentY=0;addEventListener('pointermove',e=>{if(e.target.closest?.('#chooser'))return;targetX=(e.clientX/innerWidth-.5)*.42;targetY=(e.clientY/innerHeight-.5)*.12;},{passive:true});
function animate(t){currentX+=(targetX-currentX)*.035;currentY+=(targetY-currentY)*.035;stage.rotation.y=currentX;stage.rotation.x=currentY;items[1].rotation.z=Math.sin(t*.00055)*.018;watercolor.tick(t);renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.__LIVING_WATERCOLOR_3D_READY__={ready:true,version:'1.1.0',features:['watercolor-wash-shader','irregular-ink-shell','procedural-paper','soft-wash-shadow','coherent-brush-smoke','artistic-lod','golden-quality-hook'],show,stats:()=>({runtime:watercolor.diagnostics(),quality:quality?.telemetry?.()||null,objects:4,active:names[active],smoke:[smokeVol.particles.length,smokePlant.particles.length]})};
