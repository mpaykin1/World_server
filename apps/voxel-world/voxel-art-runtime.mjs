import {GLTFLoader} from "https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import {planVoxelPlacements, validVoxelManifest} from "../../shared/graphics/voxel-art-contract.mjs";

// Optional renderer: ?voxelArt=1. The standard renderer remains authoritative.
export function installWorldVoxelArt({THREE, worldGroup, heightAt, camera, assetRoot="/apps/voxel-world/voxel-art/"}) {
  const mobile = matchMedia("(pointer:coarse)").matches;
  const maxEntities = mobile ? 6 : 10;
  const loader = new GLTFLoader();
  const cache = new Map();
  const instances = new Map();
  const clock = new THREE.Clock();
  let generation = 0;
  let manifest = null;
  let failed = null;

  const ready = fetch(assetRoot + "manifest.json", {cache: "force-cache"})
    .then(async response => {
      if (!response.ok) throw new Error("Voxel art manifest HTTP " + response.status);
      const data = await response.json();
      if (!validVoxelManifest(data)) throw new Error("Invalid voxel-art manifest");
      manifest = new Map(data.entities.map(entry => [entry.type, entry]));
      return manifest;
    }).catch(error => { failed = error; console.warn("Voxel art fallback:", error); return null; });

  function load(type) {
    if (!cache.has(type)) {
      const meta = manifest.get(type);
      if (!meta) return Promise.resolve(null);
      cache.set(type, loader.loadAsync(assetRoot + meta.file)
        .catch(error => { console.warn("Voxel art model failed:", type, error); return null; }));
    }
    return cache.get(type);
  }

  function clear() {
    generation++;
    for (const entry of instances.values()) {
      entry.mixer?.stopAllAction();
      worldGroup.remove(entry.group);
      // Geometry and materials are shared across cloned GLTF scenes, so do not dispose them.
    }
    instances.clear();
  }

  async function update(emergenceState) {
    const version = ++generation;
    if (!await ready || version !== generation) return false;
    const placements = planVoxelPlacements(emergenceState, maxEntities);
    const incoming = new Map(placements.map(p => [p.id, p]));
    for (const [id, entry] of [...instances]) {
      const p = incoming.get(id);
      if (!p || p.type !== entry.type || p.x !== entry.x || p.z !== entry.z) {
        entry.mixer?.stopAllAction();
        worldGroup.remove(entry.group);
        instances.delete(id);
      }
    }
    for (const p of placements) {
      if (instances.has(p.id)) continue;
      const gltf = await load(p.type);
      if (!gltf || version !== generation) continue;
      const group = gltf.scene.clone(true);
      group.name = "WorldVoxelArt_" + p.type + "_" + p.id;
      const sample = [[0,0],[2,0],[-2,0],[0,2],[0,-2]]
        .map(([dx,dz]) => heightAt(p.x + dx, p.z + dz));
      const ground = Math.max(...sample.filter(Number.isFinite));
      group.position.set(p.x, (Number.isFinite(ground) ? ground : 22) + .35, p.z);
      group.scale.setScalar(Math.max(1, Math.min(5, p.radius / 7)));
      group.traverse(node => { if (node.isMesh) { node.castShadow = !mobile; node.receiveShadow = true; } });
      worldGroup.add(group);
      const mixer = gltf.animations.length ? new THREE.AnimationMixer(group) : null;
      if (mixer) {
        for (const clip of gltf.animations) {
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.play();
        }
      }
      instances.set(p.id, {...p, group, mixer});
    }
    return true;
  }

  function tick() {
    const elapsed = Math.min(clock.getDelta(), .05);
    const cutoff = mobile ? 80 : 140;
    for (const entry of instances.values()) {
      const dx = entry.x - camera.position.x, dz = entry.z - camera.position.z;
      const visible = dx * dx + dz * dz < cutoff * cutoff;
      entry.group.visible = visible;
      if (visible) entry.mixer?.update(elapsed);
    }
  }

  return {
    ready, update, tick, clear, getError: () => failed,
    stats: () => ({loaded: cache.size, instances: instances.size, failed: failed?.message || null}),
  };
}
