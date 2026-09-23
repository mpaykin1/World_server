import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { handleVoxelAction } from "./voxel-actions.ts";
import { handleChainReaction, isChainReactionAction } from "./chain-reaction.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORLD_ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPES:Record<string,string>={
  city:"city","город":"city","города":"city",
  nature:"forest","природа":"forest",forest:"forest","лес":"forest","леса":"forest",jungle:"forest","джунгли":"forest",
  river:"river","река":"river","реки":"river",
  mountains:"mountains",mountain:"mountains","горы":"mountains","гора":"mountains",
  volcano:"volcano","вулкан":"volcano",
  village:"village","деревня":"village","поселок":"village","посёлок":"village",
  ruins:"ruins","руины":"ruins",
  desert:"desert","пустыня":"desert",
  ocean:"ocean",sea:"ocean","океан":"ocean","море":"ocean",
  snow:"snow",ice:"snow","снег":"snow","лед":"snow","лёд":"snow",
  dragon:"dragon","дракон":"dragon"
};
const LABEL:Record<string,string>={city:"Город",forest:"Природа",river:"Река",mountains:"Горы",volcano:"Вулкан",village:"Поселение",ruins:"Руины",desert:"Пустыня",ocean:"Море",snow:"Снег",dragon:"Дракон"};
const RADIUS:Record<string,number>={city:34,forest:44,river:28,mountains:42,volcano:34,village:24,ruins:22,desert:46,ocean:52,snow:44,dragon:30};
const RULES:Record<string,{kind:string,interest:number,summary:string,details:string[]}>={
  "city|forest":{kind:"living_frontier",interest:.96,summary:"Город встречается с природой: возникает живая окраина, обмен ресурсами и конфликт роста.",details:["road","edge_houses","lumberyard","park","wildlife_corridor"]},
  "city|river":{kind:"riverfront",interest:.94,summary:"Город тянется к воде: появляются переправа, набережная, рынок и защита от паводков.",details:["road","bridge","docks","market","floodwall"]},
  "forest|river":{kind:"wetland_ecology",interest:.9,summary:"Лес и река создают влажную экосистему с переходами, тропами и богатой жизнью.",details:["wetland","wildlife_corridor","ford","fallen_logs","grove"]},
  "city|mountains":{kind:"foothill_city",interest:.91,summary:"Город упирается в горы и отвечает террасами, дорогами, добычей камня и тоннелями.",details:["road","terraces","quarry","watchtower","tunnel"]},
  "forest|volcano":{kind:"burn_and_regrow",interest:.98,summary:"Вулкан разрушает лес, но пепел запускает новую, более плодородную жизнь.",details:["ash_field","burnt_grove","hot_springs","young_forest","wildlife_corridor"]},
  "city|volcano":{kind:"danger_industry",interest:.99,summary:"Опасность вулкана меняет город: защита, эвакуационные пути и новая экономика материалов.",details:["evacuation_road","watchtower","lava_wall","obsidian_workshop","refuge"]},
  "city|ruins":{kind:"archaeology_district",interest:.88,summary:"Новый город начинает жить вокруг прошлого: раскопки превращаются в район и историю.",details:["old_road","dig_site","museum","market","protected_ruins"]},
  "city|desert":{kind:"oasis_trade",interest:.89,summary:"На границе города и пустыни возникают вода, караванные пути и торговля.",details:["caravan_road","well","market","windwall","oasis"]},
  "dragon|forest":{kind:"wild_lair",interest:1,summary:"Дракон превращает лес в территорию риска: меняются тропы, животные и поведение людей.",details:["lair","burnt_grove","watchtower","hidden_trail","refuge"]},
  "city|dragon":{kind:"siege_ecology",interest:1,summary:"Присутствие дракона заставляет город перестраиваться вокруг угрозы и возможностей.",details:["watchtower","refuge","market","wall","dragon_road"]}
};

function fail(status:number,message:string):never{throw Object.assign(new Error(message),{status});}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
async function bodyJson(req:Request){
  if(Number(req.headers.get("content-length")||0)>16384)fail(413,"Request too large.");
  const text=await req.text();
  if(new TextEncoder().encode(text).byteLength>16384)fail(413,"Request too large.");
  try{return JSON.parse(text);}catch{fail(400,"Malformed request JSON.");}
}
function clamp(v:unknown,min:number,max:number){return Math.max(min,Math.min(max,Number(v)||0));}
function round(v:number,p=2){const m=10**p;return Math.round(v*m)/m;}
function hash(value:unknown){let h=2166136261;for(const ch of String(value||"")){h^=ch.codePointAt(0)||0;h=Math.imul(h,16777619);}return h>>>0;}
function unit(value:unknown){return hash(value)/0xffffffff;}
function safeWorldId(value:unknown){const id=String(value||"").trim();if(!WORLD_ID.test(id))fail(400,"Некорректный id мира.");return id;}
function safeType(value:unknown){const key=String(value||"").trim().toLocaleLowerCase("ru-RU");const type=TYPES[key];if(!type)fail(400,"Неизвестная большая сущность мира.");return type;}
function pairKey(a:string,b:string){return [a,b].sort().join("|");}
function relationRule(a:any,b:any){return RULES[pairKey(a.type,b.type)]||{kind:"contact_zone",interest:.76,summary:`${a.label} и ${b.label} начинают менять пространство между собой.`,details:["trail","landmark","camp","exchange_zone","story_site"]};}
function effectFor(kind:string){
  if(/road|trail/i.test(kind))return{biome:"plains",clearTrees:true,surface:"road"};
  if(/park|forest|grove|wildlife|oasis|wetland/i.test(kind))return{biome:"forest",clearTrees:false,surface:null};
  if(/ash|burnt/i.test(kind))return{biome:"desert",clearTrees:true,surface:"ash"};
  if(/terrace|quarry|wall|tower|house|market|workshop|museum|refuge|lair|site|docks|bridge|well|tunnel/i.test(kind))return{biome:null,clearTrees:true,surface:null};
  return{biome:null,clearTrees:false,surface:null};
}
function normalizeEntity(input:any,index:number,seed:number){
  const type=safeType(input?.type||input?.kind),x=round(clamp(input?.x??input?.position?.x,-10000,10000)),z=round(clamp(input?.z??input?.position?.z,-10000,10000));
  const radius=round(clamp(input?.radius||RADIUS[type]||30,8,160));
  const provided=String(input?.id||"");
  const id=/^macro-[a-z0-9-]{4,80}$/.test(provided)?provided:`macro-${type}-${hash(`${seed}:${type}:${x}:${z}:${index}`).toString(16).padStart(8,"0")}`;
  return{id,type,label:String(input?.label||LABEL[type]||type).slice(0,40),x,z,radius,strength:round(clamp(input?.strength||1,.2,2),3),ownerId:input?.ownerId?String(input.ownerId).slice(0,80):null};
}
function featureFor(rel:any,a:any,b:any,kind:string,index:number,seed:number){
  const t=(index+1)/(rel.detailKinds.length+1),px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t,len=Math.max(1,Math.hypot(a.x-b.x,a.z-b.z));
  const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len,offset=(unit(`${seed}:${rel.id}:${kind}`)-.5)*Math.min(18,len*.28),linear=/road|trail|corridor/i.test(kind);
  return{id:`feature-${hash(`${rel.id}:${kind}`).toString(16).padStart(8,"0")}`,relationId:rel.id,kind,label:kind.replaceAll("_"," "),stage:index+1,x:round(px+nx*offset),z:round(pz+nz*offset),radius:round(linear?3.2:5+unit(`${kind}:radius:${seed}`)*5),geometry:linear?{kind:"line",x1:round(a.x),z1:round(a.z),x2:round(b.x),z2:round(b.z),width:round(2.2+unit(`${kind}:width:${seed}`)*2)}:{kind:"point"},effect:effectFor(kind)};
}
function buildState(raw:any,seed:number,growthStage?:number,revision?:number){
  const entities=(Array.isArray(raw?.entities)?raw.entities:[]).slice(0,24).map((e:any,i:number)=>normalizeEntity(e,i,seed));
  const stage=entities.length>=2?Math.max(1,Math.min(5,Math.trunc(Number(growthStage??raw?.growthStage)||1))):(entities.length?1:0);
  const relations:any[]=[],features:any[]=[];
  for(let i=0;i<entities.length;i++)for(let j=i+1;j<entities.length;j++){
    const a=entities[i],b=entities[j],distance=Math.hypot(a.x-b.x,a.z-b.z),reach=(a.radius+b.radius)*1.75;
    if(distance>reach)continue;
    const rule=relationRule(a,b),contact=1-Math.min(1,distance/reach);
    const rel={id:`relation-${hash(`${seed}:${a.id}:${b.id}`).toString(16).padStart(8,"0")}`,a:a.id,b:b.id,kind:rule.kind,summary:rule.summary,distance:round(distance),contact:round(contact,3),interestScore:round(clamp(rule.interest*(.75+contact*.35),0,1),3),detailKinds:rule.details.slice(0,5)};
    relations.push(rel);
    const visible=Math.max(1,Math.min(rel.detailKinds.length,stage));
    for(let k=0;k<visible;k++)features.push(featureFor(rel,a,b,rel.detailKinds[k],k,seed));
  }
  const avg=relations.length?relations.reduce((s,r)=>s+r.interestScore,0)/relations.length:0,diversity=new Set(entities.map((e:any)=>e.type)).size;
  return{schemaVersion:"1.0.0",revision:Math.max(1,Math.trunc(Number(revision??raw?.revision)||1)),growthStage:stage,maxGrowthStage:5,entities,relations,features,interestScore:round(clamp(avg*.82+Math.min(1,diversity/4)*.18,0,1),3)};
}
function bearer(req:Request){const m=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);return m?m[1].trim():"";}
async function identity(admin:any,req:Request,b:any){
  const token=bearer(req);
  if(token){const {data,error}=await admin.auth.getUser(token);if(!error&&data?.user)return{kind:"user",id:data.user.id};}
  const guestId=String(b?.guestId||b?.guest_id||"");
  if(!UUID.test(guestId))fail(400,"Не удалось определить игровую сессию гостя.");
  return{kind:"guest",id:guestId};
}
async function readWorld(admin:any,worldId:string){
  const {data,error}=await admin.from("voxel_worlds").select("id,seed,settings,updated_at").eq("id",worldId).maybeSingle();
  if(error)throw error;if(!data)fail(404,"Мир не найден.");return data;
}
async function mutateWorld(admin:any,worldId:string,fn:(state:any,seed:number)=>any){
  for(let attempt=0;attempt<3;attempt++){
    const row=await readWorld(admin,worldId),seed=Number(row.seed)||1,settings=row.settings&&typeof row.settings==="object"?structuredClone(row.settings):{};
    const dna=settings.worldDNA&&typeof settings.worldDNA==="object"?structuredClone(settings.worldDNA):{};
    const current=buildState(dna.emergence||{},seed);
    const next=fn(current,seed);
    if(!next)return{row,emergence:current,skipped:true};
    const previous=Date.parse(row.updated_at||"");
    const now=new Date(Math.max(Date.now(),Number.isFinite(previous)?previous+1:0)).toISOString();
    settings.worldDNA={...dna,schemaVersion:dna.schemaVersion||"1.0.0",id:dna.id||worldId,seed:dna.seed||seed,generator:dna.generator||{kind:"procedural-voxel",version:1,chunkSize:16,minY:-16,maxY:96},emergence:{...next,updatedAt:now}};
    const {data,error}=await admin.from("voxel_worlds").update({settings,updated_at:now}).eq("id",worldId).eq("updated_at",row.updated_at).select("id,seed,settings,updated_at").maybeSingle();
    if(error)throw error;if(data)return{row:data,emergence:next};
  }
  fail(409,"Мир изменился одновременно у другого игрока. Повтори действие.");
}
async function read(admin:any,b:any){
  const worldId=safeWorldId(b.worldId),row=await readWorld(admin,worldId);
  const emergence=buildState(row.settings?.worldDNA?.emergence||{},Number(row.seed)||1);
  return json({worldId,emergence,runtime:"supabase-edge-emergence"});
}
async function place(admin:any,who:any,b:any){
  const worldId=safeWorldId(b.worldId),type=safeType(b.type),pos=b.position||{};
  if(!Number.isFinite(Number(pos.x))||!Number.isFinite(Number(pos.z)))fail(400,"Invalid macro position.");
  const x=round(clamp(pos.x,-10000,10000)),z=round(clamp(pos.z,-10000,10000));
  const id=typeof b.id==="string"&&/^macro-[a-z0-9-]{4,80}$/.test(b.id)?b.id:null;
  const result=await mutateWorld(admin,worldId,(current,seed)=>{
    const next=normalizeEntity({id,type,x,z,ownerId:who.id},current.entities.length,seed);
    const entities=current.entities.filter((e:any)=>e.id!==next.id);
    const duplicate=entities.findIndex((e:any)=>e.type===next.type&&Math.hypot(e.x-next.x,e.z-next.z)<3);
    if(duplicate>=0)entities.splice(duplicate,1);
    entities.push(next);
    return buildState({entities:entities.slice(-24)},seed,entities.length>=2?1:1,current.revision+1);
  });
  return json({worldId,placedType:type,emergence:result.emergence,runtime:"supabase-edge-emergence"});
}
async function tick(admin:any,b:any){
  const worldId=safeWorldId(b.worldId),hasExpected=b.expectedRevision!==undefined;
  const expected=Number(b.expectedRevision);
  if(hasExpected&&(!Number.isSafeInteger(expected)||expected<1))fail(400,"Invalid expectedRevision.");
  const result=await mutateWorld(admin,worldId,(current,seed)=>{
    if(hasExpected&&current.revision!==expected)return null;
    if(!current.relations.length||current.growthStage>=current.maxGrowthStage)return null;
    return buildState({entities:current.entities},seed,Math.min(5,current.growthStage+1),current.revision+1);
  });
  return json({worldId,skipped:result.skipped===true,complete:result.emergence.growthStage>=result.emergence.maxGrowthStage,emergence:result.emergence,runtime:"supabase-edge-emergence"});
}

Deno.serve(async(req)=>{
  try{
    if(req.method!=="POST")return json({error:"Method not allowed"},405);
    const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key)return json({error:"Supabase runtime is not configured."},503);
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),b=await bodyJson(req),action=String(b.action||"");
    if(isChainReactionAction(action))return await handleChainReaction(admin,req,b,{json});
    const who=await identity(admin,req,b);
    if(["init","chunks","set_block","player_save"].includes(action))
      return await handleVoxelAction(admin,who,b,{readWorld,safeWorldId,json});
    if(action==="macro_read")return await read(admin,b);
    if(action==="macro_place")return await place(admin,who,b);
    if(action==="macro_tick")return await tick(admin,b);
    return json({error:"Неизвестное действие Emergence."},400);
  }catch(error){
    const status=Number((error as any)?.status)||500;
    console.error("[world-emergence]",error);
    return json({error:status>=500?"Emergence backend error.":String((error as any)?.message||error)},status);
  }
});
