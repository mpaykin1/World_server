import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const mobile = matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) < 720;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const flashOverlay = document.getElementById('flash');
const replayButton = document.getElementById('replay');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x191713);
scene.fog = new THREE.FogExp2(0xb28f66, mobile ? 0.029 : 0.023);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 180);
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
let dpr = Math.min(devicePixelRatio || 1, mobile ? 1.15 : 1.55);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = !mobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), mobile ? 0.58 : 0.82, 0.52, 0.72);
composer.addPass(bloom);

scene.add(new THREE.HemisphereLight(0xd7b889, 0x171713, 0.62));
const key = new THREE.DirectionalLight(0xffd59c, 1.35);
key.position.set(-8, 12, 7);
key.castShadow = !mobile;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -20; key.shadow.camera.right = 20;
key.shadow.camera.top = 18; key.shadow.camera.bottom = -18;
scene.add(key);
const rim = new THREE.DirectionalLight(0x91a8aa, 0.75); rim.position.set(9, 5, -10); scene.add(rim);
window.GoldenPaintingAtmosphere?.registerThree({THREE,scene,renderer,camera,worldId:'cinematic-encounter'});

function mat(color, roughness=.72, metalness=.08, emissive=0x000000, emissiveIntensity=0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
}
function mesh(geometry, material, parent=scene, cast=true, receive=true) {
  const m = new THREE.Mesh(geometry, material); m.castShadow = cast && !mobile; m.receiveShadow = receive; parent.add(m); return m;
}
const ground = mesh(new THREE.PlaneGeometry(160, 160), mat(0x40382e,1,0)); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true;
const steel=mat(0x4a4d49,.58,.52), darkSteel=mat(0x202321,.48,.68), trim=mat(0x77766c,.44,.63);
const glass=new THREE.MeshPhysicalMaterial({color:0x202b2b,roughness:.17,metalness:.12,transmission:.12,transparent:true,opacity:.74,side:THREE.DoubleSide});

const vehicle=new THREE.Group(); vehicle.position.set(-3,0,0); vehicle.rotation.y=-.07; scene.add(vehicle);
const body=mesh(new THREE.BoxGeometry(7.6,3,3.2),steel,vehicle); body.position.y=2.05;
const roof=mesh(new THREE.BoxGeometry(8.05,.22,3.55),trim,vehicle); roof.position.y=3.68;
const nose=mesh(new THREE.BoxGeometry(1.35,2.3,3),darkSteel,vehicle); nose.position.set(4.22,1.72,0);
for(const z of [-1.07,1.07]) for(const x of [-2.45,.05,2.55]) {
  const w=mesh(new THREE.CylinderGeometry(.58,.58,.34,18),darkSteel,vehicle); w.rotation.x=Math.PI/2; w.position.set(x,.63,z);
  const hub=mesh(new THREE.CylinderGeometry(.24,.24,.37,16),trim,vehicle); hub.rotation.x=Math.PI/2; hub.position.copy(w.position);
}
for(const x of [-2.2,-.45,1.3]) {
  const win=mesh(new THREE.PlaneGeometry(1.35,1.28),glass,vehicle,false,false); win.position.set(x,2.65,1.611);
  const win2=win.clone(); win2.position.z=-1.611; win2.rotation.y=Math.PI; vehicle.add(win2);
}
for(const x of [-2.8,-1.3,.2,1.7,3.1]) { const rib=mesh(new THREE.BoxGeometry(.08,2.45,3.3),darkSteel,vehicle); rib.position.set(x,2,0); }
const rail=mesh(new THREE.TorusGeometry(1.05,.055,8,28,Math.PI),trim,vehicle); rail.rotation.set(Math.PI/2,0,Math.PI/2); rail.position.set(4.65,1,0);

const gunMount=new THREE.Group(); gunMount.position.set(.95,2.92,1.66); vehicle.add(gunMount);
const stock=mesh(new THREE.BoxGeometry(1.25,.27,.28),darkSteel,gunMount); stock.position.x=.48;
const barrel=mesh(new THREE.CylinderGeometry(.07,.09,2.05,10),darkSteel,gunMount); barrel.rotation.z=-Math.PI/2; barrel.position.x=1.78;
const grip=mesh(new THREE.BoxGeometry(.18,.7,.2),darkSteel,gunMount); grip.position.set(.72,-.37,0); grip.rotation.z=-.18;
const muzzle=new THREE.Object3D(); muzzle.position.set(2.85,0,0); gunMount.add(muzzle);

for(let i=0;i<8;i++) {
  const h=3.3+(i%3)*.65; const b=mesh(new THREE.BoxGeometry(5+((i*7)%4),h,4),mat(0x32322d,.92,.12));
  const row=i<4?-1:1; b.position.set(-18+(i%4)*12,h/2,row*15);
}
for(const z of [-7.5,7.5]) for(let x=-26;x<=28;x+=8) {
  const pole=mesh(new THREE.CylinderGeometry(.055,.075,6.2,8),darkSteel); pole.position.set(x,3.1,z);
  const lamp=mesh(new THREE.SphereGeometry(.1,8,6),mat(0xffb966,.4,0,0xffa238,3)); lamp.position.set(x,5.75,z);
}
for(const z of [-2.3,2.3]) { const r=mesh(new THREE.BoxGeometry(100,.045,.09),trim); r.position.set(0,.035,z); }

const colliders=[
  {minX:-6.9,maxX:1.45,minZ:-1.9,maxZ:1.9,h:3.7},
  {minX:5.4,maxX:7.1,minZ:-4.6,maxZ:-2.8,h:1.4},
  {minX:6.2,maxX:8.2,minZ:2.7,maxZ:4.5,h:1.4}
];
for(const c of colliders.slice(1)) { const q=mesh(new THREE.BoxGeometry(c.maxX-c.minX,c.h,c.maxZ-c.minZ),mat(0x5d4934,.88,.05)); q.position.set((c.minX+c.maxX)/2,c.h/2,(c.minZ+c.maxZ)/2); }
const stepZone={minX:2,maxX:4.1,minZ:-6.2,maxZ:-4.3,height:.42};
const step=mesh(new THREE.BoxGeometry(stepZone.maxX-stepZone.minX,stepZone.height*2,stepZone.maxZ-stepZone.minZ),mat(0x68645a,.9,.08));
step.position.set((stepZone.minX+stepZone.maxX)/2,stepZone.height,(stepZone.minZ+stepZone.maxZ)/2);

function limb(parent,radius,length,color,x,y,z) {
  const joint=new THREE.Group(); joint.position.set(x,y,z); parent.add(joint);
  const part=mesh(new THREE.CapsuleGeometry(radius,length,5,9),mat(color,.9,.03),joint); part.position.y=-length*.5; return joint;
}
const creature=new THREE.Group(); scene.add(creature);
const torso=mesh(new THREE.CapsuleGeometry(.38,.95,7,12),mat(0x151412,.96,.01),creature); torso.position.y=1.38; torso.rotation.z=.08;
const head=mesh(new THREE.SphereGeometry(.29,14,10),mat(0x12110f,.98,.01),creature); head.scale.set(.86,1.12,.82); head.position.set(.06,2.21,0);
const leftArm=limb(creature,.105,.74,0x151412,-.34,1.8,0), rightArm=limb(creature,.105,.74,0x151412,.38,1.78,0);
const leftLeg=limb(creature,.13,.9,0x11100f,-.18,1.03,0), rightLeg=limb(creature,.13,.9,0x11100f,.18,1.03,0);
creature.traverse(o=>{if(o.isMesh)o.castShadow=!mobile;});
const ghost=mesh(new THREE.CapsuleGeometry(.39,1.02,5,9),new THREE.MeshBasicMaterial({color:0x281f17,transparent:true,opacity:.12,depthWrite:false}),scene,false,false); ghost.visible=false;

const flashCore=mesh(new THREE.SphereGeometry(.15,10,8),new THREE.MeshBasicMaterial({color:0xfff0b3,transparent:true,opacity:0}),scene,false,false);
const flashLight=new THREE.PointLight(0xffbd69,0,mobile?18:27,1.75); scene.add(flashLight);
const flashCone=mesh(new THREE.ConeGeometry(.78,5.8,18,1,true),new THREE.MeshBasicMaterial({color:0xffd08a,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}),scene,false,false);

function radialTexture(){
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,225,177,.78)');g.addColorStop(.58,'rgba(194,146,94,.22)');g.addColorStop(1,'rgba(80,60,40,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);
}
const particleTex=radialTexture();
const dustCount=mobile?340:720,dustPos=new Float32Array(dustCount*3),dustSeed=new Float32Array(dustCount);
for(let i=0;i<dustCount;i++){dustPos[i*3]=(Math.random()-.5)*38;dustPos[i*3+1]=.06+Math.pow(Math.random(),2)*5.4;dustPos[i*3+2]=(Math.random()-.5)*27;dustSeed[i]=Math.random()*Math.PI*2;}
const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({map:particleTex,color:0xc6a077,size:mobile?.16:.19,transparent:true,opacity:.2,alphaTest:.015,depthWrite:false,sizeAttenuation:true}));scene.add(dust);
const sparkCount=mobile?30:62,sparkPos=new Float32Array(sparkCount*3),sparkVel=Array.from({length:sparkCount},()=>new THREE.Vector3()),sparkLife=new Float32Array(sparkCount);
const sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPos,3));
const sparks=new THREE.Points(sparkGeo,new THREE.PointsMaterial({color:0xffc56d,size:mobile?.07:.09,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(sparks);

let audioCtx=null;
function playShot(){try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();const ctx=audioCtx,now=ctx.currentTime,len=Math.floor(ctx.sampleRate*.34),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++){const t=i/ctx.sampleRate;data[i]=(Math.random()*2-1)*Math.exp(-t*16)+Math.sin(t*2*Math.PI*76)*.34*Math.exp(-t*9);}const src=ctx.createBufferSource(),lp=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=buf;lp.type='lowpass';lp.frequency.value=980;gain.gain.value=.24;src.connect(lp);lp.connect(gain);gain.connect(ctx.destination);src.start(now);}catch{}}
const eventState={started:performance.now(),duration:6800,shotAt:2400,flashEnd:2670,shotPlayed:false};
function replay(){eventState.started=performance.now();eventState.shotPlayed=false;flashOverlay.style.opacity='0';flashLight.intensity=0;flashCore.material.opacity=0;flashCone.material.opacity=0;}
replayButton.addEventListener('click',()=>{replay();});
function fireSparks(origin){for(let i=0;i<sparkCount;i++){sparkPos[i*3]=origin.x;sparkPos[i*3+1]=origin.y;sparkPos[i*3+2]=origin.z;const a=(Math.random()-.5)*.58;sparkVel[i].set(5.2+Math.random()*7,(Math.random()-.2)*3.7,Math.sin(a)*(2+Math.random()*3));sparkLife[i]=.22+Math.random()*.48;}sparkGeo.attributes.position.needsUpdate=true;sparks.material.opacity=1;}
function updateSparks(dt){let alive=false;for(let i=0;i<sparkCount;i++){if(sparkLife[i]<=0)continue;alive=true;sparkLife[i]-=dt;const v=sparkVel[i];v.y-=7.5*dt;sparkPos[i*3]+=v.x*dt;sparkPos[i*3+1]+=v.y*dt;sparkPos[i*3+2]+=v.z*dt;}sparkGeo.attributes.position.needsUpdate=true;sparks.material.opacity=alive?.88:0;}
function updateDust(t,dt,blast){const a=dustGeo.attributes.position.array;for(let i=0;i<dustCount;i++){const k=i*3,phase=dustSeed[i];a[k]+=Math.sin(t*.00035+phase)*dt*.10+(blast?dt*(1.1+Math.sin(phase)*.45):0);a[k+1]+=Math.sin(t*.00022+phase*1.7)*dt*.027;a[k+2]+=Math.cos(t*.00028+phase)*dt*.055;if(a[k]>20)a[k]=-20;if(a[k]<-20)a[k]=20;if(a[k+1]>5.7)a[k+1]=.08;if(a[k+1]<.02)a[k+1]=5.5;}dustGeo.attributes.position.needsUpdate=true;dust.material.opacity=blast?.34:.20;}

const player={x:9.3,z:9.2,y:0,velY:0,grounded:true,yaw:-2.38,pitch:-.08,height:1.64,radius:.34};
const keys=new Set();
function jump(){if(player.grounded){player.velY=7.2;player.grounded=false;}}
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Space'){e.preventDefault();jump();}if(e.code==='KeyR')replay();});addEventListener('keyup',e=>keys.delete(e.code));renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement){player.yaw-=e.movementX*.0026;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*.0022,-.72,.65);}});
addEventListener('goldenlook',e=>{const d=e.detail||{};player.yaw-=(Number(d.dx)||0)*.0048;player.pitch=THREE.MathUtils.clamp(player.pitch-(Number(d.dy)||0)*.003,-.72,.65);});
const touchMove={x:0,y:0},touchLook={x:0,y:0};
function wirePad(id,knob,state){const el=document.getElementById(id),k=document.getElementById(knob);let active=null;const update=e=>{if(active!==e.pointerId)return;const r=el.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=r.width*.31,len=Math.hypot(dx,dy)||1,scale=Math.min(1,max/len),px=dx*scale,py=dy*scale;state.x=px/max;state.y=py/max;k.style.transform=`translate(${px}px,${py}px)`;};el.addEventListener('pointerdown',e=>{active=e.pointerId;el.setPointerCapture?.(e.pointerId);update(e);});el.addEventListener('pointermove',update);const end=e=>{if(active!==e.pointerId)return;active=null;state.x=state.y=0;k.style.transform='';};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);}
wirePad('movePad','moveKnob',touchMove);wirePad('lookPad','lookKnob',touchLook);document.getElementById('jumpBtn')?.addEventListener('pointerdown',e=>{e.preventDefault();jump();});addEventListener('goldendrawerchange',e=>{if(e.detail?.open){touchMove.x=touchMove.y=touchLook.x=touchLook.y=0;}});
function insideExpanded(c,x,z,r){return x>c.minX-r&&x<c.maxX+r&&z>c.minZ-r&&z<c.maxZ+r;}
function groundHeightAt(x,z){return x>stepZone.minX&&x<stepZone.maxX&&z>stepZone.minZ&&z<stepZone.maxZ?stepZone.height*2:0;}
function tryMove(dx,dz){const nx=THREE.MathUtils.clamp(player.x+dx,-28,31),nz=THREE.MathUtils.clamp(player.z+dz,-22,22);let tx=nx,tz=player.z;if(colliders.some(c=>insideExpanded(c,tx,tz,player.radius)))tx=player.x;tz=nz;if(colliders.some(c=>insideExpanded(c,tx,tz,player.radius)))tz=player.z;player.x=tx;player.z=tz;}
function updatePlayer(dt){let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touchMove.y,s=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touchMove.x;const len=Math.hypot(f,s);if(len>1){f/=len;s/=len;}const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw),speed=(keys.has('ShiftLeft')?5:3.1)*dt;tryMove((-sy*f+cy*s)*speed,(-cy*f-sy*s)*speed);player.yaw-=touchLook.x*dt*2.1;player.pitch=THREE.MathUtils.clamp(player.pitch-touchLook.y*dt*1.45,-.72,.65);const gy=groundHeightAt(player.x,player.z);if(player.grounded&&player.y<gy)player.y=gy;player.velY-=21*dt;player.y+=player.velY*dt;if(player.y<=gy){player.y=gy;player.velY=0;player.grounded=true;}else player.grounded=false;camera.position.set(player.x,player.y+player.height,player.z);}

const forward=new THREE.Vector3(),tempQ=new THREE.Quaternion(),muzzleWorld=new THREE.Vector3(),coneOffset=new THREE.Vector3();let shake=0,prevCreature=new THREE.Vector3();
function updateEvent(now){const ms=(now-eventState.started)%eventState.duration,before=ms<eventState.shotAt,flash=ms>=eventState.shotAt&&ms<eventState.flashEnd,approach=THREE.MathUtils.clamp(ms/eventState.shotAt,0,1),after=THREE.MathUtils.clamp((ms-eventState.shotAt)/(eventState.duration-eventState.shotAt),0,1),stride=ms*.012;prevCreature.copy(creature.position);if(before){creature.position.set(7.2-5.3*approach,0,.15+Math.sin(approach*Math.PI)*.22);creature.rotation.z=-.08+Math.sin(stride)*.05;creature.rotation.y=-Math.PI/2+.08*Math.sin(stride*.55);torso.rotation.z=.06+Math.sin(stride)*.045;leftLeg.rotation.z=Math.sin(stride)*.66;rightLeg.rotation.z=-Math.sin(stride)*.66;leftArm.rotation.z=-Math.sin(stride)*.54;rightArm.rotation.z=Math.sin(stride)*.54;}else{const dodge=Math.sin(Math.min(1,after*2.1)*Math.PI*.76);creature.position.set(1.9+after*1.25,0,.15+dodge*1.45);creature.rotation.z=-dodge*.43+after*.12;creature.rotation.y=-Math.PI/2+.35*dodge;torso.rotation.z=-.12-dodge*.22;leftLeg.rotation.z=.28*Math.sin(stride)*(1-after);rightLeg.rotation.z=-.28*Math.sin(stride)*(1-after);leftArm.rotation.z=-.9*dodge;rightArm.rotation.z=.42*dodge;}head.rotation.z=Math.sin(stride*.31)*.07;ghost.visible=!reducedMotion&&(before||after<.36);ghost.position.lerpVectors(prevCreature,creature.position,.35);ghost.position.y=1.34;ghost.rotation.copy(creature.rotation);ghost.material.opacity=before?.075:.04;
  muzzle.getWorldPosition(muzzleWorld);gunMount.getWorldQuaternion(tempQ);flashCore.position.copy(muzzleWorld);flashLight.position.copy(muzzleWorld);coneOffset.set(2.6,0,0).applyQuaternion(tempQ);flashCone.position.copy(muzzleWorld).add(coneOffset);flashCone.quaternion.copy(tempQ);flashCone.rotateZ(-Math.PI/2);
  if(flash){const p=(ms-eventState.shotAt)/(eventState.flashEnd-eventState.shotAt),envelope=Math.sin(Math.min(1,p*1.8)*Math.PI*.5)*Math.max(0,1-p);flashLight.intensity=(mobile?16:27)*(.35+envelope);flashCore.material.opacity=.98*Math.max(.2,1-p);flashCore.scale.setScalar(1.3+5.8*(1-p));flashCone.material.opacity=.18*(1-p);flashOverlay.style.opacity=String(.58*(1-p));renderer.toneMappingExposure=1.08+.5*(1-p);shake=Math.max(shake,.085*(1-p));if(!eventState.shotPlayed){eventState.shotPlayed=true;fireSparks(muzzleWorld);playShot();}}else{flashLight.intensity=0;flashCore.material.opacity=0;flashCone.material.opacity=0;flashOverlay.style.opacity='0';renderer.toneMappingExposure=1.08;}return flash||(ms>eventState.shotAt&&ms<eventState.shotAt+1050);}

let last=performance.now(),frames=0,perfStart=last;
function animate(now){const dt=Math.min(.045,(now-last)/1000||.016);last=now;updatePlayer(dt);const blast=updateEvent(now);updateSparks(dt);updateDust(now,dt,blast);forward.set(-Math.sin(player.yaw),Math.sin(player.pitch),-Math.cos(player.yaw)).normalize();const basePos=camera.position.clone();if(shake>.001&&!reducedMotion){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake*.6;camera.position.z+=(Math.random()-.5)*shake;shake*=Math.pow(.018,dt);}camera.lookAt(camera.position.clone().add(forward));composer.render();camera.position.copy(basePos);frames++;if(now-perfStart>2200){const fps=frames*1000/(now-perfStart),cap=mobile?1.15:1.55;if(fps<32&&dpr>.72)dpr=Math.max(.72,dpr-.12);else if(fps>53&&dpr<cap)dpr=Math.min(cap,dpr+.04);renderer.setPixelRatio(dpr);composer.setPixelRatio(dpr);frames=0;perfStart=now;}}
renderer.setAnimationLoop(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});

window.__CINEMATIC_ENCOUNTER_READY__={ready:true,version:'1.0.0',features:['procedural-silhouette','dust-fog','muzzle-flash','bloom','light-cone','sparks','camera-shake','adaptive-dpr','desktop-controls','mobile-dual-joystick','jump','collision','step-up'],snapshot:()=>({player:[player.x,player.y,player.z],yaw:player.yaw,pitch:player.pitch,calls:renderer.info.render.calls,dpr})};
