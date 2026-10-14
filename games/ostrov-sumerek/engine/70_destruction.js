/* =============================================================================
   31 · Destruction: the axe fells trees, explosions strip foliage
============================================================================= */
const CH = 16, NCH = (W / CH) * (D / CH);
let chunks = [];
const dirtyChunks = new Set();
function buildChunks() {
  for (const m of chunks) if (m) { scene.remove(m); m.geometry.dispose(); }
  chunks = [];
  for (let i = 0; i < NCH; i++) chunks.push(null);
  for (let i = 0; i < NCH; i++) rebuildChunk(i);
  dirtyChunks.clear();
}
function rebuildChunk(i) {
  const cx = (i % (W / CH)) * CH, cz = Math.floor(i / (W / CH)) * CH;
  if (chunks[i]) { scene.remove(chunks[i]); chunks[i].geometry.dispose(); }
  const m = new THREE.Mesh(buildTerrainGeometry(world, cx, cz, cx + CH, cz + CH), terrainMat);
  scene.add(m);
  chunks[i] = m;
}
function markDirty(x0, z0, x1, z1) {
  for (let cz = Math.max(0, Math.floor((z0 - 1) / CH)); cz <= Math.min(D / CH - 1, Math.floor((z1 + 1) / CH)); cz++)
    for (let cx = Math.max(0, Math.floor((x0 - 1) / CH)); cx <= Math.min(W / CH - 1, Math.floor((x1 + 1) / CH)); cx++) dirtyChunks.add(cx + cz * (W / CH));
}
function rebuildDirty() {
  let n = 0;
  for (const i of dirtyChunks) { rebuildChunk(i); dirtyChunks.delete(i); if (++n >= 2) break; }
  if (n && !dirtyChunks.size) drawMinimapBase();
}
const vIdx = (x, y, z) => x + W * (z + D * y);
// felling removes exactly the voxels the flora grower placed (recorded at world generation)
function fellTree(x, z) {
  const ti = world.trees.findIndex((t) => t.x === x && t.z === z && t.choppable);
  if (ti < 0) return false;
  const t = world.trees[ti], cells = t.cells || [];
  let x0 = x, x1 = x, z0 = z, z1 = z;
  for (let k = 0; k < cells.length; k += 2) {
    const idx = cells[k], b = cells[k + 1];
    if (world.vox[idx] !== b) continue;            // already blasted / changed
    world.vox[idx] = 0;
    const X = idx % W, Z = Math.floor(idx / W) % D, Y = Math.floor(idx / (W * D));
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    const bd = BLK[b];
    if (bd.trunk) for (let q = 0; q < 4; q++) dust.emit(X + 0.5, Y + 0.5, Z + 0.5, rr(-2, 2), rr(1, 4), rr(-2, 2), rr(0.6, 1.1), 0.1, 0.08, C.chip, 1, 14, 0.4, 1, true);
    else if (Math.random() < 0.6) dust.emit(X + 0.5, Y + 0.5, Z + 0.5, rr(-1.5, 1.5), rr(0, 2), rr(-1.5, 1.5), rr(1.5, 3), 0.08, 0.08, bd.leafy ? pick(LEAF) : C.chip, 1, 2.5, 1.4, 1, true);
  }
  const ci = x + z * W;
  world.stand[ci] = world.hgt[ci]; world.kind[ci] = 0;
  world.trees.splice(ti, 1);
  markDirty(x0, z0, x1, z1);
  SFX.timber();
  return true;
}
// the blast column rises: an ellipsoid stretched upward reaches the canopy above a bomb rolling under a tree
function blastLeaves(q, R) {
  let any = false;
  const up = R * 2.1;
  const x0 = Math.floor(q.x - R), x1 = Math.floor(q.x + R), z0 = Math.floor(q.z - R), z1 = Math.floor(q.z + R), y0 = Math.max(0, Math.floor(q.y - R * 0.5)), y1 = Math.min(H - 1, Math.floor(q.y + up));
  for (let y = y0; y <= y1; y++) for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    if (!BLK[world.vox[vIdx(x, y, z)]].leafy) continue;
    const dx = (x + 0.5 - q.x) / R, dz = (z + 0.5 - q.z) / R, dy = (y + 0.5 - q.y) / (y + 0.5 > q.y ? up : R * 0.5);
    if (dx * dx + dy * dy + dz * dz > 1) continue;
    world.vox[vIdx(x, y, z)] = 0; any = true;
    for (let k = 0; k < 2; k++) dust.emit(x + 0.5, y + 0.5, z + 0.5, rr(-3, 3), rr(0.5, 3), rr(-3, 3), rr(1.5, 3), 0.08, 0.08, pick(LEAF), 1, 2.5, 1.2, 1, true);
  }
  if (any) markDirty(x0, z0, x1, z1);
}
