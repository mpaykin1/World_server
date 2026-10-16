/* =============================================================================
   05 · Registry — everything the island is made of is *registered* by packs.
        The engine never hard-codes content: packs (packs/<id>/*.js) call define*()
        at load time, the engine finalizes the tables when it boots.

        defineBlock      voxel block types (tiles, minimap colour, footstep, flags)
        defineBiome      island recipes (block roles, terrain, flora, palette, weather, foes)
        defineFlora      tree / plant / prop growers used by biomes
        defineWeapon     arsenal entries (stats, art cell, anim / fire / ricochet / projectile ids)
        defineAnim       melee pose curves (swing shapes) + held-weapon renderers
        defineFire       ranged firing modes (projectile, chain, beam, …)
        defineRicochet   how a projectile answers a wall
        defineProjectile how a projectile looks, trails and bursts
        defineEnemy      foes (look, stats, body, brain, spawn rules)
        defineBody       how a foe's body moves and is drawn (serpent, jelly, …)
        defineBrain      foe AI (stalker, warden, drifter, …)
        defineCharacter  playable heroes (sprite sheet, perks)
        defineRelic      passive artifacts found on the island
        defineNPC        island inhabitants with lines of dialogue
        defineEvent      weather and world events (blizzard, storm, …)
        defineSound      synth recipes (data, played by playSound)
        defineFx         particle burst recipes (data, played by fx)
        defineWeather    precipitation kinds drawn on the GPU (snow, rain, ash, spores …)
        on(event, fn)    engine hooks (see HOOK_EVENTS)
============================================================================= */
const REG = {
  blocks: new Map(), biomes: new Map(), flora: new Map(), weapons: new Map(), anims: new Map(), fires: new Map(),
  ricochets: new Map(), projectiles: new Map(), enemies: new Map(), bodies: new Map(), brains: new Map(),
  characters: new Map(), relics: new Map(), npcs: new Map(), events: new Map(), sounds: new Map(), fx: new Map(),
  weather: new Map(),
};
const PACKS = [];
let CUR_PACK = 'base';
const REG_LOG = { errors: [], warnings: [] };
// the build wraps every pack's files with packBegin / packEnd so definitions know their origin
function packBegin(meta) { PACKS.push(meta); CUR_PACK = meta.id; }
function packEnd() { CUR_PACK = 'base'; }
function regError(msg) { REG_LOG.errors.push(msg); console.error('[registry] ' + msg); }
function regWarn(msg) { REG_LOG.warnings.push(msg); console.warn('[registry] ' + msg); }

// required fields per kind (checked at define time; references are checked at finalize)
const REQUIRED = {
  blocks: ['tiles'], biomes: ['name', 'blocks'], flora: ['grow'], weapons: ['name', 'kind', 'rar'],
  anims: ['pose'], fires: [], ricochets: ['hit'], projectiles: [], enemies: ['name', 'body', 'brain', 'hp'],
  bodies: ['init', 'step'], brains: ['think'], characters: ['name', 'art'], relics: ['name', 'icon'],
  npcs: ['name', 'art', 'lines'], events: ['name'], sounds: ['steps'], fx: ['parts'], weather: ['color'],
};
function define(kind, id, def) {
  const reg = REG[kind];
  if (!reg) { regError(`unknown kind '${kind}'`); return null; }
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id)) { regError(`${kind}: bad id '${id}' (use lower_snake_case)`); return null; }
  if (reg.has(id) && !def.override) { regError(`${kind}: '${id}' defined twice (${reg.get(id).pack} and ${CUR_PACK}); add override: true to replace`); return null; }
  for (const f of REQUIRED[kind]) if (def[f] === undefined) { regError(`${kind} '${id}' (${CUR_PACK}): missing '${f}'`); return null; }
  const d = Object.assign({}, reg.has(id) && def.override ? reg.get(id) : {}, def, { id, pack: CUR_PACK });
  reg.set(id, d);
  return d;
}
const defineBlock = (id, d) => define('blocks', id, d);
const defineBiome = (id, d) => define('biomes', id, d);
const defineFlora = (id, d) => define('flora', id, d);
const defineWeapon = (id, d) => define('weapons', id, d);
const defineAnim = (id, d) => define('anims', id, d);
const defineFire = (id, d) => define('fires', id, d);
const defineRicochet = (id, d) => define('ricochets', id, typeof d === 'function' ? { hit: d } : d);
const defineProjectile = (id, d) => define('projectiles', id, d);
const defineEnemy = (id, d) => define('enemies', id, d);
const defineBody = (id, d) => define('bodies', id, d);
const defineBrain = (id, d) => define('brains', id, d);
const defineCharacter = (id, d) => define('characters', id, d);
const defineRelic = (id, d) => define('relics', id, d);
const defineNPC = (id, d) => define('npcs', id, d);
const defineEvent = (id, d) => define('events', id, d);
const defineSound = (id, steps, opts = {}) => define('sounds', id, Object.assign({ steps }, opts));
const defineFx = (id, parts) => define('fx', id, { parts });
const defineWeather = (id, d) => define('weather', id, d);

// ── hooks: a tiny event bus. Packs subscribe, the engine emits. ──
const HOOK_EVENTS = [
  'boot',          // ()                         after the registry is finalized
  'world',         // (ctx, stage)               world generation: stage 'terrain' | 'decor' | 'done'
  'run',           // ()                         a new run starts (resetRun)
  'tick',          // (dt)                       every simulated frame while playing
  'coin',          // (coin, collected, total)
  'loot',          // (weapon)
  'relic',         // (relic)
  'hit',           // (foe, damage, opts)        a foe takes damage
  'kill',          // (foe)
  'hurt',          // (amount)                   the hero takes damage
  'spawn',         // (foe)
  'event',         // (event, on)                a world event starts (on=true) / ends
  'win', 'die',    // ()
];
const HOOKS = new Map();
function on(evt, fn) {
  if (!HOOK_EVENTS.includes(evt)) regWarn(`hook '${evt}' is not a known event (${CUR_PACK})`);
  if (!HOOKS.has(evt)) HOOKS.set(evt, []);
  HOOKS.get(evt).push(fn);
}
function emit(evt, ...args) {
  const list = HOOKS.get(evt);
  if (!list) return;
  for (const fn of list) {
    try { fn(...args); } catch (e) { console.error(`[hook ${evt}]`, e); }
  }
}

// ── small helpers packs use in definitions ──
const col3 = (r, g, b, k = 1) => new THREE.Color(r * k, g * k, b * k);
const hexCol = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
const pick = (arr, r = Math.random()) => arr[Math.floor(r * arr.length) % arr.length];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const span = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
// Russian plural: ruPlural(5, 'монета', 'монеты', 'монет') → 'монет'
const ruPlural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
