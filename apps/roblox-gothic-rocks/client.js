import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const coarse=matchMedia('(pointer:coarse)').matches;
const S=0.25, CHUNK=128*S, KEEP=coarse?0:1, BRIDGE_W=20*S, CITY_GROUND=-52*S;
const WALK=16*S, RUN=28*S, GRAVITY=30*S, JUMP=34*S;
const THROW_MIN=54*S, THROW_MAX=108*S, CHARGE_SECONDS=1.62;
const PLAYER_R=.33, PLAYER_H=1.75;
const statusEl=document.querySelector('#status'), loading=document.querySelector('#loading'), throwBtn=document.querySelector('#throw'), chargeBar=document.querySelector('#charge i');

const state={ready:false,shots:0,impacts:0,visibilityPercent:0,qualityFloor:85,source:'городкамни.rbxlx',avatar:'kaykit-knight-rig-medium',externalRobloxAssetsUsed:0};
window.__ROBLOX_PORT_MVP__=state;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hash(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
function lerp(a,b,t){return a+(b-a)*t;}
function routeZ(x){return Math.sin(x*.034)*2.8+Math.sin(x*.011)*1.4;}
function routeY(x){return Math.sin(x*.021)*.75+Math.sin(x*.007)*.45;}
function worldToStud(v){return v/S;}

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x221d22);scene.fog=new THREE.FogExp2(0x1a171c,0.014);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.05,260);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.35:1.75));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;document.body.prepend(renderer.domElement);
window.GoldenPaintingAtmosphere?.registerThree?.({THREE,scene,renderer,getCamera:()=>camera,worldId:'roblox-gothic-rocks'});
window.WorldQualityAutopilot?.registerRenderer?.('roblox-gothic-rocks',renderer,{initialTier:coarse?'BALANCED':'HIGH',targetFps:coarse?38:55,getStats(){return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}});

const hemi=new THREE.HemisphereLight(0xbab4c5,0x17140f,1.55);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffb45c,3.3);sun.position.set(-18,38,14);sun.castShadow=true;sun.shadow.mapSize.set(coarse?512:1024,coarse?512:1024);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=34;sun.shadow.camera.bottom=-34;scene.add(sun);
const moon=new THREE.DirectionalLight(0x6d86c8,.65);moon.position.set(24,26,-30);scene.add(moon);

const mats={
 stone:new THREE.MeshStandardMaterial({color:0x202124,roughness:.96,metalness:.02}),
 stone2:new THREE.MeshStandardMaterial({color:0x151619,roughness:.92,metalness:.04}),
 dark:new THREE.MeshStandardMaterial({color:0x090a0b,roughness:.86,metalness:.12}),
 road:new THREE.MeshStandardMaterial({color:0x2b2a2b,roughness:.98}),
 moss:new THREE.MeshStandardMaterial({color:0x0a421c,roughness:1}),
 window:new THREE.MeshStandardMaterial({color:0xffa03c,emissive:0xff6b18,emissiveIntensity:1.85,roughness:.45}),
 flame:new THREE.MeshStandardMaterial({color:0xff8c32,emissive:0xff4a0a,emissiveIntensity:3.2,roughness:.25}),
 metal:new THREE.MeshStandardMaterial({color:0x242327,metalness:.72,roughness:.45}),
 rock:new THREE.MeshStandardMaterial({color:0x40512d,roughness:1}),
 rockDark:new THREE.MeshStandardMaterial({color:0x20281b,roughness:1})
};
const geo={box:new THREE.BoxGeometry(1,1,1),cone:new THREE.ConeGeometry(1,1,6),cyl:new THREE.CylinderGeometry(1,1,1,8),sphere:new THREE.IcosahedronGeometry(1,2)};
const city=new THREE.Group();scene.add(city);
const chunkGroups=new Map(), colliders=[];let activeBuildChunk=null;

function meshBox(parent,pos,size,mat=mats.stone,cast=true){const m=new THREE.Mesh(geo.box,mat);m.position.copy(pos);m.scale.set(size.x,size.y,size.z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}
function meshCone(parent,pos,r,h,mat=mats.dark){const m=new THREE.Mesh(geo.cone,mat);m.position.set(pos.x,pos.y+h/2,pos.z);m.scale.set(r,h,r);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function addCollider(pos,size,kind='solid'){colliders.push({chunk:activeBuildChunk,min:new THREE.Vector3(pos.x-size.x/2,pos.y-size.y/2,pos.z-size.z/2),max:new THREE.Vector3(pos.x+size.x/2,pos.y+size.y/2,pos.z+size.z/2),kind});}
function boxAndCollider(parent,pos,size,mat,kind='solid'){const m=meshBox(parent,pos,size,mat);addCollider(pos,size,kind);return m;}

function addWindow(parent,x,y,z,front=true){const size=front?new THREE.Vector3(.62,1.5,.08):new THREE.Vector3(.08,1.5,.62);meshBox(parent,new THREE.Vector3(x,y,z),size,mats.window,false);}
function gothicBuilding(parent,x,z,w,d,h,seed){
 const baseY=CITY_GROUND, g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
 const bodyPos=new THREE.Vector3(0,baseY+h/2,0),bodySize=new THREE.Vector3(w,h,d);meshBox(g,bodyPos,bodySize,mats.stone,Math.abs(x)<CHUNK*.8);addCollider(new THREE.Vector3(x,bodyPos.y,z),bodySize,'building');
 meshBox(g,new THREE.Vector3(0,baseY+.75,0),new THREE.Vector3(w+1.05,1.5,d+1.05),mats.dark);
 const levels=clamp(Math.floor(h/4.5),3,8);
 for(let lv=0;lv<levels;lv++){const y=baseY+2.2+lv*(h-4.2)/Math.max(1,levels-1);meshBox(g,new THREE.Vector3(0,y,d/2+.05),new THREE.Vector3(w+.25,.15,.1),mats.dark,false);meshBox(g,new THREE.Vector3(0,y,-d/2-.05),new THREE.Vector3(w+.25,.15,.1),mats.dark,false);}
 for(const side of [-1,1]){for(let ix=0;ix<3;ix++){const wx=lerp(-w*.31,w*.31,ix/2);for(let lv=0;lv<Math.min(5,levels-1);lv++){const wy=baseY+3.2+lv*3.75;if(wy<baseY+h-1.8)addWindow(g,wx,wy,side*(d/2+.055),true);}}}
 for(const side of [-1,1]){for(let i=0;i<3;i++){const bx=lerp(-w*.4,w*.4,i/2);meshBox(g,new THREE.Vector3(bx,baseY+h*.38,side*(d/2+.4)),new THREE.Vector3(.55,h*.72,.65),mats.dark,false);}}
 meshBox(g,new THREE.Vector3(0,baseY+h+.3,0),new THREE.Vector3(w+1.25,.6,d+1.25),mats.dark);
 meshCone(g,new THREE.Vector3(0,baseY+h+.15,0),Math.max(w,d)*.54,5.5+hash(seed+9)*7,mats.dark);
 for(const sx of [-1,1])for(const sz of [-1,1]){const tx=sx*(w/2+.7),tz=sz*(d/2+.7),th=h*(.68+hash(seed+tx+tz)*.32);const tower=new THREE.Mesh(geo.cyl,mats.stone2);tower.position.set(tx,baseY+th/2,tz);tower.scale.set(.8,th,.8);tower.castShadow=Math.abs(x)<CHUNK*.8&&!coarse;tower.receiveShadow=true;g.add(tower);meshCone(g,new THREE.Vector3(tx,baseY+th,tz),1.1,4.2+hash(seed+tz)*4.5,mats.dark);}
 return g;
}

function buildBridge(parent,k){const cx=k*CHUNK,z=routeZ(cx),y=routeY(cx),length=CHUNK+1.2;const deck=boxAndCollider(parent,new THREE.Vector3(cx,y-.95,z),new THREE.Vector3(length,1.5,BRIDGE_W+1.5),mats.stone,'bridge');meshBox(parent,new THREE.Vector3(cx,y+.08,z),new THREE.Vector3(length,.18,BRIDGE_W+.65),mats.road,false);
 for(const side of [-1,1]){const pz=z+side*(BRIDGE_W/2+.28);boxAndCollider(parent,new THREE.Vector3(cx,y+.65,pz),new THREE.Vector3(length,1.3,.28),mats.stone2,'parapet');for(let i=0;i<16;i++){const x=cx-CHUNK/2+1+i*(CHUNK-2)/15;meshBox(parent,new THREE.Vector3(x,y+1.25,pz),new THREE.Vector3(.27,.42,.25),mats.stone,false);}}
 for(let i=0;i<4;i++){const x=cx-CHUNK*.36+i*CHUNK*.24;for(const side of [-1,1]){const zt=z+side*(BRIDGE_W/2+.48);meshBox(parent,new THREE.Vector3(x,y+1.42,zt),new THREE.Vector3(.12,.72,.12),mats.metal,false);const f=meshCone(parent,new THREE.Vector3(x,y+1.76,zt),.18,.42,mats.flame);f.castShadow=false;if(i%2===0&&Math.abs(k)<=1){const l=new THREE.PointLight(0xff6d1f,1.6,8.5,2);l.position.set(x,y+2.15,zt);parent.add(l);}}}
}

function buildChunk(k){const g=new THREE.Group();g.userData.k=k;city.add(g);activeBuildChunk=k;buildBridge(g,k);const seed=k*131+900,cx=k*CHUNK;for(const side of [-1,1]){for(let i=0;i<2;i++){const x=cx+lerp(-CHUNK*.32,CHUNK*.32,i)+(hash(seed+i+side)-.5)*3;const bz=routeZ(x);const dist=(42+hash(seed+i*6+side)*76)*S;const z=bz+side*dist;const w=(18+hash(seed+i+3)*20)*S,d=(16+hash(seed+i+9)*26)*S,h=(54+hash(seed+i+15)*100)*S;gothicBuilding(g,x,z,w,d,h,seed+i*31+side*17);}}
 for(let i=0;i<18;i++){const x=cx-CHUNK/2+hash(seed+i*21)*CHUNK,z=routeZ(x)+(hash(seed+i*31)>.5?1:-1)*(BRIDGE_W*.75+hash(seed+i*44)*7);meshBox(g,new THREE.Vector3(x,CITY_GROUND+.05,z),new THREE.Vector3(.6+hash(seed+i)*1.5,.09,.8+hash(seed+i*3)*1.8),mats.moss,false);}
 chunkGroups.set(k,g);activeBuildChunk=null;
}
function ensureChunks(x){const center=Math.floor((x+CHUNK/2)/CHUNK);for(let k=center-KEEP;k<=center+KEEP;k++)if(!chunkGroups.has(k))buildChunk(k);for(const [k,g] of [...chunkGroups])if(Math.abs(k-center)>KEEP){city.remove(g);chunkGroups.delete(k);for(let i=colliders.length-1;i>=0;i--)if(colliders[i].chunk===k)colliders.splice(i,1);}}

const avatarRoot=new THREE.Group();scene.add(avatarRoot);let avatar=null,mixer=null,activeAction=null,actions={};
function fallbackAvatar(){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.32,.36,1.15,8),new THREE.MeshStandardMaterial({color:0x6e7682,roughness:.7,metalness:.25}));body.position.y=.9;body.castShadow=true;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.25,12,10),new THREE.MeshStandardMaterial({color:0xb9a88d,roughness:.8}));head.position.y=1.75;head.castShadow=true;g.add(head);avatarRoot.add(g);avatar=g;}
function playAnim(kind){if(!mixer)return;const next=actions[kind]||actions.idle||Object.values(actions)[0];if(!next||next===activeAction)return;next.reset().fadeIn(.16).play();activeAction?.fadeOut(.16);activeAction=next;}
async function loadAvatar(){try{const loader=new GLTFLoader();const [model,anim]=await Promise.all([loader.loadAsync('/assets/characters/kaykit-knight/model/Knight.glb'),loader.loadAsync('/assets/characters/kaykit-knight/animations/Rig_Medium_MovementBasic.glb')]);avatar=model.scene;avatar.scale.setScalar(.78);avatar.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});avatarRoot.add(avatar);mixer=new THREE.AnimationMixer(avatar);for(const clip of anim.animations){const n=clip.name.toLowerCase();const a=mixer.clipAction(clip);if(/idle/.test(n)&&!actions.idle)actions.idle=a;if(/walk/.test(n)&&!actions.walk)actions.walk=a;if(/run|sprint/.test(n)&&!actions.run)actions.run=a;}playAnim('idle');}catch(e){console.warn('[ROBLOX PORT] KayKit fallback',e);fallbackAvatar();}}

const player={pos:new THREE.Vector3(0,routeY(0)+.05,0),vel:new THREE.Vector3(),yaw:Math.PI/2,pitch:-.08,onGround:true};
let lookX=0,lookY=0;
addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement){player.yaw-=e.movementX*.0027;player.pitch=clamp(player.pitch-e.movementY*.0022,-.8,.65);}});
renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0&&!document.pointerLockElement)renderer.domElement.requestPointerLock?.();});
addEventListener('goldenlook',e=>{player.yaw-=e.detail.dx*.012;player.pitch=clamp(player.pitch-e.detail.dy*.01,-.8,.65);});

function bridgeFloorAt(x,z){const rz=routeZ(x);if(Math.abs(z-rz)<=BRIDGE_W*.48)return routeY(x)+.17;return CITY_GROUND+.15;}
function canOccupy(pos){const floor=bridgeFloorAt(pos.x,pos.z);if(pos.y<floor-.05)return false;for(const c of colliders){if(c.kind==='bridge')continue;if(pos.x+PLAYER_R>c.min.x&&pos.x-PLAYER_R<c.max.x&&pos.z+PLAYER_R>c.min.z&&pos.z-PLAYER_R<c.max.z&&pos.y<c.max.y+PLAYER_H&&pos.y+PLAYER_H>c.min.y)return false;}return true;}
function updatePlayer(dt){const input=window.GameGoldenStandard?.input?.()||{};const f=(input.forward?1:0)-(input.back?1:0),s=(input.right?1:0)-(input.left?1:0);const mag=Math.hypot(f,s)||1;const speed=input.run?RUN:WALK;const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);const dx=(-sy*f+cy*s)/mag*speed*dt,dz=(-cy*f-sy*s)/mag*speed*dt;let p={x:player.pos.x,y:player.pos.y,z:player.pos.z};const move=window.GameGoldenPhysics?.moveSwept?window.GameGoldenPhysics.moveSwept(p,{x:dx,y:0,z:dz},canOccupy,{allowStep:true,maxSubstep:.18}):{position:{x:p.x+dx,y:p.y,z:p.z+dz}};player.pos.set(move.position.x,move.position.y,move.position.z);
 const floor=bridgeFloorAt(player.pos.x,player.pos.z);if(input.jump&&player.onGround){player.vel.y=JUMP;player.onGround=false;}player.vel.y-=GRAVITY*dt;player.pos.y+=player.vel.y*dt;if(player.pos.y<=floor){player.pos.y=floor;player.vel.y=0;player.onGround=true;}
 avatarRoot.position.copy(player.pos);avatarRoot.rotation.y=player.yaw+Math.PI;ensureChunks(player.pos.x);const moving=Math.abs(f)+Math.abs(s)>0;playAnim(!moving?'idle':input.run?'run':'walk');
}

const heldRock=new THREE.Mesh(geo.sphere,mats.rock);heldRock.scale.set(.34,.29,.32);heldRock.castShadow=true;scene.add(heldRock);
const projectiles=[];let charging=false,chargeStarted=0,reloadAt=0;
const trajectory=new THREE.Group();scene.add(trajectory);const dots=[];for(let i=0;i<18;i++){const d=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),new THREE.MeshBasicMaterial({color:0xb7f36d,transparent:true,opacity:.72}));d.visible=false;trajectory.add(d);dots.push(d);}
function aimDirection(){return new THREE.Vector3(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)).normalize();}
function updateHeldRock(now){const dir=aimDirection(),right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));const pos=player.pos.clone().add(new THREE.Vector3(0,1.25,0)).add(right.multiplyScalar(.42)).add(dir.clone().multiplyScalar(.25));heldRock.position.copy(pos);heldRock.visible=now>=reloadAt;heldRock.rotation.x+=.008;heldRock.rotation.y+=.012;}
function startCharge(){if(performance.now()<reloadAt)return;charging=true;chargeStarted=performance.now();throwBtn.classList.add('charging');}
function releaseCharge(force=null){if(!charging&&force===null)return;const now=performance.now(),q=force===null?clamp((now-chargeStarted)/(CHARGE_SECONDS*1000),.06,1):clamp(force,.06,1);charging=false;throwBtn.classList.remove('charging');chargeBar.style.width='0%';throwRock(q);}
function throwRock(q=1){const dir=aimDirection(),m=new THREE.Mesh(geo.sphere,mats.rock);m.scale.set(.34,.29,.32);m.castShadow=true;m.position.copy(heldRock.position);scene.add(m);const speed=lerp(THROW_MIN,THROW_MAX,q);projectiles.push({mesh:m,vel:dir.multiplyScalar(speed).add(new THREE.Vector3(0,1.4,0)),life:0,armed:.16});state.shots++;reloadAt=performance.now()+650;heldRock.visible=false;return state.shots;}
state.throwRock=throwRock;state.fireTest=()=>throwRock(1);
for(const ev of ['pointerdown','touchstart'])throwBtn.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();startCharge();},{passive:false});
for(const ev of ['pointerup','pointercancel','touchend','touchcancel'])throwBtn.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();releaseCharge();},{passive:false});
addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat)startCharge();});addEventListener('keyup',e=>{if(e.code==='KeyF')releaseCharge();});

const debris=[];
function impact(p,normal,speed){state.impacts++;const flash=new THREE.PointLight(0xc6ff7c,3.5,5.5,2);flash.position.copy(p);scene.add(flash);setTimeout(()=>scene.remove(flash),120);for(let i=0;i<8;i++){const m=new THREE.Mesh(geo.box,i%3===0?mats.moss:mats.rockDark);m.scale.setScalar(.08+hash(i+speed)*.08);m.position.copy(p);scene.add(m);debris.push({mesh:m,vel:new THREE.Vector3((hash(i*3)-.5)*4,1.5+hash(i*7)*3,(hash(i*11)-.5)*4).addScaledVector(normal,1.8),life:1.5});}}
function projectileHit(pos){for(const c of colliders){if(c.kind==='bridge'||c.kind==='parapet'||c.kind==='building'){if(pos.x>c.min.x&&pos.x<c.max.x&&pos.y>c.min.y&&pos.y<c.max.y&&pos.z>c.min.z&&pos.z<c.max.z)return c;}}return null;}
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life+=dt;p.armed-=dt;p.vel.y-=GRAVITY*dt;p.mesh.position.addScaledVector(p.vel,dt);p.mesh.rotation.x+=dt*7;p.mesh.rotation.z+=dt*5;const floor=bridgeFloorAt(p.mesh.position.x,p.mesh.position.z);const hit=p.armed<=0?projectileHit(p.mesh.position):null;if(p.armed<=0&&(hit||p.mesh.position.y<floor+.08)){impact(p.mesh.position.clone(),hit?new THREE.Vector3(0,0,Math.sign(p.mesh.position.z-routeZ(p.mesh.position.x))||1):new THREE.Vector3(0,1,0),p.vel.length());scene.remove(p.mesh);projectiles.splice(i,1);continue;}if(p.life>8||p.mesh.position.y<CITY_GROUND-8){scene.remove(p.mesh);projectiles.splice(i,1);}}
 for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.life-=dt;d.vel.y-=GRAVITY*dt;d.mesh.position.addScaledVector(d.vel,dt);d.mesh.rotation.x+=dt*8;d.mesh.rotation.y+=dt*5;if(d.life<=0){scene.remove(d.mesh);debris.splice(i,1);}}
}
function updateTrajectory(){const q=charging?clamp((performance.now()-chargeStarted)/(CHARGE_SECONDS*1000),.06,1):0;chargeBar.style.width=`${q*100}%`;if(!charging){for(const d of dots)d.visible=false;return;}const dir=aimDirection(),v=dir.multiplyScalar(lerp(THROW_MIN,THROW_MAX,q)).add(new THREE.Vector3(0,1.4,0));const start=heldRock.position.clone();for(let i=0;i<dots.length;i++){const t=(i+1)*.105;dots[i].position.copy(start).addScaledVector(v,t);dots[i].position.y-=.5*GRAVITY*t*t;dots[i].visible=true;}}

function updateCamera(){const dir=aimDirection(),right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));const target=player.pos.clone().add(new THREE.Vector3(0,1.35,0));const desired=target.clone().addScaledVector(dir,-4.1).addScaledVector(right,.78);desired.y+=.7;camera.position.lerp(desired,.16);camera.lookAt(target.clone().addScaledVector(dir,8));}
function updateLighting(t){const phase=(t/90000)%1,night=Math.max(0,Math.sin((phase-.5)*Math.PI*2)*.5+.5);sun.intensity=lerp(3.3,.55,night);hemi.intensity=lerp(1.55,.55,night);scene.background.setRGB(lerp(.13,.025,night),lerp(.11,.035,night),lerp(.13,.07,night));scene.fog.color.copy(scene.background);}
function updateVisibility(){const r=renderer.domElement.getBoundingClientRect(),area=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top));state.visibilityPercent=Number((100*area/(innerWidth*innerHeight)).toFixed(1));}

let last=performance.now();
function frame(now){requestAnimationFrame(frame);state.frames=(state.frames||0)+1;const dt=Math.min(.033,(now-last)/1000||.016);last=now;window.GameGoldenStandard?.frame?.();updatePlayer(dt);updateCamera();updateHeldRock(now);updateProjectiles(dt);updateTrajectory();updateLighting(now);mixer?.update(dt);renderer.render(scene,camera);}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);updateVisibility();});

async function boot(){ensureChunks(0);await loadAvatar();updateHeldRock(performance.now());updateVisibility();window.GameGoldenStandard?.reportReady?.({walkable:true,collisions:true,grounding:true,playerSpawn:true,mouseLook:true,touchControls:coarse?true:window.GameGoldenStandard.state.touchControls,mobileReady:true});state.ready=true;statusEl.textContent=`ROBLOX→WORLD SERVER · ${state.visibilityPercent}% графики · F/кнопка — бросок`;setTimeout(()=>statusEl.style.opacity='.18',3400);loading.classList.add('hide');requestAnimationFrame(frame);}
boot();
