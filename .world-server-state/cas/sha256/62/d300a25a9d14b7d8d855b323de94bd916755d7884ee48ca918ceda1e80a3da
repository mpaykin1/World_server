import * as THREE from 'three';

const DEADZONE = 0.14;
function deadzone(v) {
  const a = Math.abs(v);
  if (a <= DEADZONE) return 0;
  return Math.sign(v) * Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
}

export class InputController {
  constructor({ canvas, moveZone, lookZone, jumpButton, stickKnob }) {
    this.canvas = canvas;
    this.moveZone = moveZone;
    this.lookZone = lookZone;
    this.jumpButton = jumpButton;
    this.stickKnob = stickKnob;
    this.keys = new Set();
    this.move = new THREE.Vector2();
    this.lookDelta = new THREE.Vector2();
    this.jumpQueued = false;
    this.enabled = false;
    this.isCoarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this._movePointerId = null;
    this._lookPointerId = null;
    this._moveOrigin = new THREE.Vector2();
    this._lastLook = new THREE.Vector2();
    this._gamepadJumpHeld = false;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
    }, { passive: false });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this._gamepadJumpHeld = false; });

    document.addEventListener('mousemove', e => {
      if (!this.enabled || this.isCoarse || document.pointerLockElement !== this.canvas) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });

    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.isCoarse && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });

    const onMoveDown = e => {
      if (!this.enabled || this._movePointerId !== null) return;
      this._movePointerId = e.pointerId;
      this.moveZone.setPointerCapture?.(e.pointerId);
      this._moveOrigin.set(e.clientX, e.clientY);
      this._updateMoveStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMoveMove = e => {
      if (e.pointerId !== this._movePointerId) return;
      this._updateMoveStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMoveEnd = e => {
      if (e.pointerId !== this._movePointerId) return;
      this._movePointerId = null;
      this.move.set(0, 0);
      this.stickKnob.style.transform = 'translate(0px, 0px)';
      e.preventDefault();
    };
    this.moveZone.addEventListener('pointerdown', onMoveDown, { passive: false });
    this.moveZone.addEventListener('pointermove', onMoveMove, { passive: false });
    this.moveZone.addEventListener('pointerup', onMoveEnd, { passive: false });
    this.moveZone.addEventListener('pointercancel', onMoveEnd, { passive: false });

    const onLookDown = e => {
      if (!this.enabled || this._lookPointerId !== null) return;
      this._lookPointerId = e.pointerId;
      this.lookZone.setPointerCapture?.(e.pointerId);
      this._lastLook.set(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onLookMove = e => {
      if (e.pointerId !== this._lookPointerId) return;
      this.lookDelta.x += e.clientX - this._lastLook.x;
      this.lookDelta.y += e.clientY - this._lastLook.y;
      this._lastLook.set(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onLookEnd = e => {
      if (e.pointerId === this._lookPointerId) this._lookPointerId = null;
      e.preventDefault();
    };
    this.lookZone.addEventListener('pointerdown', onLookDown, { passive: false });
    this.lookZone.addEventListener('pointermove', onLookMove, { passive: false });
    this.lookZone.addEventListener('pointerup', onLookEnd, { passive: false });
    this.lookZone.addEventListener('pointercancel', onLookEnd, { passive: false });

    this.jumpButton.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this.jumpQueued = true;
      e.preventDefault();
    }, { passive: false });
  }

  _updateMoveStick(x, y) {
    const max = 46;
    const dx = x - this._moveOrigin.x, dy = y - this._moveOrigin.y;
    const len = Math.hypot(dx, dy) || 1, scale = Math.min(1, max / len);
    const sx = dx * scale, sy = dy * scale;
    this.stickKnob.style.transform = `translate(${sx}px, ${sy}px)`;
    this.move.set(sx / max, -sy / max);
    if (this.move.length() < 0.12) this.move.set(0, 0);
    else if (this.move.length() > 1) this.move.normalize();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear(); this.move.set(0,0); this.lookDelta.set(0,0); this.jumpQueued = false; this._gamepadJumpHeld = false;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }
  }

  requestPointerLock() { if (!this.isCoarse) this.canvas.requestPointerLock?.(); }

  _sampleGamepad() {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find(Boolean);
    if (!gp) return { x:0, z:0, lookX:0, lookY:0, jump:false };
    const x = deadzone(gp.axes?.[0] || 0);
    const z = -deadzone(gp.axes?.[1] || 0);
    // Scale to mouse-like deltas per frame; player controller applies same sensitivity.
    const lookX = deadzone(gp.axes?.[2] || 0) * 14;
    const lookY = deadzone(gp.axes?.[3] || 0) * 14;
    const held = Boolean(gp.buttons?.[0]?.pressed);
    const jump = held && !this._gamepadJumpHeld;
    this._gamepadJumpHeld = held;
    return { x, z, lookX, lookY, jump };
  }

  sample() {
    let x = this.move.x, z = this.move.y;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    const gp = this._sampleGamepad();
    x += gp.x; z += gp.z;
    const m = new THREE.Vector2(x, z);
    if (m.length() > 1) m.normalize();

    const result = {
      moveX: m.x, moveForward: m.y,
      lookX: this.lookDelta.x + gp.lookX,
      lookY: this.lookDelta.y + gp.lookY,
      jump: this.jumpQueued || gp.jump,
    };
    this.lookDelta.set(0,0); this.jumpQueued = false;
    return result;
  }
}
