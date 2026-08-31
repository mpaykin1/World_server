'use strict';

const crypto = require('crypto');
const { createDefaultCache } = require('./world-procedural-cache');
const { encodeSparseVoxelDag, verifyRoundTrip } = require('./world-procedural-sparse-voxel');

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function chunkCacheKey(worldId, revision, cx, cz, generator = 'base') {
  return sha256(`${worldId}|${revision}|${cx}|${cz}|${generator}`);
}

class DistributedChunkCache {
  constructor(options = {}) {
    this.local = options.local || createDefaultCache(options);
    this.live = options.live || null;
    this.useSparse = options.useSparse !== false;
    this.server = options.server === true;
  }

  async get(input = {}) {
    const key = chunkCacheKey(input.worldId, input.revision, input.cx, input.cz, input.generator);
    const local = this.local.get(key);
    if (local) return { source: 'local', key, value: local };
    if (!this.live?.loadChunkCache) return null;
    const remote = await this.live.loadChunkCache(key);
    if (!remote || remote.key !== key) return null;
    this.local.set(key, remote.value);
    return { source: 'factory-asset-cache', key, value: remote.value, checksum: remote.sha256 || null }; 
  }

  async set(input = {}, chunk) {
    const key = chunkCacheKey(input.worldId, input.revision, input.cx, input.cz, input.generator);
    const value = this.useSparse ? { encoding: 'svdag', data: encodeSparseVoxelDag(chunk) } : { encoding: 'raw', data: chunk };
    if (value.encoding === 'svdag') {
      const check = verifyRoundTrip(chunk, value.data);
      if (!check.ok) throw new Error('refusing to cache invalid sparse voxel DAG');
    }
    this.local.set(key, value);
    if (this.server && this.live?.saveChunkCache) {
      await this.live.saveChunkCache({
        key, worldId: input.worldId, revision: input.revision, cx: input.cx, cz: input.cz,
        generator: input.generator || 'base', value, sha256: sha256(value), verified: true,
        quality: { sourceVoxels: chunk?.voxels?.length || 0 }
      });
    }
    return { key, value };
  }

  async getOrCreate(input, factory) {
    const hit = await this.get(input);
    if (hit) return { ...hit, hit: true };
    const chunk = await factory();
    const stored = await this.set(input, chunk);
    return { source: 'generated', ...stored, hit: false };
  }
}

module.exports = { sha256, chunkCacheKey, DistributedChunkCache };
