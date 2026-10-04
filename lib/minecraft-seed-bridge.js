'use strict';

const crypto = require('crypto');
const { loadCatalog } = require('./prokopiy-minecraft-assets');

const BLOCK_SLOTS = Object.freeze([
  'grass','dirt','stone','sand','wood','leaves','snow','water','glass','brick','plank','coal','iron'
]);

const PALETTES = Object.freeze({
  gothic: {
    grass:['grass_block_top','moss_block'], dirt:['dirt','coarse_dirt'],
    stone:['stone_bricks','cobbled_deepslate','deepslate_tiles'], sand:['gravel','sand'],
    wood:['dark_oak_log','spruce_log'], leaves:['dark_oak_leaves','spruce_leaves'],
    snow:['snow'], water:['water_still'], glass:['glass','tinted_glass'],
    brick:['stone_bricks','deepslate_bricks','bricks'], plank:['dark_oak_planks','spruce_planks'],
    coal:['coal_ore','coal_block'], iron:['iron_block','oxidized_copper']
  },
  new_york: {
    grass:['grass_block_top'], dirt:['dirt'], stone:['smooth_stone','stone'],
    sand:['sand','gravel'], wood:['oak_log'], leaves:['oak_leaves'], snow:['snow'],
    water:['water_still'], glass:['glass','tinted_glass'], brick:['bricks','gray_concrete'],
    plank:['oak_planks'], coal:['coal_block'], iron:['iron_block','light_gray_concrete']
  },
  ancient_chinese: {
    grass:['grass_block_top','moss_block'], dirt:['dirt'], stone:['stone','stone_bricks'],
    sand:['sand'], wood:['dark_oak_log','bamboo_block'], leaves:['bamboo_leaves','cherry_leaves'],
    snow:['snow'], water:['water_still'], glass:['glass'], brick:['red_terracotta','bricks'],
    plank:['bamboo_planks','dark_oak_planks','cherry_planks'], coal:['coal_block'],
    iron:['copper_block','iron_block']
  },
  tokyo: {
    grass:['grass_block_top'], dirt:['dirt'], stone:['smooth_stone','stone'],
    sand:['sand'], wood:['cherry_log','oak_log'], leaves:['cherry_leaves','oak_leaves'],
    snow:['snow'], water:['water_still'], glass:['glass','tinted_glass'],
    brick:['white_concrete','light_gray_concrete','bricks'], plank:['cherry_planks','oak_planks'],
    coal:['coal_block'], iron:['iron_block','gray_concrete']
  },
  future: {
    grass:['moss_block','grass_block_top'], dirt:['deepslate','dirt'],
    stone:['deepslate_tiles','smooth_stone','quartz_block_side'], sand:['sand'],
    wood:['bamboo_block','stripped_oak_log'], leaves:['azalea_leaves','oak_leaves'],
    snow:['snow'], water:['water_still'], glass:['tinted_glass','glass'],
    brick:['black_concrete','gray_concrete','quartz_block_side'], plank:['bamboo_mosaic','bamboo_planks'],
    coal:['coal_block','deepslate_coal_ore'], iron:['iron_block','copper_block','oxidized_copper']
  }
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

function hashUnit(seedKey, lane) {
  const hex = crypto.createHash('sha256').update(`minecraft-seed-bridge-v1:${seedKey}:${lane}`).digest('hex').slice(0, 12);
  return parseInt(hex, 16) / 0xffffffffffff;
}
function pick(seedKey, lane, values) {
  if (!values?.length) return null;
  return values[Math.min(values.length - 1, Math.floor(hashUnit(seedKey, lane) * values.length))];
}
function indexById(rows) { return new Map((rows || []).map(row => [row.id, row])); }

function textureEntry(atlas, name) {
  const hit = atlas.textures?.[name];
  if (!hit) return null;
  return { name, index: hit[0], frames: hit[1] };
}

function buildPalette(dna, atlas) {
  const family = PALETTES[dna.primaryFamily] || PALETTES.gothic;
  return BLOCK_SLOTS.map((slot, i) => {
    const candidates = family[slot] || PALETTES.gothic[slot];
    const name = pick(dna.seedKey, `palette:${slot}:${i}`, candidates);
    const entry = textureEntry(atlas, name);
    if (!entry) throw new Error(`Minecraft atlas texture missing: ${name}`);
    return { slot: i + 1, role: slot, ...entry };
  });
}

function structurePool(dna) {
  const out = [...(STRUCTURES[dna.primaryFamily] || STRUCTURES.gothic)];
  for (const modifier of dna.modifiers || []) out.push(...(BIOME_STRUCTURES[modifier] || []));
  return [...new Set(out)];
}

function resolveAssets(dna, catalog) {
  const pools = ASSET_POOLS[dna.primaryFamily] || ASSET_POOLS.gothic;
  const maps = {
    mobs:indexById(catalog.models?.mobs),
    items:indexById(catalog.models?.items),
    entities:indexById(catalog.models?.entities)
  };
  const choose = (kind, count) => {
    const candidates = pools[kind] || [];
    const ordered = candidates
      .map((id, i) => ({ id, score:hashUnit(dna.seedKey, `asset:${kind}:${id}:${i}`) }))
      .sort((a,b) => b.score - a.score)
      .slice(0, count);
    return ordered.map(({id}) => maps[kind].get(id)).filter(Boolean).map(row => ({ id:row.id, url:row.url, sha256:row.sha256 }));
  };
  return { mobs:choose('mobs',3), items:choose('items',3), entities:choose('entities',2) };
}

function createMinecraftSeedProfile(dna) {
  if (!dna?.seedKey || !dna?.primaryFamily) throw new TypeError('architecture DNA is required');
  const catalog = loadCatalog();
  const atlas = require('../assets/voxel/prokopiy-minecraft/blocks/blocks_atlas.json');
  const structures = structurePool(dna);
  return {
    schemaVersion:'1.0.0',
    provider:'prokopiy-minecraft',
    sourceCommit:catalog.sourceCommit,
    permissionEvidence:catalog.permissionEvidence,
    attributionRequired:true,
    blockAtlas:{
      imageUrl:'/assets/voxel/prokopiy-minecraft/' + catalog.blockAtlas.image,
      metadataUrl:'/assets/voxel/prokopiy-minecraft/' + catalog.blockAtlas.metadata,
      columns:catalog.blockAtlas.columns,
      layers:catalog.blockAtlas.layers,
      tile:atlas.tile,
      palette:buildPalette(dna, atlas)
    },
    structures:{
      pool:structures,
      density:Number((0.04 + hashUnit(dna.seedKey,'structures:density') * 0.12).toFixed(4)),
      rareStructure:pick(dna.seedKey,'structures:rare',structures)
    },
    assets:resolveAssets(dna, catalog)
  };
}

function sampleMinecraftStructure(profile, seedKey, x, z) {
  if (!profile?.structures?.pool?.length) return null;
  const cellX=Math.floor(Number(x)/48), cellZ=Math.floor(Number(z)/48);
  const chance=hashUnit(seedKey,`structure:${cellX}:${cellZ}:chance`);
  if (chance > profile.structures.density) return null;
  const pool=profile.structures.pool;
  return {
    cellX, cellZ,
    type:pick(seedKey,`structure:${cellX}:${cellZ}:type`,pool),
    rotation:Math.floor(hashUnit(seedKey,`structure:${cellX}:${cellZ}:rotation`)*4)*90,
    scale:Number((0.8+hashUnit(seedKey,`structure:${cellX}:${cellZ}:scale`)*0.7).toFixed(3))
  };
}

module.exports = { BLOCK_SLOTS, PALETTES, STRUCTURES, BIOME_STRUCTURES, createMinecraftSeedProfile, sampleMinecraftStructure };
