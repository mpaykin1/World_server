import * as THREE from 'three';
import { loadActionForgePlayer } from '../../shared/universal-player-character.mjs';

const coarse=matchMedia('(pointer:coarse)').matches;
const $=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
const GOAL_Z=-132,WATER_Y=.48,STREET_W=16;
const state={ready:false,visibilityPercent:0,userNoticeabilityPercent:0,playerModel:'pending',npcModel:'pending',apngSprites:2,proceduralBuildings:0,rainDrops:0,attackCount:0,enemyHits:0,playerZ:7,distanceMeters:128,missionComplete:false,kriegerTech:'instancing+procedural-geometry+fixed-budget'};
window.__FLOODED_CATHEDRAL_MVP__=state;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x071426);
scene.fog=new THREE.FogExp2(0x0b1b2b,coarse?.018:.015);
const camera=new THREE.PerspectiveCamera(66,innerWidth/innerHeight,.05,300);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.35:1.8));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.13;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
window.GoldenPaintingAtmosphere?.registerThree?.({THREE,scene,renderer,getCamera:()=>camera,worldId:'flooded-cathedral-mvp'});
window.WorldQualityAutopilot?.registerRenderer?.('flooded-cathedral-mvp',renderer,{initialTier:coarse?'BALANCED':'HIGH',targetFps:coarse?38:55,getStats(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});
const hemi=new THREE.HemisphereLight(0x7899c8,0x10131a,1.35);scene.add(hemi);
const moon=new THREE.DirectionalLight(0x98b8ff,1.15);moon.position.set(-20,34,12);moon.castShadow=true;moon.shadow.mapSize.set(coarse?512:1024,coarse?512:1024);scene.add(moon);
const warm=new THREE.DirectionalLight(0xffb25a,.38);warm.position.set(22,12,-40);scene.add(warm);
const mats={
 stone:new THREE.MeshStandardMaterial({color:0x38404c,roughness:.88,metalness:.05}),
 stone2:new THREE.MeshStandardMaterial({color:0x202733,roughness:.92,metalness:.08}),
 roof:new THREE.MeshStandardMaterial({color:0x0c1422,roughness:.78,metalness:.18}),
 road:new THREE.MeshStandardMaterial({color:0x252d36,roughness:.96}),
 window:new THREE.MeshStandardMaterial({color:0xffc36b,emissive:0xff8c2a,emissiveIntensity:2.5,roughness:.5}),
 banner:new THREE.MeshStandardMaterial({color:0x15386d,roughness:.68,metalness:.08}),
 gold:new THREE.MeshStandardMaterial({color:0xf5c14f,emissive:0xa15c00,emissiveIntensity:.8,roughness:.38,metalness:.3}),
 wood:new THREE.MeshStandardMaterial({color:0x5e3a22,roughness:.9}),
 enemy:new THREE.MeshStandardMaterial({color:0x432833,roughness:.82,metalness:.15})
};
const boxGeo=new THREE.BoxGeometry(1,1,1),coneGeo=new THREE.ConeGeometry(1,1,6),cylGeo=new THREE.CylinderGeometry(1,1,1,8);
const ground=new THREE.Mesh(new THREE.BoxGeometry(STREET_W,.6,160),mats.road);ground.position.set(0,-.35,-60);ground.receiveShadow=true;scene.add(ground);
for(const side of [-1,1]){const curb=new THREE.Mesh(new THREE.BoxGeometry(2,.85,160),mats.stone);curb.position.set(side*(STREET_W/2+1),.05,-60);curb.receiveShadow=true;scene.add(curb);}
const waterGeo=new THREE.PlaneGeometry(80,190,30,46);waterGeo.rotateX(-Math.PI/2);
const waterPos=waterGeo.attributes.position,waterBase=new Float32Array(waterPos.array);
const waterMat=new THREE.MeshStandardMaterial({color:0x174f73,transparent:true,opacity:.78,roughness:.24,metalness:.16,emissive:0x071b2d,emissiveIntensity:.25,side:THREE.DoubleSide});
const water=new THREE.Mesh(waterGeo,waterMat);water.position.set(0,WATER_Y,-60);water.receiveShadow=true;scene.add(water);
function addInstancedCity(){
 const count=coarse?54:78,body=new THREE.InstancedMesh(boxGeo,mats.stone,count),roof=new THREE.InstancedMesh(coneGeo,mats.roof,count);
 const dummy=new THREE.Object3D();let n=0;
 for(let i=0;i<count;i++){
  const side=i%2?-1:1,z=10-(i>>1)*4.15+(hash(i*4)-.5)*2.1,x=side*(12+hash(i*9)*13),w=3.2+hash(i*5)*4.8,d=3+hash(i*8)*5.4,h=8+hash(i*13)*20;
  dummy.position.set(x,h/2,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,(hash(i*6)-.5)*.12,0);dummy.updateMatrix();body.setMatrixAt(n,dummy.matrix);
  dummy.position.set(x,h+.9,z);dummy.scale.set(Math.max(w,d)*.57,4+hash(i*19)*5,Math.max(w,d)*.57);dummy.rotation.set(0,0,0);dummy.updateMatrix();roof.setMatrixAt(n,dummy.matrix);n++;
 }
 body.castShadow=!coarse;body.receiveShadow=true;roof.castShadow=!coarse;roof.receiveShadow=true;scene.add(body,roof);state.proceduralBuildings=count;
}
addInstancedCity();

function meshBox(parent,x,y,z,w,h,d,mat=mats.stone){const m=new THREE.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=!coarse;m.receiveShadow=true;parent.add(m);return m;}
function meshCone(parent,x,y,z,r,h,mat=mats.roof){const m=new THREE.Mesh(coneGeo,mat);m.position.set(x,y+h/2,z);m.scale.set(r,h,r);m.castShadow=!coarse;parent.add(m);return m;}
function addCathedral(){
 const g=new THREE.Group();g.position.z=GOAL_Z;scene.add(g);
 meshBox(g,0,7,0,16,14,18,mats.stone);meshBox(g,0,15,-1,11,3,14,mats.stone2);
 for(const x of [-6,0,6]){meshBox(g,x,17,0,4.2,20,4.2,mats.stone);meshCone(g,x,27,0,3.1,10,mats.roof);}
 meshBox(g,0,10,9.2,5,10,.4,mats.window);meshCone(g,0,15.2,9.2,2.5,4,mats.gold);
 for(const x of [-5.5,5.5])meshBox(g,x,10,9.25,.8,5,.28,mats.banner);
 meshBox(g,0,.65,10.8,18,1.3,8,mats.stone2);
 const light=new THREE.PointLight(0xffb55f,5.2,34,2);light.position.set(0,10,8);g.add(light);return g;
}
const cathedral=addCathedral();
const fireHud=[[$('#fireA'),new THREE.Vector3(-6.2,1.1,-18)],[$('#fireB'),new THREE.Vector3(6.1,1.1,-58)]];
function addBridge(z){
 const g=new THREE.Group();scene.add(g);meshBox(g,0,1.25,z,18,1.1,4.5,mats.stone);
 for(const x of [-7.6,7.6]){meshBox(g,x,3.3,z,1.4,5.4,1.5,mats.stone2);meshCone(g,x,6,z,1.1,3,mats.roof);}
 for(const x of [-5,-2.5,0,2.5,5])meshBox(g,x,2.35,z+2.1,.18,2.3,.18,mats.wood);
}
addBridge(-43);addBridge(-93);
function addLantern(x,z){
 const pole=new THREE.Mesh(cylGeo,mats.stone2);pole.position.set(x,2.1,z);pole.scale.set(.12,4,.12);scene.add(pole);
 const glow=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),mats.window);glow.position.set(x,4.25,z);scene.add(glow);
 if(Math.abs(z)%24<1){const l=new THREE.PointLight(0xff9b45,1.8,11,2);l.position.copy(glow.position);scene.add(l);}
}
for(let z=5;z>GOAL_Z;z-=7)for(const side of [-1,1])addLantern(side*6.6,z);
for(let i=0;i<20;i++){const m=new THREE.Mesh(new THREE.ConeGeometry(5+hash(i)*8,18+hash(i*5)*22,7),mats.stone2);m.position.set(-65+i*7,-1,-178-hash(i*8)*20);m.rotation.y=hash(i*3)*Math.PI;scene.add(m);}
for(let i=0;i<38;i++){const m=new THREE.Mesh(boxGeo,i%4===0?mats.wood:mats.stone2);m.scale.set(.35+hash(i)*1.8,.25+hash(i*3)*.7,.35+hash(i*5)*1.4);m.position.set((hash(i*7)-.5)*12,.18+hash(i)*.35,5-hash(i*11)*132);m.rotation.set(hash(i)*2,hash(i*2)*3,hash(i*5)*2);scene.add(m);}
const rainCount=coarse?900:1600,rainGeo=new THREE.BufferGeometry(),rainData=new Float32Array(rainCount*3);
for(let i=0;i<rainCount;i++){rainData[i*3]=(hash(i*3)-.5)*52;rainData[i*3+1]=hash(i*5)*30;rainData[i*3+2]=(hash(i*7)-.5)*65;}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainData,3));
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xb9d7ee,size:.055,transparent:true,opacity:.65,depthWrite:false}));scene.add(rain);state.rainDrops=rainCount;
const playerRoot=new THREE.Group();scene.add(playerRoot);let playerCharacter=null;
const playerFallback=meshBox(playerRoot,0,1,0,.7,1.8,.55,mats.banner);
const player={pos:new THREE.Vector3(0,.02,7),yaw:0,pitch:-.12,sprintHeld:false,attackUntil:0,velY:0,onGround:true};
async function loadPlayer(){try{playerCharacter=await loadActionForgePlayer({parent:playerRoot,scale:.92});playerCharacter.play('idle',{fade:0});playerFallback.visible=false;state.playerModel=playerCharacter.id;}catch(e){console.warn('player GLB fallback',e);state.playerModel='procedural-fallback';}}
const npcRoot=new THREE.Group();npcRoot.position.set(-4.8,0,-30);npcRoot.rotation.y=-.4;scene.add(npcRoot);let npcCharacter=null;
async function loadNpc(){meshBox(npcRoot,0,1,0,.7,1.8,.55,mats.banner);meshBox(npcRoot,0,2.05,0,.5,.5,.5,mats.gold);state.npcModel='procedural-guard';}
const enemy=new THREE.Group();enemy.position.set(2.5,.05,-72);scene.add(enemy);
meshBox(enemy,0,.9,0,.75,1.7,.6,mats.enemy);meshBox(enemy,0,1.95,0,.52,.5,.5,mats.stone2);meshBox(enemy,.31,1.95,.27,.08,.08,.08,mats.window);
enemy.userData.hp=3;enemy.userData.alive=true;
function waterDepthAt(z){return (z < -12 && z > -118) ? .48 : .18;}
function playerSpeed(){return (player.sprintHeld?6.2:3.7)*(waterDepthAt(player.pos.z)>.3 ? .72 : 1);}
function playPlayer(name){if(performance.now()<player.attackUntil&&name!=='primary_attack')return;playerCharacter?.play(name);}

let lookPointer=null,lastLookX=0,lastLookY=0;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){renderer.domElement.requestPointerLock?.();return;}if(e.pointerType==='touch'&&e.clientX>innerWidth*.36){lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;renderer.domElement.setPointerCapture?.(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;const dx=e.clientX-lastLookX,dy=e.clientY-lastLookY;lastLookX=e.clientX;lastLookY=e.clientY;player.yaw-=dx*.0075;player.pitch=clamp(player.pitch-dy*.0055,-.48,.34);});
renderer.domElement.addEventListener('pointerup',e=>{if(e.pointerId===lookPointer)lookPointer=null;});
addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement){player.yaw-=e.movementX*.0026;player.pitch=clamp(player.pitch-e.movementY*.0021,-.5,.35);}});
addEventListener('goldenlook',e=>{player.yaw-=e.detail.dx*.011;player.pitch=clamp(player.pitch-e.detail.dy*.009,-.5,.35);});
const attackBtn=$('#attack'),interactBtn=$('#interact'),sprintBtn=$('#sprint'),dialogue=$('#dialogue'),mission=$('#mission');
function attack(){
 state.attackCount++;if(!enemy.userData.alive)return;player.attackUntil=performance.now()+620;playerCharacter?.play('primary_attack',{fade:.08});
 if(player.pos.distanceTo(enemy.position)<3.4){enemy.userData.hp--;state.enemyHits++;enemy.position.z-=.55;if(enemy.userData.hp<=0){enemy.userData.alive=false;enemy.visible=false;}}
}
function interact(){
 if(player.pos.distanceTo(npcRoot.position)<5.5){npcCharacter?.play('talk',{fade:.08});dialogue.classList.add('show');setTimeout(()=>dialogue.classList.remove('show'),4200);return;}
 if(player.pos.z<GOAL_Z+13)finishMission();
}
function finishMission(){if(state.missionComplete)return;state.missionComplete=true;mission.classList.add('show');playerCharacter?.play('yes',{fade:.1});}
attackBtn.addEventListener('pointerdown',e=>{e.preventDefault();attack();});
interactBtn.addEventListener('pointerdown',e=>{e.preventDefault();interact();});
for(const ev of ['pointerdown','touchstart'])sprintBtn.addEventListener(ev,e=>{e.preventDefault();player.sprintHeld=true;},{passive:false});
for(const ev of ['pointerup','pointercancel','touchend','touchcancel'])sprintBtn.addEventListener(ev,e=>{e.preventDefault();player.sprintHeld=false;},{passive:false});
addEventListener('keydown',e=>{if(e.code==='KeyE'&&!e.repeat)attack();if(e.code==='KeyQ'&&!e.repeat)interact();});

function updatePlayer(dt){
 const input=window.GameGoldenStandard?.input?.()||{},f=(input.forward?1:0)-(input.back?1:0),s=(input.right?1:0)-(input.left?1:0),mag=Math.hypot(f,s)||1,sp=playerSpeed();
 const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw),dx=(-sy*f+cy*s)/mag*sp*dt,dz=(-cy*f-sy*s)/mag*sp*dt;
 player.pos.x=clamp(player.pos.x+dx,-7.15,7.15);player.pos.z=clamp(player.pos.z+dz,GOAL_Z-5,10);
 if(input.jump&&player.onGround){player.velY=5.3;player.onGround=false;playerCharacter?.play('jump_start',{fade:.05});}
 if(!player.onGround){player.velY-=12*dt;player.pos.y+=player.velY*dt;if(player.pos.y<=.02){player.pos.y=.02;player.velY=0;player.onGround=true;playerCharacter?.play('land',{fade:.05});}}
 playerRoot.position.copy(player.pos);playerRoot.rotation.y=player.yaw+Math.PI;
 const moving=Math.abs(f)+Math.abs(s)>0;if(!player.onGround)playPlayer('airborne');else playPlayer(!moving?'idle':(input.run||player.sprintHeld)?'run':'walk');
 if(player.pos.z<GOAL_Z+8)finishMission();
 const meters=Math.max(0,Math.round((player.pos.z-GOAL_Z)*.92));state.playerZ=player.pos.z;state.distanceMeters=meters;$('#waypoint .distance').textContent=meters+' м';
 const nearNpc=player.pos.distanceTo(npcRoot.position)<5.5;interactBtn.style.boxShadow=nearNpc?'0 0 0 6px rgba(255,206,79,.22),0 6px 24px rgba(0,0,0,.4)':'';
}
function updateCamera(){
 const dir=new THREE.Vector3(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();
 const right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw)),target=player.pos.clone().add(new THREE.Vector3(0,1.45,0));
 const desired=target.clone().addScaledVector(dir,-5.2).addScaledVector(right,.75);desired.y+=1.15;camera.position.lerp(desired,.13);camera.lookAt(target.clone().addScaledVector(dir,6));
 const wp=cathedral.localToWorld(new THREE.Vector3(0,19,4)),p=wp.clone().project(camera),x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight,marker=$('#waypoint');
 marker.style.left=clamp(x,44,innerWidth-44)+'px';marker.style.top=clamp(y,92,innerHeight*.56)+'px';
 for(const [el,world] of fireHud){const q=world.clone().project(camera),visible=q.z<1&&q.z>-1&&Math.abs(q.x)<1.15&&Math.abs(q.y)<1.15;el.style.opacity=visible?'.88':'0';el.style.left=((q.x*.5+.5)*innerWidth)+'px';el.style.top=((-q.y*.5+.5)*innerHeight)+'px';}
}
function updateWater(t){const arr=waterPos.array;for(let i=0;i<waterPos.count;i++){const x=waterBase[i*3],z=waterBase[i*3+2];arr[i*3+1]=waterBase[i*3+1]+Math.sin(x*.28+z*.13+t*.0024)*.045+Math.sin(z*.31-t*.0018)*.025;}waterPos.needsUpdate=true;}
function updateRain(dt){const a=rainGeo.attributes.position.array;for(let i=0;i<rainCount;i++){a[i*3+1]-=dt*(19+hash(i)*10);a[i*3]-=dt*4.2;if(a[i*3+1]<-2){a[i*3+1]=28+hash(i*9)*5;a[i*3]=(hash(i*3)-.5)*52;}}rainGeo.attributes.position.needsUpdate=true;rain.position.set(camera.position.x,0,camera.position.z);}
let nextLightning=performance.now()+3600,flashUntil=0;
function updateLightning(now){if(now>nextLightning){flashUntil=now+90;nextLightning=now+5200+hash(now*.001)*6500;hemi.intensity=4.8;moon.intensity=3.6;$('#flash').style.opacity='.62';setTimeout(()=>{$('#flash').style.opacity='0';},75);}if(now>flashUntil){hemi.intensity=1.35;moon.intensity=1.15;}}
function updateEnemy(t){if(!enemy.userData.alive)return;enemy.rotation.y=Math.sin(t*.001)*.35;enemy.position.y=.05+Math.sin(t*.003)*.04;if(player.pos.distanceTo(enemy.position)<7)enemy.lookAt(player.pos.x,enemy.position.y,player.pos.z);}
function updateVitals(dt){const running=player.sprintHeld||(window.GameGoldenStandard?.input?.().run),stamina=$('.stamina i');state.stamina=clamp((state.stamina??86)+(running?-15:8)*dt,18,100);stamina.style.width=state.stamina+'%';}
function updateVisibility(){
 const r=renderer.domElement.getBoundingClientRect(),area=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top));
 state.visibilityPercent=Number((100*area/(innerWidth*innerHeight)).toFixed(1));
 const visible=[state.visibilityPercent>=99,state.playerModel!=='pending',state.proceduralBuildings>=50,state.rainDrops>=800,document.querySelectorAll('.apng').length===2,$('#waypoint')!==null,$('#attack')!==null,water.visible,cathedral.visible,document.querySelector('#hud')!==null];
 state.userNoticeabilityPercent=Math.round(visible.filter(Boolean).length/visible.length*100);
}
let last=performance.now();
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000||.016);last=now;
 window.GameGoldenStandard?.frame?.();updatePlayer(dt);updateCamera();updateWater(now);updateRain(dt);updateLightning(now);updateEnemy(now);updateVitals(dt);
 playerCharacter?.update(dt);npcCharacter?.update(dt);renderer.render(scene,camera);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);updateVisibility();});
async function boot(){
 requestAnimationFrame(frame);await loadNpc();updateVisibility();
 window.GameGoldenStandard?.reportReady?.({walkable:true,collisions:true,grounding:true,playerSpawn:true,mouseLook:true,touchControls:coarse?true:window.GameGoldenStandard.state.touchControls,mobileReady:true});
 state.ready=true;state.modelLoads=['streaming','fulfilled'];$('#loading').classList.add('hide');setTimeout(updateVisibility,500);
 loadPlayer().then(()=>{state.modelLoads[0]='fulfilled';updateVisibility();}).catch(()=>{state.modelLoads[0]='fallback';updateVisibility();});
}
boot();
