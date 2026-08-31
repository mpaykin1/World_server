'use strict';

const { compileWorldRecipe, createRecipeDeltaPacket, applyRecipeDeltaPacket } = require('./world-procedural-recipe-engine');

class MemoryAuthorityAdapter {
  constructor() { this.map = new Map(); }
  async load(worldId) { return this.map.get(String(worldId)) || null; }
  async compareAndSwap(worldId, expectedHash, nextSnapshot) {
    const key = String(worldId);
    const current = this.map.get(key) || null;
    const currentHash = current?.contentHash || null;
    if (currentHash !== (expectedHash || null)) return { ok: false, current };
    this.map.set(key, nextSnapshot);
    return { ok: true, current: nextSnapshot };
  }
}

class RecipeAuthority {
  constructor(adapter = new MemoryAuthorityAdapter()) {
    if (!adapter?.load || !adapter?.compareAndSwap) throw new TypeError('authority adapter must implement load and compareAndSwap');
    this.adapter = adapter;
  }

  async get(worldId) { return this.adapter.load(worldId); }

  async initialize(recipeInput, capabilities = {}) {
    const compiled = compileWorldRecipe(recipeInput, capabilities);
    const snapshot = { worldId: compiled.recipe.worldId, revision: compiled.recipe.revision, contentHash: compiled.contentHash, recipe: compiled.recipe };
    const result = await this.adapter.compareAndSwap(compiled.recipe.worldId, null, snapshot);
    if (!result.ok) return result.current;
    return snapshot;
  }

  async commit(previousCompiled, nextCompiled) {
    if (!previousCompiled?.recipe || !nextCompiled?.recipe) throw new TypeError('compiled recipes required');
    if (previousCompiled.recipe.worldId !== nextCompiled.recipe.worldId) throw new Error('authority world mismatch');
    if (nextCompiled.recipe.revision <= previousCompiled.recipe.revision) throw new Error('authority revision must increase');
    const snapshot = { worldId: nextCompiled.recipe.worldId, revision: nextCompiled.recipe.revision, contentHash: nextCompiled.contentHash, recipe: nextCompiled.recipe };
    const result = await this.adapter.compareAndSwap(nextCompiled.recipe.worldId, previousCompiled.contentHash, snapshot);
    if (!result.ok) {
      const error = new Error('authority compare-and-swap conflict');
      error.code = 'WORLD_RECIPE_CONFLICT';
      error.current = result.current;
      throw error;
    }
    return { snapshot, delta: createRecipeDeltaPacket(previousCompiled, nextCompiled) };
  }

  async applyClientDelta(previousCompiled, packet, capabilities = {}) {
    const next = applyRecipeDeltaPacket(previousCompiled, packet, capabilities);
    return this.commit(previousCompiled, next);
  }
}

module.exports = { MemoryAuthorityAdapter, RecipeAuthority };
