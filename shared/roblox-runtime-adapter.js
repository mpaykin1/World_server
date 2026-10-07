'use strict';
(function () {
  if (typeof window === 'undefined' || window.WorldServerRobloxRuntime) return;

  function requiredBackend(name, backend) {
    if (!backend) throw new Error(`World Server Roblox adapter requires backend: ${name}`);
    return backend;
  }

  function createPhysicsFacade(backend) {
    const host = requiredBackend('physics', backend);
    return Object.freeze({
      raycast(origin, direction, options) { return host.raycast(origin, direction, options); },
      applyImpulse(body, impulse) { return host.applyImpulse(body, impulse); },
      setLinearVelocity(body, velocity) { return host.setLinearVelocity(body, velocity); },
      onContact(body, handler) { return host.onContact(body, handler); }
    });
  }

  function createNetworkFacade(backend) {
    const host = requiredBackend('network', backend);
    return Object.freeze({
      remote(name) {
        const eventName = String(name || '').slice(0, 128);
        if (!eventName) throw new Error('Remote event name required');
        return Object.freeze({
          fireServer(payload) { return host.fireServer(eventName, payload); },
          fireClient(clientId, payload) { return host.fireClient(eventName, clientId, payload); },
          fireAll(payload) { return host.fireAll(eventName, payload); },
          onServer(handler) { return host.onServer(eventName, handler); },
          onClient(handler) { return host.onClient(eventName, handler); }
        });
      }
    });
  }

  function createInputFacade() {
    return Object.freeze({
      read() {
        const input = window.GameGoldenStandard?.input;
        return typeof input === 'function' ? input() : { forward:false, back:false, left:false, right:false, run:false, jump:false };
      },
      onLook(handler) {
        const listener = (event) => handler(event.detail || { dx:0, dy:0 });
        window.addEventListener('goldenlook', listener);
        return () => window.removeEventListener('goldenlook', listener);
      }
    });
  }

  function createSchedulerFacade(backend) {
    const host = backend || {};
    return Object.freeze({
      onFrame(handler) {
        if (typeof host.onFrame === 'function') return host.onFrame(handler);
        let active = true, frame = 0, previous = performance.now();
        const tick = (now) => { if (!active) return; handler((now - previous) / 1000, now); previous = now; frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
        return () => { active = false; cancelAnimationFrame(frame); };
      },
      onTick(handler) {
        if (typeof host.onTick !== 'function') throw new Error('Server tick backend required for authoritative simulation');
        return host.onTick(handler);
      }
    });
  }

  function cframeToTransform(cframe = {}) {
    return {
      position: { x:Number(cframe.X)||0, y:Number(cframe.Y)||0, z:Number(cframe.Z)||0 },
      rotationMatrix: [
        Number(cframe.R00 ?? 1), Number(cframe.R01 ?? 0), Number(cframe.R02 ?? 0),
        Number(cframe.R10 ?? 0), Number(cframe.R11 ?? 1), Number(cframe.R12 ?? 0),
        Number(cframe.R20 ?? 0), Number(cframe.R21 ?? 0), Number(cframe.R22 ?? 1)
      ]
    };
  }

  function createRuntime(backends = {}) {
    return Object.freeze({
      contract: 'WORLD_SERVER_ROBLOX_RUNTIME_V1',
      physics: backends.physics ? createPhysicsFacade(backends.physics) : null,
      network: backends.network ? createNetworkFacade(backends.network) : null,
      input: createInputFacade(),
      scheduler: createSchedulerFacade(backends.scheduler),
      transform: Object.freeze({ fromCFrame:cframeToTransform }),
      policy: Object.freeze({ executeLuau:false, authoritativeNetworking:true, reuseGoldenControls:true, reuseGoldenPhysics:true })
    });
  }

  window.WorldServerRobloxRuntime = Object.freeze({ createRuntime, createPhysicsFacade, createNetworkFacade, createInputFacade, createSchedulerFacade, cframeToTransform });
})();
