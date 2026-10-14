/* -----------------------------------------------------------------------------
   4 · Mesher: culled faces, atlas UVs, per-vertex ambient occlusion
----------------------------------------------------------------------------- */
const FACES = [
  { n: [1, 0, 0], k: 1, v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] },
  { n: [-1, 0, 0], k: 1, v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] },
  { n: [0, 1, 0], k: 0, v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 1], [0, 0], [1, 0], [1, 1]] },
  { n: [0, -1, 0], k: 2, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  { n: [0, 0, 1], k: 1, v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] },
  { n: [0, 0, -1], k: 1, v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], uv: [[1, 0], [1, 1], [0, 1], [0, 0]] },
];
// meshes one rectangular region (a 16×16 chunk) so felled trees and blasted leaves rebuild only locally
function buildTerrainGeometry(world, x0 = 0, z0 = 0, x1 = W, z1 = D) {
  const { vox } = world;
  const at = (x, y, z) => x + W * (z + D * y);
  const solid = (x, y, z) => (y < 0 ? true : (x < 0 || z < 0 || x >= W || z >= D || y >= H) ? false : vox[at(x, y, z)] !== 0);
  const pos = [], nrm = [], uvs = [], col = [], idx = [], cut = [];
  const AO = [0.36, 0.58, 0.8, 1.0];
  const COLS = ATLAS_GRID[0], TU = 1 / ATLAS_GRID[0], TV = 1 / ATLAS_GRID[1], E = 0.0006;
  let vc = 0;
  for (let y = 0; y < H; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const b = vox[at(x, y, z)];
    if (!b) continue;
    const bd = BLK[b] || BLK[1];
    const tiles = bd.faces;
    const tint = bd.tint[0] + bd.tint[1] * hash3(x, y, z);
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], nx = F.n[0], ny = F.n[1], nz = F.n[2];
      if (solid(x + nx, y + ny, z + nz)) continue;
      let tile = F.k === 0 ? tiles[0] : F.k === 2 ? tiles[2] : tiles[1];
      if (F.k === 1 && bd.coveredSide !== undefined && solid(x, y + 1, z)) tile = bd.coveredSide;
      const u0 = (tile % COLS) * TU + E, v0 = 1 - (Math.floor(tile / COLS) + 1) * TV + E, du = TU - 2 * E, dv = TV - 2 * E;
      const lx = x + nx, ly = y + ny, lz = z + nz;
      const ao = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const c = F.v[k];
        const ox = nx ? 0 : (c[0] ? 1 : -1), oy = ny ? 0 : (c[1] ? 1 : -1), oz = nz ? 0 : (c[2] ? 1 : -1);
        let s1, s2;
        if (nx) { s1 = solid(lx, ly + oy, lz); s2 = solid(lx, ly, lz + oz); }
        else if (ny) { s1 = solid(lx + ox, ly, lz); s2 = solid(lx, ly, lz + oz); }
        else { s1 = solid(lx + ox, ly, lz); s2 = solid(lx, ly + oy, lz); }
        const cr = solid(lx + ox, ly + oy, lz + oz);
        ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr);
        pos.push(x + c[0], y + c[1], z + c[2]);
        nrm.push(nx, ny, nz);
        cut.push(bd.leafy ? 1 : 0);
        uvs.push(u0 + F.uv[k][0] * du, v0 + F.uv[k][1] * dv);
        // blocks under the sea get a cool, darker cast so depth reads through the water
        const wet = y + c[1] < SEA ? 0.78 : 1;
        const s = AO[ao[k]] * tint;
        col.push(s * wet * (wet < 1 ? 0.86 : 1), s * wet * (wet < 1 ? 0.95 : 1), s * wet);
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(vc + 1, vc + 2, vc + 3, vc + 1, vc + 3, vc);
      else idx.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
      vc += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aCut', new THREE.Float32BufferAttribute(cut, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function makeHeightTexture(world) {
  const data = new Uint8Array(W * D * 4);
  for (let i = 0; i < W * D; i++) {
    const v = Math.min(255, Math.round(world.hgt[i] / 16 * 255));
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, W, D, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
