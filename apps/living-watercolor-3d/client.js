import * as THREE from 'three';
import {createLivingWatercolor3D,createWatercolorStyle} from '../../shared/graphics/living-watercolor-3d.js';

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,100);
camera.position.set(8.8,6.4,12.8);camera.lookAt(0,1.25,0);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
const quality=window.GoldenQualityDirector?.create?.({renderer,targetFps:50});
const style=createWatercolorStyle({seed:'living-watercolor-lab',edgeWidth:.028,edgeJitter:.2,granulation:.31,bleed:.2,shadowWash:.13});
const watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style});
scene.add(new THREE.HemisphereLight(0xffffff,0x8290a1,2.35));const key=new THREE.DirectionalLight(0xffffff,2.2);key.position.set(4,8,5);scene.add(key);
const stage=new THREE.Group();scene.add(stage);
const mat=(color='#8794a4')=>new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0});
const ink='#6f7d8e',pale='#c7cdd1',light='#dadcd8';
function mesh(g,m=mat()){const x=new THREE.Mesh(g,m);x.castShadow=false;x.receiveShadow=false;return x;}
function house(){const g=new THREE.Group();const body=mesh(new THREE.BoxGeometry(2.4,1.65,2),mat(light));body.position.y=.84;g.add(body);const roof=mesh(new THREE.ConeGeometry(1.85,.95,4),mat(ink));roof.position.y=2.05;roof.rotation.y=Math.PI/4;roof.scale.z=.82;g.add(roof);const chimney=mesh(new THREE.BoxGeometry(.34,.82,.34),mat(pale));chimney.position.set(.55,2.5,.18);g.add(chimney);const door=mesh(new THREE.BoxGeometry(.54,.92,.05),mat(ink));door.position.set(-.55,.52,1.02);g.add(door);return g;}
function tree(){const g=new THREE.Group();const trunk=mesh(new THREE.CylinderGeometry(.33,.48,2.5,10),mat(ink));trunk.position.y=1.25;trunk.rotation.z=-.07;g.add(trunk);const centers=[[-.65,2.7,0],[.05,3.05,0],[.78,2.78,.02],[-.1,3.5,.04],[.55,3.45,-.12]];for(const [x,y,z] of centers){const c=mesh(new THREE.SphereGeometry(.92,18,12),mat(pale));c.position.set(x,y,z);c.scale.set(1.15,.84,1);g.add(c);}return g;}
function volcano(){const g=new THREE.Group();const cone=mesh(new THREE.CylinderGeometry(.72,2.35,2.45,32,1,false),mat(pale));cone.position.y=1.22;g.add(cone);const rim=mesh(new THREE.TorusGeometry(.78,.11,8,32),mat(ink));rim.position.y=2.48;rim.rotation.x=Math.PI/2;g.add(rim);return g;}
function plant(){const g=new THREE.Group();const body=mesh(new THREE.BoxGeometry(2.25,1.25,1.7),mat(light));body.position.y=.63;g.add(body);const stack=mesh(new THREE.CylinderGeometry(.22,.3,3,18),mat(pale));stack.position.set(-.6,2.05,0);g.add(stack);const pts=[];for(let i=0;i<=18;i++){const y=i/18*2.8,r=.62+.34*Math.pow(Math.abs(y/2.8-.52)*2,1.7);pts.push(new THREE.Vector2(r,y));}const tower=mesh(new THREE.LatheGeometry(pts,24),mat(pale));tower.position.set(1.15,0,-.22);g.add(tower);return g;}
const items=[house(),tree(),volcano(),plant()],positions=[[-3.2,0,1.7],[.6,0,2.0],[-2.1,0,-2.3],[2.45,0,-1.55]];
items.forEach((o,i)=>{o.position.set(...positions[i]);o.rotation.y=[.38,-.2,.25,-.3][i];stage.add(o);watercolor.apply(o,{seed:['house','tree','volcano','plant'][i]});watercolor.addGroundWash(stage,{x:o.position.x,z:o.position.z,width:i===1?2.2:2.8,depth:i===1?1.5:1.8,seed:'shadow:'+i});});
const smokeVol=watercolor.createBrushEmitter({parent:items[2],origin:new THREE.Vector3(0,2.62,0),count:11,scale:.52,rise:.55,spread:.5,wind:.06,seed:'volcano-smoke',opacity:.18});
const smokePlant=watercolor.createBrushEmitter({parent:items[3],origin:new THREE.Vector3(-.6,3.58,0),count:8,scale:.38,rise:.46,spread:.34,wind:.1,seed:'plant-smoke',opacity:.15});
let targetX=0,targetY=0,currentX=0,currentY=0;addEventListener('pointermove',e=>{targetX=(e.clientX/innerWidth-.5)*.34;targetY=(e.clientY/innerHeight-.5)*.12;},{passive:true});
function animate(t){currentX+=(targetX-currentX)*.035;currentY+=(targetY-currentY)*.035;stage.rotation.y=currentX;stage.rotation.x=currentY;items[1].rotation.z=Math.sin(t*.00055)*.018;watercolor.tick(t);renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.__LIVING_WATERCOLOR_3D_READY__={ready:true,version:'1.0.0',features:['watercolor-wash-shader','irregular-ink-shell','procedural-paper','soft-wash-shadow','coherent-brush-smoke','artistic-lod','golden-quality-hook'],stats:()=>({runtime:watercolor.diagnostics(),quality:quality?.telemetry?.()||null,objects:4,smoke:[smokeVol.particles.length,smokePlant.particles.length]})};
