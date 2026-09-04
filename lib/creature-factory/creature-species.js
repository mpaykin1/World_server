'use strict';

const SPECIES = {
  slime: {
    id: 'slime', hp: 30, damage: 5, speed: 1.2, aggroRange: 6, leashRange: 18, xp: 10,
    loot: [{ item: 'slime_gel', min: 1, max: 3 }], spawnWeight: 40, biomes: ['plains', 'forest']
  },
  goblin: {
    id: 'goblin', hp: 60, damage: 12, speed: 2.5, aggroRange: 12, leashRange: 24, xp: 25,
    loot: [{ item: 'gold_coin', min: 2, max: 6 }, { item: 'crude_dagger', chance: 0.15 }], spawnWeight: 30, biomes: ['forest', 'mountain']
  },
  wolf: {
    id: 'wolf', hp: 45, damage: 15, speed: 4.0, aggroRange: 16, leashRange: 30, xp: 20,
    loot: [{ item: 'wolf_pelt', min: 1, max: 1 }, { item: 'raw_meat', min: 1, max: 2 }], spawnWeight: 25, biomes: ['forest', 'tundra']
  },
  skeleton: {
    id: 'skeleton', hp: 50, damage: 18, speed: 2.0, aggroRange: 14, leashRange: 28, xp: 30,
    loot: [{ item: 'bone', min: 1, max: 3 }, { item: 'rusty_sword', chance: 0.1 }], spawnWeight: 20, biomes: ['desert', 'crypt']
  },
  bear: {
    id: 'bear', hp: 120, damage: 30, speed: 3.0, aggroRange: 10, leashRange: 36, xp: 50,
    loot: [{ item: 'bear_pelt', min: 1, max: 1 }, { item: 'raw_meat', min: 2, max: 4 }], spawnWeight: 10, biomes: ['forest', 'mountain']
  },
  dragon_wyrmling: {
    id: 'dragon_wyrmling', hp: 200, damage: 50, speed: 3.5, aggroRange: 20, leashRange: 60, xp: 150,
    loot: [{ item: 'dragon_scale', min: 2, max: 5 }, { item: 'dragon_fang', chance: 0.3 }], spawnWeight: 3, biomes: ['mountain']
  }
};
function getSpecies(id){ return SPECIES[id] || null; }
function allSpeciesIds(){ return Object.keys(SPECIES); }
function speciesByBiome(biome){ return Object.values(SPECIES).filter(spec => spec.biomes.includes(biome)); }
function totalSpawnWeight(speciesList){ return speciesList.reduce((sum,s)=>sum+s.spawnWeight,0); }
function pickSpecies(speciesList,rand){ const total=totalSpawnWeight(speciesList); if(total<=0)return null; let roll=rand()*total; for(const s of speciesList){ roll-=s.spawnWeight; if(roll<=0)return s; } return speciesList[speciesList.length-1] || null; }
module.exports={SPECIES,getSpecies,allSpeciesIds,speciesByBiome,totalSpawnWeight,pickSpecies};
