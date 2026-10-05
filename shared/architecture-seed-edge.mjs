const VERSION = 1;

const FAMILY_ORDER = ['gothic', 'new_york', 'ancient_chinese', 'tokyo', 'future'];

const FAMILIES = Object.freeze({
  gothic: {
    aliases:['gothic','готик','готич','собор','cathedral'],
    roads:['radial','organic','bridge_spine'],
    density:0.66, verticality:0.62, symmetry:0.70, courtyard:0.12
  },
  new_york: {
    aliases:['new york','new_york','nyc','нью-йорк','нью йорк','манхэттен'],
    roads:['grid','avenue_grid'],
    density:0.94, verticality:0.92, symmetry:0.78, courtyard:0.06
  },
  ancient_chinese: {
    aliases:['ancient china','ancient_chinese','chinese','китай','китайск','древнекитай'],
    roads:['axial','courtyard_grid'],
    density:0.60, verticality:0.27, symmetry:0.94, courtyard:0.88
  },
  tokyo: {
    aliases:['tokyo','токио','япон','japan'],
    roads:['organic_grid','rail_nodes','narrow_lanes'],
    density:0.89, verticality:0.72, symmetry:0.43, courtyard:0.16
  },
  future: {
    aliases:['future','futur','будущ','кибер','cyber','sci-fi','scifi'],
    roads:['multilevel','radial_grid','skybridge_network'],
    density:0.93, verticality:0.98, symmetry:0.62, courtyard:0.20
  }
});

const MODIFIERS = Object.freeze({
  jungle:['jungle','джунг','tropical','тропич'],
  flooded:['flood','затоп','underwater','подвод'],
  ruins:['ruin','руин','abandon','заброш'],
  desert:['desert','пустын'],
  snow:['snow','снег','ice','лед','лёд'],
  volcanic:['volcano','вулкан','lava','лава'],
  islands:['island','остров']
});

const STRUCTURES = Object.freeze({
  gothic:['cathedral','gate_tower','bridge_chapel','crypt','ruined_keep'],
  new_york:['skyscraper','station','bridge_tower','warehouse','subway_entrance'],
  ancient_chinese:['pagoda','palace_gate','drum_tower','courtyard_temple','garden_pavilion'],
  tokyo:['station_complex','observation_tower','crossing','arcade_block','canal_market'],
  future:['arcology','skybridge_hub','orbital_tower','energy_spire','vertical_habitat']
});

const BIOME_STRUCTURES = Object.freeze({
  jungle:['jungle_shrine','overgrown_ruin'],
  flooded:['sunken_quarter','flooded_temple'],
  ruins:['collapsed_tower','buried_vault'],
  desert:['desert_shrine','buried_city'],
  snow:['ice_watchtower','snow_ruin'],
  volcanic:['lava_forge','basalt_citadel'],
  islands:['island_monastery','harbor_ruin']
});

const ASSET_POOLS = Object.freeze({
  gothic:{mobs:['villager','skeleton','bat','iron_golem'],items:['torch','iron_sword','shield','bow'],entities:['chest','minecart']},
  new_york:{mobs:['villager','cat','iron_golem'],items:['spyglass','iron_sword','bow'],entities:['minecart','chest_minecart','chest']},
  ancient_chinese:{mobs:['villager','panda','parrot','iron_golem'],items:['torch','bow','iron_sword'],entities:['boat_bamboo','chest_boat_bamboo','chest']},
  tokyo:{mobs:['villager','cat','fox','parrot'],items:['spyglass','bow','iron_sword'],entities:['minecart','boat_cherry','chest']},
  future:{mobs:['villager','copper_golem','enderman','warden'],items:['spyglass','trident','mace','shield'],entities:['minecart','end_crystal','chest']}
});

function normalizeSeedKey(value, fallback='1') {
  const raw=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  if(!raw) return normalizeSeedKey(fallback,'1');
  if(/^[+-]?\d{1,80}$/.test(raw)) return BigInt(raw).toString();
  return raw.slice(0,128);
}

async function sha256Hex(value) {
  const bytes=new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function unit(seed,lane) {
  const hex=(await sha256Hex(`architecture-seed-v${VERSION}:${normalizeSeedKey(seed)}:${lane}`)).slice(0,12);
  return parseInt(hex,16)/0xffffffffffff;
}

async function seed32FromKey(seed,lane='world') {
  const hex=(await sha256Hex(`architecture-seed-v${VERSION}:${normalizeSeedKey(seed)}:${lane}`)).slice(0,8);
  return (parseInt(hex,16)>>>0)||1;
}

async function pick(seed,lane,values) {
  const u=await unit(seed,lane);
  return values[Math.min(values.length-1,Math.floor(u*values.length))];
}

function detectFamilies(idea='') {
  const text=String(idea).toLocaleLowerCase('ru-RU');
  return FAMILY_ORDER.filter(key=>FAMILIES[key].aliases.some(alias=>text.includes(alias)));
}

function detectModifiers(idea='',theme='') {
  const text=`${idea} ${theme}`.toLocaleLowerCase('ru-RU');
  return Object.entries(MODIFIERS).filter(([,aliases])=>aliases.some(alias=>text.includes(alias))).map(([key])=>key);
}

async function jitter(seed,lane,center,spread=.12) {
  return Math.max(0,Math.min(1,center+((await unit(seed,lane))-.5)*spread*2));
}

async function createSubSeeds(seedKey) {
  const lanes=['terrain','biome','roads','districts','buildings','details','history','water','vegetation','landmarks'];
  const entries=await Promise.all(lanes.map(async lane=>[lane,await seed32FromKey(seedKey,lane)]));
  return Object.fromEntries(entries);
}

async function minecraftUnit(seedKey,lane) {
  const hex=(await sha256Hex(`minecraft-seed-bridge-v1:${seedKey}:${lane}`)).slice(0,12);
  return parseInt(hex,16)/0xffffffffffff;
}

async function minecraftPick(seedKey,lane,values) {
  if(!values?.length) return null;
  const u=await minecraftUnit(seedKey,lane);
  return values[Math.min(values.length-1,Math.floor(u*values.length))];
}

async function createMinecraftProfile(dna,catalog) {
  const pools=ASSET_POOLS[dna.primaryFamily]||ASSET_POOLS.gothic;
  const maps={
    mobs:new Map((catalog?.models?.mobs||[]).map(row=>[row.id,row])),
    items:new Map((catalog?.models?.items||[]).map(row=>[row.id,row])),
    entities:new Map((catalog?.models?.entities||[]).map(row=>[row.id,row]))
  };
  const choose=async(kind,count)=>{
    const scored=await Promise.all((pools[kind]||[]).map(async(id,index)=>({
      id,score:await minecraftUnit(dna.seedKey,`asset:${kind}:${id}:${index}`)
    })));
    scored.sort((a,b)=>b.score-a.score);
    return scored.slice(0,count).map(({id})=>maps[kind].get(id)).filter(Boolean).map(row=>({id:row.id,url:row.url,sha256:row.sha256}));
  };
  const structures=[...(STRUCTURES[dna.primaryFamily]||STRUCTURES.gothic)];
  for(const modifier of dna.modifiers) structures.push(...(BIOME_STRUCTURES[modifier]||[]));
  const pool=[...new Set(structures)];
  return {
    schemaVersion:'1.0.0',
    provider:'prokopiy-minecraft',
    sourceCommit:catalog?.sourceCommit||'unknown',
    permissionEvidence:catalog?.permissionEvidence||'',
    attributionRequired:true,
    structures:{
      pool,
      density:Number((0.04+(await minecraftUnit(dna.seedKey,'structures:density'))*.12).toFixed(4)),
      rareStructure:await minecraftPick(dna.seedKey,'structures:rare',pool)
    },
    assets:{
      mobs:await choose('mobs',3),
      items:await choose('items',3),
      entities:await choose('entities',2)
    }
  };
}

export async function createArchitectureSeedProfile({seed=1,idea='',theme='mixed'}={},catalog={}) {
  const seedKey=normalizeSeedKey(seed);
  const requested=detectFamilies(idea);
  const primaryFamily=requested[0]||await pick(seedKey,'family:auto',FAMILY_ORDER);
  const primary=FAMILIES[primaryFamily];
  const modifiers=detectModifiers(idea,theme);
  const roadPattern=await pick(seedKey,'roads:pattern',primary.roads);
  const dna={
    schemaVersion:'1.0.0',
    generator:{kind:'world-server-architecture-seed',version:VERSION,edgeAdapter:true},
    seedKey,
    seed32:await seed32FromKey(seedKey,'architecture'),
    subSeeds:await createSubSeeds(seedKey),
    primaryFamily,
    blend:[{family:primaryFamily,weight:1}],
    modifiers,
    urbanism:{
      roadPattern,
      density:Number((await jitter(seedKey,'urban:density',primary.density,.1)).toFixed(4)),
      verticality:Number((await jitter(seedKey,'urban:verticality',primary.verticality,.1)).toFixed(4)),
      symmetry:Number((await jitter(seedKey,'urban:symmetry',primary.symmetry,.08)).toFixed(4)),
      courtyardBias:Number((await jitter(seedKey,'urban:courtyard',primary.courtyard,.08)).toFixed(4))
    },
    biome:{
      primary:modifiers.find(x=>['jungle','desert','snow','volcanic','islands'].includes(x))||String(theme||'mixed'),
      flooded:modifiers.includes('flooded'),
      ruins:modifiers.includes('ruins'),
      overgrowth:Number((await jitter(seedKey,'biome:overgrowth',modifiers.includes('jungle')?.82:.22,modifiers.includes('jungle')?.15:.2)).toFixed(4)),
      waterLevelBias:Number((await jitter(seedKey,'biome:water',modifiers.includes('flooded')?.84:.25,modifiers.includes('flooded')?.12:.2)).toFixed(4))
    }
  };
  dna.minecraft=await createMinecraftProfile(dna,catalog);
  return dna;
}

export async function previewArchitectureSeed(body={},catalog={}) {
  const architecture=await createArchitectureSeedProfile({
    seed:body.seed??body.seedKey??1,
    idea:body.idea||'',
    theme:body.theme||'mixed'
  },catalog);
  return {architecture,source:'cloudflare-native-architecture-seed-v1'};
}

export { normalizeSeedKey, seed32FromKey, detectFamilies, detectModifiers };
