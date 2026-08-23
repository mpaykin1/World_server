'use strict';
(function () {
  if (window.__GOLDEN_STANDARD_RUNTIME_V2__) return;

  const keys = new Set();
  const map = Object.freeze({
    KeyW:'forward', ArrowUp:'forward',
    KeyS:'back', ArrowDown:'back',
    KeyA:'left', ArrowLeft:'left',
    KeyD:'right', ArrowRight:'right',
    ShiftLeft:'run', ShiftRight:'run',
    Space:'jump'
  });

  const state = {
    contract:'WORLD_SERVER_GOLDEN_STANDARD_V2',
    ready:false,
    playable:true,
    walkable:false,
    collisions:false,
    grounding:false,
    playerSpawn:false,
    mouseLook:true,
    touchControls:false,
    mobileReady:false,
    directionConvention:'camera-forward-screen-right-v2',
    controls:['WASD','ARROW_KEYS','MOUSE_LOOK','TOUCH_JOYSTICK','TOUCH_LOOK'],
    frames:0,
    lastReadyAt:null
  };

  function emitKey(code, down) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: code, bubbles:true, cancelable:true
    }));
  }

  addEventListener('keydown', e => {
    const action = map[e.code];
    if (!action) return;
    keys.add(action);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }, { passive:false });

  addEventListener('keyup', e => {
    const action = map[e.code];
    if (!action) return;
    keys.delete(action);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }, { passive:false });

  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = !!document.pointerLockElement;
  });

  function input() {
    return {
      forward:keys.has('forward'),
      back:keys.has('back'),
      left:keys.has('left'),
      right:keys.has('right'),
      run:keys.has('run'),
      jump:keys.has('jump')
    };
  }

  // Universal basis from the ACTUAL camera-forward vector projected on XZ.
  // right is screen-right, never a hand-written per-game sign convention.
  function basisFromForward(fx, fz) {
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    return {
      forward:{ x:fx, z:fz },
      right:{ x:-fz, z:fx }
    };
  }

  function reportReady(details={}) {
    Object.assign(state, details);
    state.ready =
      state.playable === true &&
      state.walkable === true &&
      state.collisions === true &&
      state.grounding === true &&
      state.playerSpawn === true &&
      state.mouseLook === true &&
      (!matchMedia('(pointer:coarse)').matches || state.touchControls === true);
    if (state.ready) state.lastReadyAt = new Date().toISOString();
    return state.ready;
  }

  function frame() { state.frames++; }

  function installMobileControls() {
    if (!matchMedia('(pointer:coarse)').matches) return;
    if (document.getElementById('mobileControls') || document.getElementById('goldenMobileControls')) {
      state.touchControls = true;
      state.mobileReady = true;
      return;
    }

    const style = document.createElement('style');
    style.textContent = `
      #goldenMobileControls{position:fixed;inset:0;z-index:2147483000;pointer-events:none;touch-action:none}
      #goldenMovePad{position:absolute;left:max(18px,env(safe-area-inset-left));bottom:max(28px,env(safe-area-inset-bottom));width:136px;height:136px;border-radius:50%;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(5px);pointer-events:auto}
      #goldenMoveKnob{position:absolute;left:43px;top:43px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.46);border:1px solid rgba(255,255,255,.7);box-shadow:0 4px 18px rgba(0,0,0,.28)}
      #goldenLookZone{position:absolute;right:0;top:0;width:58%;height:78%;pointer-events:auto;touch-action:none}
      #goldenJump{position:absolute;right:max(20px,env(safe-area-inset-right));bottom:max(44px,env(safe-area-inset-bottom));width:68px;height:68px;border-radius:50%;pointer-events:auto;border:1px solid rgba(255,255,255,.38);background:rgba(0,0,0,.36);color:#fff;font:800 11px system-ui;backdrop-filter:blur(5px)}
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'goldenMobileControls';
    root.innerHTML =
      '<div id="goldenLookZone"></div>' +
      '<div id="goldenMovePad"><div id="goldenMoveKnob"></div></div>' +
      '<button id="goldenJump" type="button">ПРЫЖОК</button>';
    document.body.appendChild(root);

    const pad = root.querySelector('#goldenMovePad');
    const knob = root.querySelector('#goldenMoveKnob');
    const look = root.querySelector('#goldenLookZone');
    const jump = root.querySelector('#goldenJump');
    let moveId = null, lookId = null, lastLook = null;
    let activeCodes = new Set();

    function setCodes(next) {
      for (const c of activeCodes) if (!next.has(c)) emitKey(c, false);
      for (const c of next) if (!activeCodes.has(c)) emitKey(c, true);
      activeCodes = next;
    }

    function updateMove(e) {
      const r = pad.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const max = 48, mag = Math.min(max, Math.hypot(dx,dy));
      const ang = Math.atan2(dy,dx);
      const nx = Math.cos(ang) * (mag/max);
      const ny = Math.sin(ang) * (mag/max);
      knob.style.transform = `translate(${nx*40}px,${ny*40}px)`;
      const next = new Set();
      if (ny < -.24) next.add('KeyW');
      if (ny >  .24) next.add('KeyS');
      if (nx < -.24) next.add('KeyA');
      if (nx >  .24) next.add('KeyD');
      setCodes(next);
    }

    pad.addEventListener('pointerdown', e => {
      moveId = e.pointerId;
      pad.setPointerCapture?.(moveId);
      updateMove(e);
      e.preventDefault();
    }, {passive:false});
    pad.addEventListener('pointermove', e => {
      if (e.pointerId !== moveId) return;
      updateMove(e); e.preventDefault();
    }, {passive:false});
    const endMove = e => {
      if (e.pointerId !== moveId) return;
      moveId = null; setCodes(new Set()); knob.style.transform = '';
      e.preventDefault();
    };
    pad.addEventListener('pointerup', endMove, {passive:false});
    pad.addEventListener('pointercancel', endMove, {passive:false});

    look.addEventListener('pointerdown', e => {
      lookId = e.pointerId;
      lastLook = {x:e.clientX,y:e.clientY};
      look.setPointerCapture?.(lookId);
      e.preventDefault();
    }, {passive:false});
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== lookId || !lastLook) return;
      const dx = e.clientX-lastLook.x, dy=e.clientY-lastLook.y;
      lastLook={x:e.clientX,y:e.clientY};
      window.dispatchEvent(new CustomEvent('goldenlook',{detail:{dx,dy}}));
      e.preventDefault();
    }, {passive:false});
    const endLook = e => {
      if (e.pointerId !== lookId) return;
      lookId=null; lastLook=null; e.preventDefault();
    };
    look.addEventListener('pointerup', endLook, {passive:false});
    look.addEventListener('pointercancel', endLook, {passive:false});

    jump.addEventListener('pointerdown', e => {
      emitKey('Space',true); e.preventDefault();
    }, {passive:false});
    jump.addEventListener('pointerup', e => {
      emitKey('Space',false); e.preventDefault();
    }, {passive:false});
    jump.addEventListener('pointercancel', e => {
      emitKey('Space',false); e.preventDefault();
    }, {passive:false});

    state.touchControls = true;
    state.mobileReady = true;
  }

  const api = {
    state, input, reportReady, frame, basisFromForward,
    requestMouseLook(element=document.body) {
      if (element.requestPointerLock) return element.requestPointerLock();
    },
    installMobileControls
  };

  window.GameGoldenStandard = api;
  window.__AI3D_PLAYABLE_SCENE__ = api; // backward compatible contract
  window.__GOLDEN_STANDARD_RUNTIME_V2__ = true;

  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', installMobileControls, {once:true});
  } else {
    installMobileControls();
  }
})();
