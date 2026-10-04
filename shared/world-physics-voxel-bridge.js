(function (global) {
  'use strict';

  function assertApi() {
    const api = global.WorldPhysicsRuntime;
    if (!api?.WorldPhysicsRuntime || !api?.VoxelCellAdapter) {
      throw new Error('WorldPhysicsRuntime browser bundle is not loaded');
    }
    return api;
  }

  function createWorldPhysicsVoxelBridge({
    seed = 1, getBlock, setBlock, emitRenderCommand = null,
    onDynamicMatter = null, onVoxelChanges = null, maxRegionCells = 100000
  } = {}) {
    if (typeof getBlock !== 'function' || typeof setBlock !== 'function') {
      throw new Error('Voxel bridge requires getBlock and setBlock callbacks');
    }
    const api = assertApi();
    let runtime = null, adapter = null, bounds = null;

    function beginRegion(center, { radius = 8, verticalRadius = 8, groundY = null } = {}) {
      const r = Math.max(1, Math.min(24, Math.floor(radius)));
      const vr = Math.max(1, Math.min(24, Math.floor(verticalRadius)));
      bounds = {
        min: { x: center.x - r, y: center.y - vr, z: center.z - r },
        max: { x: center.x + r, y: center.y + vr, z: center.z + r }
      };
      const anchorY = Number.isFinite(groundY) ? groundY : bounds.min.y;
      runtime = new api.WorldPhysicsRuntime({
        mode: 'voxel3d', seed, groundY: anchorY, maxStructuralCells: maxRegionCells
      });
      adapter = new api.VoxelCellAdapter(runtime);
      const imported = adapter.importRegion({
        min: bounds.min, max: bounds.max, getBlock, maxCells: maxRegionCells
      });
      anchorBoundarySolids();
      runtime.drainEvents();
      return { bounds: clone(bounds), imported };
    }

    function anchorBoundarySolids() {
      const { min, max } = bounds;
      for (let y = min.y; y <= max.y; y++) {
        for (let x = min.x; x <= max.x; x++) {
          anchorIfSolid(x, y, min.z); anchorIfSolid(x, y, max.z);
        }
        for (let z = min.z + 1; z < max.z; z++) {
          anchorIfSolid(min.x, y, z); anchorIfSolid(max.x, y, z);
        }
      }
      for (let x = min.x + 1; x < max.x; x++) {
        for (let z = min.z + 1; z < max.z; z++) anchorIfSolid(x, min.y, z);
      }
    }

    function anchorIfSolid(x, y, z) {
      const cell = runtime.getCell(x, y, z);
      if (cell && api.MATERIALS[cell.material]?.phase === 'solid') runtime.addAnchor(x, y, z);
    }

    function step({
      ticks = 1, matterMaxCells = 50000, structural = true,
      detach = true, clusterSteps = 1
    } = {}) {
      requireRegion();
      const reports = [];
      for (let i = 0; i < Math.max(1, Math.floor(ticks)); i++) {
        reports.push(runtime.step({ matterMaxCells, structural, detach, clusterSteps }));
      }
      return commit(reports);
    }

    function explode(center, options = {}) {
      requireRegion();
      const explosion = runtime.explode({ ...center, ...options });
      const detach = runtime.detachUnsupported();
      const settleTicks = Math.max(0, Math.min(30, Math.floor(options.settleTicks ?? 8)));
      const reports = [];
      for (let i = 0; i < settleTicks; i++) {
        reports.push(runtime.step({ structural: true, detach: true, clusterSteps: 1 }));
      }
      return { explosion, detach, ...commit(reports) };
    }

    function ignite(position, { temperature = 700, ticks = 5 } = {}) {
      requireRegion();
      const cell = runtime.getCell(position.x, position.y, position.z);
      if (!cell) return { ignited: false, reason: 'air' };
      const def = api.MATERIALS[cell.material];
      if (!def?.ignition) return { ignited: false, reason: 'not-flammable' };
      runtime.setCell(position.x, position.y, position.z, cell.material, {
        ...cell, burning: true, temperature: Math.max(cell.temperature, temperature)
      });
      return { ignited: true, ...step({ ticks }) };
    }

    function inject(position, material, state = {}) {
      requireRegion();
      runtime.setCell(position.x, position.y, position.z, material, state);
      return commit([]);
    }

    function commit(reports = []) {
      requireRegion();
      const events = runtime.drainEvents();
      const changes = adapter.changesFromEvents(events);
      for (const change of changes) if (change.block !== null) {
        setBlock(change.x, change.y, change.z, change.block);
      }
      if (typeof onVoxelChanges === 'function' && changes.length) onVoxelChanges(changes);
      const commands = api.renderCommandsForEvents(events);
      if (typeof emitRenderCommand === 'function') {
        for (const command of commands) emitRenderCommand(command);
      }
      const dynamicMatter = adapter.exportVoxelState().dynamicMatter;
      const dynamicState = { cells: dynamicMatter, clusters: runtime.clusters.snapshot() };
      if (typeof onDynamicMatter === 'function') onDynamicMatter(dynamicState);
      return {
        reports, events, changes, commands, dynamicMatter, dynamicState, stats: runtime.stats()
      };
    }

    function snapshot() {
      requireRegion();
      return {
        bounds: clone(bounds), runtime: runtime.snapshot(), voxel: adapter.exportVoxelState()
      };
    }

    function requireRegion() {
      if (!runtime || !adapter) throw new Error('beginRegion must be called before voxel physics operations');
    }

    return {
      beginRegion, step, explode, ignite, inject, commit, snapshot,
      get runtime() { return runtime; },
      get adapter() { return adapter; },
      get bounds() { return bounds ? clone(bounds) : null; }
    };
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  global.WorldPhysicsVoxelBridge = Object.freeze({ createWorldPhysicsVoxelBridge });
})(globalThis);
