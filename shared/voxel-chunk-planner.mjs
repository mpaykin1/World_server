// Shared deterministic chunk planning for browser and Godot native clients.
// Independently implemented for World Server; no third-party source or assets.
function integer(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(name + ' must be an integer in [' + min + ', ' + max + ']');
  }
}
export function planMissingChunks({ centerX, centerZ, radius, budget, isLoaded }) {
  integer('centerX', centerX, -10000000, 10000000);
  integer('centerZ', centerZ, -10000000, 10000000);
  integer('radius', radius, 0, 16);
  integer('budget', budget, 0, 64);
  if (typeof isLoaded !== 'function') throw new TypeError('isLoaded must be a function');
  if (budget === 0) return [];
  const candidates = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      candidates.push({ x: centerX + dx, z: centerZ + dz, d2: dx * dx + dz * dz });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.z - b.z || a.x - b.x);
  const result = [];
  for (const candidate of candidates) {
    if (isLoaded(candidate.x, candidate.z)) continue;
    result.push({ x: candidate.x, z: candidate.z });
    if (result.length >= budget) break;
  }
  return result;
}
export function affectedChunkCoords(x, z, chunkSize = 16) {
  integer('x', x, -10000000, 10000000);
  integer('z', z, -10000000, 10000000);
  integer('chunkSize', chunkSize, 1, 256);
  const cx = Math.floor(x / chunkSize), cz = Math.floor(z / chunkSize);
  const lx = ((x % chunkSize) + chunkSize) % chunkSize;
  const lz = ((z % chunkSize) + chunkSize) % chunkSize;
  const xs = [0], zs = [0];
  if (lx === 0) xs.push(-1);
  else if (lx === chunkSize - 1) xs.push(1);
  if (lz === 0) zs.push(-1);
  else if (lz === chunkSize - 1) zs.push(1);
  const out = [];
  for (const dx of xs) for (const dz of zs) out.push({ x: cx + dx, z: cz + dz });
  return out;
}
