import * as THREE from 'three';
import { WorldManifestationEngine } from './world-manifestation-engine.mjs';
import { ROCK_DARK, ROCK_MID, ROCK_LIT, WORLD_VOX } from './dark-void-scene-runtime.mjs';

// Same block ids as world-shape-library.mjs's DEFAULT palette - the shape
// library is engine-agnostic and only ever emits these ints, so the id
// table has to match exactly even though this scene has no block game.
const BLOCK = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6, SNOW: 7, WATER: 8, GLASS: 9, BRICK: 10, PLANK: 11, COAL: 12, IRON: 13 };

// Recolored to the dark-void ROCK_DARK/MID/LIT palette (see
// data/godot-voxel-game-baseline.json) instead of Minecraft-ish hues, so
// anything the Navigator conjures reads as part of this world, not a
// different game's block set.
const BLOCK_COLOR = new Map([
  [BLOCK.STONE, ROCK_DARK], [BLOCK.COAL, ROCK_DARK],
  [BLOCK.DIRT, ROCK_MID], [BLOCK.WOOD, ROCK_MID], [BLOCK.BRICK, ROCK_MID], [BLOCK.PLANK, ROCK_MID],
  [BLOCK.IRON, ROCK_LIT], [BLOCK.SAND, ROCK_LIT], [BLOCK.GRASS, ROCK_LIT],
  [BLOCK.LEAVES, new THREE.Color(0x232c1c)],
  [BLOCK.SNOW, new THREE.Color(0xd8c9a8)],
  [BLOCK.GLASS, new THREE.Color(0xffb066)], // reads as ember/glow, matching the beacon flame
  [BLOCK.WATER, new THREE.Color(0x3f6f9e)],
]);

// Places whatever WorldManifestationEngine's deterministic text->shape
// pipeline (world-command-parser.mjs + world-shape-library.mjs - no
// network/LLM call, pure local parsing) produces, as real voxel cubes in
// the dark-void scene. One capped-capacity InstancedMesh with a slot
// allocator (hide-via-zero-scale on free) so undo/redo - which replays
// the engine's own before/after block batches - is just re-placing or
// re-hiding slots, no rebuild.
// Measured empirically against this exact scene (see the placement sweep
// in the session that added this file): MountainWall's ridge spans
// roughly grid x [-33, 33], so anything conjured needs an x offset past
// that - but the camera's horizontal FOV clips anything past ~grid 38 at
// the eye's depth. [28, 38] is the confirmed-visible, unoccluded window;
// SPAWN_X_BIAS + the engine's own scale-dependent forward distance
// (14-20 grid, see WorldManifestationEngine#plan) lands inside it for
// every supported size alias without needing per-shape special-casing.
const SPAWN_X_BIAS = 20;
const SPAWN_Y_LIFT = 10;

export class DarkVoidManifestation {
  constructor({ scene, origin, voxSize = WORLD_VOX, capacity = 20000, maxBlocksPerPlan = 700 } = {}) {
    this.voxSize = voxSize;
    this.origin = origin;
    const geo = new THREE.BoxGeometry(voxSize * 0.94, voxSize * 0.94, voxSize * 0.94);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.04 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'DarkVoidManifestation';
    scene.add(this.mesh);

    this._slotOf = new Map();
    this._free = [];
    this._maxUsed = 0;
    this._capacity = capacity;
    this._tmp = new THREE.Object3D();

    this.engine = new WorldManifestationEngine({
      // A fixed "conjuring spot" beside the mountain, not the camera's
      // current facing - see SPAWN_X_BIAS above for why. yaw=PI/2 makes
      // the engine's own forward-distance math (which scales with the
      // parsed size alias) add purely to x, matching that bias's axis.
      getPlayerPose: () => ({
        x: this.origin.x / voxSize + SPAWN_X_BIAS,
        y: this.origin.y / voxSize + SPAWN_Y_LIFT,
        z: this.origin.z / voxSize,
        yaw: Math.PI / 2,
      }),
      setBlocksLocalBatch: blocks => this._applyBatch(blocks),
      maxBlocks: maxBlocksPerPlan,
    });
  }

  execute(text) { return this.engine.execute(text); }
  undo() { return this.engine.undo(); }
  redo() { return this.engine.redo(); }
  stats() { return { ...this.engine.stats(), placed: this._slotOf.size }; }

  _key(x, y, z) { return `${x},${y},${z}`; }

  _applyBatch(blocks) {
    for (const b of blocks) {
      const k = this._key(b.x, b.y, b.z);
      const existing = this._slotOf.get(k);
      if (!b.blockType) {
        if (existing != null) { this._hideSlot(existing); this._slotOf.delete(k); this._free.push(existing); }
        continue;
      }
      let slot = existing;
      if (slot == null) {
        if (this._free.length) slot = this._free.pop();
        else if (this._maxUsed < this._capacity) slot = this._maxUsed++;
        else continue; // capacity exhausted - drop silently, this is a cinematic vignette not a full world
        this._slotOf.set(k, slot);
      }
      this._placeSlot(slot, b);
    }
    this.mesh.count = Math.max(this.mesh.count, this._maxUsed);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  _placeSlot(slot, b) {
    const s = this.voxSize;
    this._tmp.position.set(b.x * s, b.y * s, b.z * s);
    this._tmp.scale.set(1, 1, 1);
    this._tmp.updateMatrix();
    this.mesh.setMatrixAt(slot, this._tmp.matrix);
    this.mesh.setColorAt(slot, BLOCK_COLOR.get(b.blockType) || ROCK_MID);
  }

  _hideSlot(slot) {
    this._tmp.position.set(0, 0, 0);
    this._tmp.scale.set(0, 0, 0);
    this._tmp.updateMatrix();
    this.mesh.setMatrixAt(slot, this._tmp.matrix);
  }
}
