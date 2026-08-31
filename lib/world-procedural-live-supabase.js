'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');

const DEFAULTS = Object.freeze({
  worldsTable: 'voxel_worlds',
  eventsTable: 'voxel_world_events',
  snapshotsTable: 'voxel_world_snapshots',
  deviceReportsTable: 'procedural_quality_device_reports',
  learningTable: 'procedural_quality_learning',
  runtimeHealthTable: 'procedural_quality_runtime_health',
  factoryAssetsTable: 'factory_assets',
  factoryAssetVersionsTable: 'factory_asset_versions',
  commitRpc: 'world_procedural_recipe_commit_v3',
  broadcastPrefix: 'world-procedural'
});

function requireClient(client) {
  if (!client || typeof client.from !== 'function') throw new TypeError('Supabase client required');
  return client;
}
function safeWorldId(value) { return core.sanitizeWorldId(value); }
function finiteInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : core.stableStringify(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function assertServerWrite(options) {
  if (options?.server !== true) throw new Error('server:true required for authoritative Supabase writes');
}
function normalizeSnapshotRow(row) {
  if (!row) return null;
  return {
    worldId: row.world_id,
    cx: Number(row.cx) || 0,
    cz: Number(row.cz) || 0,
    throughRevision: Number(row.through_revision) || 0,
    payload: row.payload || {},
    sourceCount: Number(row.source_count) || 0,
    checksum: row.checksum || null,
    formatVersion: Number(row.format_version) || 0,
    verifiedAt: row.verified_at || null,
    updatedAt: row.updated_at || null
  };
}

function createLiveSupabaseProceduralAdapter(client, options = {}) {
  requireClient(client);
  const config = { ...DEFAULTS, ...(options.config || {}) };

  async function loadWorld(worldId) {
    const id = safeWorldId(worldId);
    const { data, error } = await client
      .from(config.worldsTable)
      .select('id,seed,settings,revision,updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const settings = data.settings || {};
    const recipe = settings.proceduralRecipe
      ? core.normalizeRecipe(settings.proceduralRecipe)
      : core.normalizeRecipe({ worldId: id, seed: Number(data.seed) || id, revision: Number(data.revision) || 0 });
    return {
      worldId: id,
      seed: Number(data.seed) || recipe.seed,
      revision: Number(data.revision) || 0,
      recipe,
      contentHash: settings.proceduralRecipeHash || null,
      settings,
      updatedAt: data.updated_at || null
    };
  }

  async function atomicCommit(input = {}) {
    assertServerWrite(options);
    if (typeof client.rpc !== 'function') throw new Error('Supabase rpc() required for atomic recipe commit');
    const worldId = safeWorldId(input.worldId);
    const recipe = core.normalizeRecipe({ ...input.recipe, worldId });
    const contentHash = String(input.contentHash || sha256(recipe)).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('contentHash must be sha256 hex');
    const args = {
      p_world_id: worldId,
      p_expected_revision: Math.max(0, finiteInt(input.expectedRevision, recipe.revision)),
      p_recipe: recipe,
      p_content_hash: contentHash,
      p_delta: input.delta || {},
      p_idempotency_key: input.idempotencyKey || null,
      p_source: String(input.source || 'navigator').slice(0, 64),
      p_created_by_user: input.userId || null,
      p_created_by_guest: input.guestId || null
    };
    const { data, error } = await client.rpc(config.commitRpc, args);
    if (error) throw error;
    return data;
  }

  async function listRecipeEvents(worldId, options2 = {}) {
    const id = safeWorldId(worldId);
    const afterRevision = Math.max(0, finiteInt(options2.afterRevision, 0));
    const limit = Math.max(1, Math.min(512, finiteInt(options2.limit, 128)));
    const { data, error } = await client
      .from(config.eventsTable)
      .select('id,world_id,revision,event_type,payload,source,created_at,idempotency_key,event_checksum')
      .eq('world_id', id)
      .eq('event_type', 'procedural_recipe_patch')
      .gt('revision', afterRevision)
      .order('revision', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function loadChunkSnapshot(worldId, cx, cz) {
    const id = safeWorldId(worldId);
    const { data, error } = await client
      .from(config.snapshotsTable)
      .select('world_id,cx,cz,through_revision,payload,source_count,checksum,format_version,verified_at,updated_at')
      .eq('world_id', id)
      .eq('cx', finiteInt(cx))
      .eq('cz', finiteInt(cz))
      .maybeSingle();
    if (error) throw error;
    return normalizeSnapshotRow(data);
  }

  async function saveChunkSnapshot(input = {}) {
    assertServerWrite(options);
    const worldId = safeWorldId(input.worldId);
    const cx = finiteInt(input.cx);
    const cz = finiteInt(input.cz);
    const payload = input.payload || {};
    const checksum = String(input.checksum || sha256(payload));
    const row = {
      world_id: worldId,
      cx,
      cz,
      through_revision: Math.max(0, finiteInt(input.throughRevision)),
      payload,
      source_count: Math.max(0, finiteInt(input.sourceCount, Array.isArray(payload?.events) ? payload.events.length : 0)),
      checksum,
      format_version: Math.max(3, finiteInt(input.formatVersion, 3)),
      verified_at: input.verified === true ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client
      .from(config.snapshotsTable)
      .upsert(row, { onConflict: 'world_id,cx,cz' })
      .select('world_id,cx,cz,through_revision,payload,source_count,checksum,format_version,verified_at,updated_at')
      .single();
    if (error) throw error;
    return normalizeSnapshotRow(data);
  }


  async function loadChunkCache(cacheKey) {
    const key = String(cacheKey || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('cacheKey must be sha256 hex');
    const assetKey = `world-procedural-chunk:${key}`;
    const { data: asset, error: assetError } = await client
      .from(config.factoryAssetsTable)
      .select('id,current_version,metadata')
      .eq('asset_key', assetKey)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset?.id || !asset.current_version) return null;
    const { data: version, error: versionError } = await client
      .from(config.factoryAssetVersionsTable)
      .select('version,sha256,bytes,status,metadata,created_at')
      .eq('asset_id', asset.id)
      .eq('version', asset.current_version)
      .maybeSingle();
    if (versionError) throw versionError;
    const payload = version?.metadata?.worldProceduralCache;
    if (!payload || payload.key !== key) return null;
    return { ...payload, sha256: version.sha256 || payload.sha256 || null, bytes: Number(version.bytes) || 0, status: version.status || null };
  }

  async function saveChunkCache(input = {}) {
    assertServerWrite(options);
    const key = String(input.key || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('cache key must be sha256 hex');
    const worldId = safeWorldId(input.worldId);
    const assetKey = `world-procedural-chunk:${key}`;
    const versionName = 'v1';
    const value = input.value;
    const digest = String(input.sha256 || sha256(value)).toLowerCase();
    const bytes = Buffer.byteLength(core.stableStringify(value));
    const assetRow = {
      asset_key: assetKey,
      asset_type: 'other',
      display_name: `Procedural chunk ${worldId} ${finiteInt(input.cx)},${finiteInt(input.cz)}`.slice(0, 240),
      current_version: versionName,
      lifecycle_state: 'active',
      metadata: {
        system: 'world-procedural-recipe-engine-v3', worldId,
        revision: Math.max(0, finiteInt(input.revision)), cx: finiteInt(input.cx), cz: finiteInt(input.cz), generator: String(input.generator || 'base').slice(0, 80)
      },
      updated_at: new Date().toISOString()
    };
    const { data: asset, error: assetError } = await client
      .from(config.factoryAssetsTable)
      .upsert(assetRow, { onConflict: 'asset_key' })
      .select('id')
      .single();
    if (assetError) throw assetError;
    const versionRow = {
      asset_id: asset.id,
      version: versionName,
      sha256: digest,
      storage_uri: null,
      media_type: 'application/vnd.world-procedural.chunk+json',
      bytes,
      lod: input.lod || {},
      quality: { verified: input.verified === true, ...(input.quality || {}) },
      compatibility: input.compatibility || { web: true, native: true, cpuFallback: true },
      license_key: 'USER-OWNED',
      status: input.verified === true ? 'validated' : 'draft',
      metadata: { worldProceduralCache: { version: 3, key, value, sha256: digest } }
    };
    const { data: saved, error: versionError } = await client
      .from(config.factoryAssetVersionsTable)
      .upsert(versionRow, { onConflict: 'asset_id,version' })
      .select('id,sha256,bytes,status')
      .single();
    if (versionError) throw versionError;
    return { key, assetId: asset.id, versionId: saved.id, sha256: saved.sha256, bytes: Number(saved.bytes) || bytes, status: saved.status };
  }

  async function reportDevice(report = {}) {
    assertServerWrite(options);
    const row = {
      schema_version: finiteInt(report.schemaVersion, 8),
      device_class: String(report.deviceClass || 'unknown').slice(0, 80),
      physical: report.physical !== false,
      user_agent: report.userAgent ? String(report.userAgent).slice(0, 512) : null,
      screen: report.screen || {},
      hardware: report.hardware || {},
      metrics: report.metrics || {},
      app_path: report.appPath ? String(report.appPath).slice(0, 256) : null,
      verified: report.verified === true
    };
    const { data, error } = await client.from(config.deviceReportsTable).insert(row).select('id').single();
    if (error) throw error;
    return data;
  }

  async function reportRuntimeHealth(report = {}) {
    assertServerWrite(options);
    const row = {
      schema_version: finiteInt(report.schemaVersion, 10),
      app_path: String(report.appPath || 'unknown').slice(0, 256),
      temporal_score: report.temporalScore ?? null,
      p95_frame_ms: report.p95FrameMs ?? null,
      jank_rate: report.jankRate ?? null,
      possible_leak: report.possibleLeak === true,
      thermal_tier: report.thermalTier ?? null,
      shader_prewarm_failed: Math.max(0, finiteInt(report.shaderPrewarmFailed, 0)),
      metrics: report.metrics || {}
    };
    const { data, error } = await client.from(config.runtimeHealthTable).insert(row).select('id').single();
    if (error) throw error;
    return data;
  }

  async function recordLearning(record = {}) {
    assertServerWrite(options);
    const row = {
      scene: String(record.scene || 'world-procedural').slice(0, 160),
      device: String(record.device || record.deviceClass || 'unknown').slice(0, 160),
      score: Number(record.score) || 0,
      settings: record.settings || {},
      metrics: record.metrics || {},
      schema_version: finiteInt(record.schemaVersion, 8),
      render_backend: record.renderBackend || null,
      device_class: record.deviceClass || null,
      scene_fingerprint: record.sceneFingerprint || null,
      settings_hash: record.settingsHash || null,
      visual_score: record.visualScore ?? null,
      animation_score: record.animationScore ?? null,
      stability_score: record.stabilityScore ?? null,
      p50_frame_ms: record.p50FrameMs ?? null,
      p95_frame_ms: record.p95FrameMs ?? null,
      verified: record.verified === true,
      source: String(record.source || 'world-procedural-v3').slice(0, 80),
      native_coverage_pct: record.nativeCoveragePct ?? null,
      regression_free: record.regressionFree === true,
      promotion_state: String(record.promotionState || 'candidate').slice(0, 40),
      style_profile: record.styleProfile || {},
      baseline_id: record.baselineId || null,
      golden_verified: record.goldenVerified === true,
      device_certified: record.deviceCertified === true
    };
    const { data, error } = await client.from(config.learningTable).insert(row).select('id').single();
    if (error) throw error;
    return data;
  }

  function createBroadcastChannel(worldId, onHint, options2 = {}) {
    if (typeof client.channel !== 'function') return { supported: false, close() {}, async send() { return 'unsupported'; } };
    const id = safeWorldId(worldId);
    const topic = `${config.broadcastPrefix}:${id}`;
    const channel = client.channel(topic, { config: { broadcast: { self: options2.self === true } } });
    if (typeof onHint === 'function') {
      channel.on('broadcast', { event: 'recipe_patch' }, ({ payload }) => onHint(payload));
    }
    channel.subscribe();
    return {
      supported: true,
      topic,
      async send(payload) {
        return channel.send({ type: 'broadcast', event: 'recipe_patch', payload });
      },
      async close() {
        if (typeof client.removeChannel === 'function') return client.removeChannel(channel);
        if (typeof channel.unsubscribe === 'function') return channel.unsubscribe();
        return undefined;
      }
    };
  }

  return {
    config,
    loadWorld,
    atomicCommit,
    listRecipeEvents,
    loadChunkSnapshot,
    saveChunkSnapshot,
    loadChunkCache,
    saveChunkCache,
    reportDevice,
    reportRuntimeHealth,
    recordLearning,
    createBroadcastChannel
  };
}

module.exports = { DEFAULTS, sha256, createLiveSupabaseProceduralAdapter };
