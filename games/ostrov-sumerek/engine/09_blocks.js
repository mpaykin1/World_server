/* -----------------------------------------------------------------------------
   2 · World constants
----------------------------------------------------------------------------- */
const W = 64, D = 64, H = 26;          // voxel grid (x, z, y)
const SEA = 3.8;                       // water surface height
const HP_MAX = 6;                      // half-hearts (default; characters and relics change player.maxHp)
const BLOCKED = 99;
// tiles: name → index in the generated atlas (8 columns of 16×16; see art/build.py)
const TL = {};
ASSETS.atlasNames.forEach((n, i) => { TL[n] = i; });
const ATLAS_GRID = ASSETS.atlasGrid || [4, 3];
// blocks: numeric ids follow registration order; B.GRASS etc. stay available for the base pack
const B = { AIR: 0 };
const BLK = [{ id: 'air', num: 0, faces: [0, 0, 0], tint: [1, 0], mm: '#000000' }];
function finalizeBlocks() {
  for (const d of REG.blocks.values()) {
    if (BLK.length > 250) { regError('too many blocks (max 250)'); break; }
    const t = typeof d.tiles === 'string' ? { top: d.tiles, side: d.tiles, bottom: d.tiles } : d.tiles;
    const tile = (n, what) => {
      if (n === undefined) return undefined;
      if (TL[n] === undefined) { regError(`block '${d.id}': ${what} tile '${n}' is not in the atlas (draw it with @tile in packs/*/art)`); return 0; }
      return TL[n];
    };
    const side = tile(t.side ?? t.top, 'side');
    d.num = BLK.length;
    d.faces = [tile(t.top ?? t.side, 'top'), side, tile(t.bottom ?? t.top ?? t.side, 'bottom')];
    d.coveredSide = tile(d.sideCovered, 'sideCovered');
    d.tint = d.tint || [0.94, 0.1];
    d.mm = d.mm || '#808080';
    d.step = d.step || 'soft';
    d.dustCol = d.dust ? new THREE.Color(d.dust) : null;
    B[d.id.toUpperCase()] = d.num;
    BLK.push(d);
  }
}
finalizeBlocks();
const blockNum = (id) => { const d = REG.blocks.get(id); if (!d) { regError(`unknown block '${id}'`); return B.STONE || 1; } return d.num; };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
