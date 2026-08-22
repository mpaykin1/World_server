'use strict';
(function () {
  const keys = new Set();
  const state = { contract:'AI3D_PLAYABLE_SCENE_V1', ready:false, playable:true, walkable:false, collisions:false, grounding:false, playerSpawn:false, mouseLook:true, pointerLocked:false, controls:['WASD','ARROW_KEYS','MOUSE_LOOK'], frames:0, lastReadyAt:null };
  const map = { KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'run',ShiftRight:'run',Space:'jump' };
  addEventListener('keydown', e => { if (map[e.code]) { keys.add(map[e.code]); if (e.code.startsWith('Arrow')) e.preventDefault(); } }, { passive:false });
  addEventListener('keyup', e => { if (map[e.code]) { keys.delete(map[e.code]); if (e.code.startsWith('Arrow')) e.preventDefault(); } }, { passive:false });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = !!document.pointerLockElement; });
  function input() { return { forward:keys.has('forward'), back:keys.has('back'), left:keys.has('left'), right:keys.has('right'), run:keys.has('run'), jump:keys.has('jump') }; }
  function reportReady(details={}) { Object.assign(state, details); state.ready = state.playable===true && state.walkable===true && state.collisions===true && state.grounding===true && state.playerSpawn===true && state.mouseLook===true; if (state.ready) state.lastReadyAt = new Date().toISOString(); return state.ready; }
  function frame() { state.frames++; }
  window.__AI3D_PLAYABLE_SCENE__ = { state, input, reportReady, frame, requestMouseLook(element=document.body) { if (element.requestPointerLock) return element.requestPointerLock(); } };
})();
