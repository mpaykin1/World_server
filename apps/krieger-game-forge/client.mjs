import {compileKriegerNativeAuthoring} from "../../tools/krieger-total-control/native-authoring-compiler.mjs";
import {makeRecipe} from "./recipe.mjs";
import {ForgeRenderer} from "./renderer.mjs";

const $=id=>document.getElementById(id);
const canvas=$("game"),renderer=new ForgeRenderer(canvas);
const ui={
  preset:$("preset"),seed:$("seed"),hash:$("hash"),ops:$("ops"),families:$("families"),runtime:$("runtime"),
  delta:$("delta"),familyList:$("familyList"),hp:$("hp"),weapon:$("weapon"),kills:$("kills"),mission:$("mission"),toast:$("toast"),
  stickDot:$("stickDot"),
};
const keys=new Set(),tuning={height:0,bevel:0,damage:0,density:0};
let recipe=null,plan=null,runtime=null,last=performance.now(),lastShot=-10,moveStick={x:0,z:0};

function safeClone(value){return JSON.parse(JSON.stringify(value))}
function nodeSignature(node){
  return JSON.stringify({semanticId:node.semanticId,kind:node.kind,handler:node.handler,runtimeSymbol:node.runtimeSymbol,params:node.params});
}
function diffPlans(before,after){
  if(!before)return["initial compile"];
  const a=new Map(before.nodes.map(n=>[n.semanticId,nodeSignature(n)]));
  const b=new Map(after.nodes.map(n=>[n.semanticId,nodeSignature(n)]));
  const changed=[];
  for(const [id,sig] of b)if(a.get(id)!==sig)changed.push(id);
  for(const id of a.keys())if(!b.has(id))changed.push(id+" removed");
  return changed.length?changed.slice(0,6):["no semantic delta"];
}
function spawnRuntime(next){
  const spawn=next.player?.spawn||[0,0,22];
  return{
    player:{x:spawn[0],z:spawn[2],hp:100,speed:Number(next.player?.speed||8),hitAt:-10},
    enemies:next.creatures.map((c,i)=>({
      id:c.id,x:Number(c.position?.[0]||0),z:Number(c.position?.[2]||0),
      hp:Number(c.hp||70),maxHp:Number(c.hp||70),dead:false,phase:i*1.7,hitAt:-10,
    })),
    bullets:[],particles:[],objectHits:new Map(),destroyed:new Set(),
    aim:{x:0,z:-1},weaponIndex:0,kills:0,victory:false,
  };
}
function compileWorld({announce=true}={}){
  const previous=plan;
  recipe=makeRecipe(ui.preset.value,ui.seed.value.trim()||"KRIEGER",tuning);
  plan=compileKriegerNativeAuthoring(recipe);
  const changed=diffPlans(previous,plan);
  runtime=spawnRuntime(recipe);renderer.setRecipe(recipe);renderer.setRuntime(runtime);
  ui.hash.textContent=plan.recipeHash.toUpperCase();ui.ops.textContent=String(plan.nodes.length);
  ui.families.textContent=String(plan.coverage.realizedFamilies.length);
  ui.runtime.textContent=String(plan.nodes.filter(n=>n.runtimeSymbol).length)+" bind";
  ui.familyList.innerHTML=plan.coverage.realizedFamilies.map(x=>"<i>"+x+"</i>").join("");
  ui.delta.textContent=changed.join(" · ");updateHud();
  window.__KRIEGER_MVP_STATE__={
    ready:true,schema:plan.schema,compilerVersion:plan.compilerVersion,upstreamCommit:plan.upstream.commit,
    recipeHash:plan.recipeHash,nodeCount:plan.nodes.length,edgeCount:plan.edges.length,
    families:[...plan.coverage.realizedFamilies],runtimeBindings:plan.nodes.filter(n=>n.runtimeSymbol).map(n=>n.runtimeSymbol),
    changedSemantics:changed,preset:ui.preset.value,
  };
  if(announce)toast("Compiled "+plan.nodes.length+" KRIEGER nodes",true);
}
function updateHud(){
  if(!runtime)return;
  const w=recipe.weapons[runtime.weaponIndex]||recipe.weapons[0];
  ui.hp.textContent=String(Math.max(0,Math.round(runtime.player.hp)));
  ui.weapon.textContent=w.id.toUpperCase()+" "+w.damage;
  ui.kills.textContent=runtime.kills+" / "+runtime.enemies.length;
  if(runtime.victory)ui.mission.textContent="CONTROL PROOF: локация пройдена";
  else if(runtime.player.hp<=0)ui.mission.textContent="Ты погиб — GENERATE перезапустит";
  else ui.mission.textContent="Уничтожь "+runtime.enemies.length+" красных дрона";
}
function toast(message,hot=false){
  ui.toast.textContent=message;ui.toast.classList.toggle("hot",hot);
  clearTimeout(toast.t);toast.t=setTimeout(()=>ui.toast.classList.remove("hot"),1500);
}
function randomSeed(){
  ui.seed.value="K-"+Math.random().toString(36).slice(2,8).toUpperCase();compileWorld();
}
function mutate(kind){
  tuning[kind]=(tuning[kind]+1)%4;compileWorld({announce:false});
  toast(kind.toUpperCase()+" → "+ui.delta.textContent,true);
}
function download(name,data){
  const a=document.createElement("a"),blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function blocked(x,z){
  for(const o of recipe.objects){
    if(runtime.destroyed.has(o.id)||o.params?.role==="bridge")continue;
    const [ox,,oz]=o.position,[sx,,sz]=o.scale;
    if(Math.abs(x-ox)<sx+.65&&Math.abs(z-oz)<sz+.65)return true;
  }
  return false;
}
function movementVector(){
  let x=moveStick.x,z=moveStick.z;
  if(keys.has("KeyA")||keys.has("ArrowLeft"))x-=1;
  if(keys.has("KeyD")||keys.has("ArrowRight"))x+=1;
  if(keys.has("KeyW")||keys.has("ArrowUp"))z-=1;
  if(keys.has("KeyS")||keys.has("ArrowDown"))z+=1;
  const l=Math.hypot(x,z);return l>1?{x:x/l,z:z/l}:{x,z};
}
function updatePlayer(dt){
  if(runtime.player.hp<=0)return;
  const m=movementVector(),speed=runtime.player.speed*dt,nx=runtime.player.x+m.x*speed,nz=runtime.player.z+m.z*speed;
  if(!blocked(nx,runtime.player.z))runtime.player.x=nx;
  if(!blocked(runtime.player.x,nz))runtime.player.z=nz;
}
function burst(x,z,color,count=10){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,s=.8+Math.random()*2.4;
    runtime.particles.push({x,z,y:.5+Math.random()*1.5,vx:Math.cos(a)*s,vz:Math.sin(a)*s,vy:1+Math.random()*2,life:1,color});
  }
}
function fire(){
  if(!runtime||runtime.player.hp<=0)return;
  const now=performance.now()/1000,w=recipe.weapons[runtime.weaponIndex];
  if(now-lastShot<Number(w.cadence||.3))return;
  lastShot=now;const a=runtime.aim;
  runtime.bullets.push({x:runtime.player.x+a.x*1.1,z:runtime.player.z+a.z*1.1,dx:a.x,dz:a.z,speed:w.id==="rail"?34:24,life:1.25,damage:w.damage,weapon:w.id});
  burst(runtime.player.x+a.x,runtime.player.z+a.z,w.id==="rail"?"#ffd06e":"#6ee7ff",4);toast(w.id.toUpperCase()+" · "+w.damage+" damage");
}
function hitObjects(b){
  for(const o of recipe.objects){
    if(runtime.destroyed.has(o.id)||o.params?.role!=="destructible")continue;
    const [x,,z]=o.position,[sx,,sz]=o.scale;
    if(Math.abs(b.x-x)<sx&&Math.abs(b.z-z)<sz){
      const hits=(runtime.objectHits.get(o.id)||0)+1;runtime.objectHits.set(o.id,hits);
      burst(b.x,b.z,"#ff985a",7);b.life=0;
      if(hits>=3){runtime.destroyed.add(o.id);burst(x,z,"#ffa060",20);toast(o.id+" destroyed",true)}
      return true;
    }
  }
  return false;
}
function hitEnemies(b){
  for(const e of runtime.enemies){
    if(e.dead)continue;
    if(Math.hypot(b.x-e.x,b.z-e.z)<1.35){
      e.hp-=b.damage;b.life=0;burst(e.x,e.z,"#ff5c5c",9);
      if(e.hp<=0){e.dead=true;runtime.kills++;burst(e.x,e.z,"#ffb05d",24);toast(e.id+" eliminated",true)}
      return true;
    }
  }
  return false;
}
function updateBullets(dt){
  for(const b of runtime.bullets){
    b.x+=b.dx*b.speed*dt;b.z+=b.dz*b.speed*dt;b.life-=dt;
    if(b.life>0&&!hitEnemies(b))hitObjects(b);
  }
  runtime.bullets=runtime.bullets.filter(b=>b.life>0);
}
function updateEnemies(dt,time){
  if(runtime.player.hp<=0)return;
  for(const e of runtime.enemies){
    if(e.dead)continue;
    const dx=runtime.player.x-e.x,dz=runtime.player.z-e.z,d=Math.hypot(dx,dz)||1;
    if(d>1.8){const s=1.35*dt;e.x+=dx/d*s;e.z+=dz/d*s}
    else if(time-e.hitAt>850){e.hitAt=time;runtime.player.hp-=9;burst(runtime.player.x,runtime.player.z,"#ff5c5c",6)}
  }
}
function updateParticles(dt){
  for(const p of runtime.particles){p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.vy-=4*dt;p.life-=dt*1.4}
  runtime.particles=runtime.particles.filter(p=>p.life>0);
}
function step(time){
  const dt=Math.min(.033,(time-last)/1000);last=time;
  if(runtime){
    updatePlayer(dt);updateBullets(dt);updateEnemies(dt,time);updateParticles(dt);
    if(!runtime.victory&&runtime.kills===runtime.enemies.length){runtime.victory=true;toast("MISSION COMPLETE · recipe is playable",true)}
    updateHud();renderer.render(time);
  }
  requestAnimationFrame(step);
}
function updateAim(ev){
  const r=canvas.getBoundingClientRect(),a=renderer.aimFromScreen(ev.clientX-r.left,ev.clientY-r.top);
  runtime.aim={x:a.x,z:a.z};
}
function setupStick(){
  const zone=$("moveZone");
  const set=ev=>{
    const r=zone.getBoundingClientRect(),cx=r.left+51,cy=r.top+45,dx=ev.clientX-cx,dy=ev.clientY-cy,l=Math.hypot(dx,dy),m=Math.min(32,l),nx=l?dx/l:0,ny=l?dy/l:0;
    moveStick={x:nx*(m/32),z:ny*(m/32)};ui.stickDot.style.transform="translate("+(nx*m)+"px,"+(ny*m)+"px)";
  };
  zone.addEventListener("pointerdown",ev=>{zone.setPointerCapture(ev.pointerId);set(ev)});
  zone.addEventListener("pointermove",ev=>{if(zone.hasPointerCapture(ev.pointerId))set(ev)});
  const reset=()=>{moveStick={x:0,z:0};ui.stickDot.style.transform="translate(0,0)"};
  zone.addEventListener("pointerup",reset);zone.addEventListener("pointercancel",reset);
}
addEventListener("keydown",ev=>{keys.add(ev.code);if(ev.code==="Space"){ev.preventDefault();fire()}if(ev.code==="KeyQ")swapWeapon()});
addEventListener("keyup",ev=>keys.delete(ev.code));
canvas.addEventListener("pointermove",updateAim);canvas.addEventListener("pointerdown",ev=>{updateAim(ev);if(ev.pointerType==="mouse"&&ev.button===0)fire()});
$("generate").onclick=()=>compileWorld();$("randomize").onclick=randomSeed;
ui.preset.onchange=()=>compileWorld();document.querySelectorAll("[data-mutate]").forEach(b=>b.onclick=()=>mutate(b.dataset.mutate));
$("exportRecipe").onclick=()=>download("krieger-game-recipe.json",recipe);
$("exportPlan").onclick=()=>download("krieger-kx-plan.json",plan);
function swapWeapon(){runtime.weaponIndex=(runtime.weaponIndex+1)%recipe.weapons.length;updateHud();toast("weapon → "+recipe.weapons[runtime.weaponIndex].id,true)}
$("weaponBtn").onclick=swapWeapon;$("fireBtn").onpointerdown=fire;setupStick();

compileWorld({announce:false});requestAnimationFrame(step);
window.__KRIEGER_FORGE__={compileWorld,mutate,fire,swapWeapon,getRecipe:()=>safeClone(recipe),getPlan:()=>safeClone(plan),getRuntime:()=>({player:{...runtime.player},bullets:runtime.bullets.length,kills:runtime.kills,weaponIndex:runtime.weaponIndex,destroyed:[...runtime.destroyed]})};
