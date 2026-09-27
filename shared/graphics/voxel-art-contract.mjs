// Shared deterministic contract for original Blender-generated voxel art.
export const WORLD_VOXEL_TYPES = Object.freeze(["barren", "city", "forest", "river", "volcano", "energy", "idea", "villager"]);
const ALIASES = Object.freeze({
  village: "city", desert: "barren", nature: "forest",
  woods: "forest", electricity: "energy", power: "energy",
  concept: "idea", human: "villager",
});
export function voxelType(raw) {
  const key = String(raw || "").trim().toLowerCase();
  const result = ALIASES[key] || key;
  return WORLD_VOXEL_TYPES.includes(result) ? result : null;
}
export function validVoxelManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entities)) return false;
  const seen = new Set();
  return manifest.entities.length > 0 && manifest.entities.every(item => {
    if (!voxelType(item?.type) || seen.has(item.id)) return false;
    if (item.id !== item.type || item.file !== item.type + ".glb") return false;
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || "")) return false;
    if (!(Number.isSafeInteger(item.bytes) && item.bytes > 20)) return false;
    if (!Array.isArray(item.clips) || !Array.isArray(item.vfx)) return false;
    seen.add(item.id);
    return true;
  });
}
export function planVoxelPlacements(world, max = 8) {
  if (!world || !Array.isArray(world.entities)) return [];
  const limit = Math.max(0, Math.min(24, Math.floor(Number(max) || 0)));
  if (limit === 0) return [];
  const seen = new Set();
  const result = [];
  for (const e of world.entities) {
    const type = voxelType(e?.type || e?.kind);
    const x = Number(e?.x ?? e?.position?.x);
    const z = Number(e?.z ?? e?.position?.z);
    const radius = Number(e?.radius ?? 30);
    const id = String(e?.id || "");
    if (!type || !Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (Math.abs(x) > 10000 || Math.abs(z) > 10000 || !id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id, type, x, z, radius: Math.max(8, Math.min(160, Number.isFinite(radius) ? radius : 30)),
    });
    if (result.length === limit) break;
  }
  return result;
}
