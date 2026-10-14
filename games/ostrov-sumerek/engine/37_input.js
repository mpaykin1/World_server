/* -----------------------------------------------------------------------------
   14 · Input: keyboard, mouse orbit, touch stick, gamepad
----------------------------------------------------------------------------- */
const keys = new Set();
const pad = { mx: 0, my: 0, cx: 0, cy: 0, a: false, start: false, lb: false, rb: false, y: false };
const touch = { stickId: null, sx: 0, sy: 0, vx: 0, vy: 0, camId: null, cx: 0, cy: 0, ct: 0 };
const drag = { active: false, id: null, x: 0, y: 0, t: 0, vy: 0, vp: 0 };
// attack is one held button fed by four sources; pressed / released are edges the combat update consumes
const input = { atk: false, pressed: false, released: false, src: { mouse: false, key: false, touch: false, pad: false } };
function setAttack(src, on) {
  if (input.src[src] === on) return;
  input.src[src] = on;
  const any = input.src.mouse || input.src.key || input.src.touch || input.src.pad;
  if (any && !input.atk) input.pressed = true;
  if (!any && input.atk) input.released = true;
  input.atk = any;
}
function releaseAll() {
  for (const k in input.src) input.src[k] = false;
  if (input.atk) input.released = true;
  input.atk = false;
}
function onJumpPress() { if (G.state === 'play') { player.jumpBuf = 0.13; player.jumpHeld = true; } }
function onJumpRelease() { player.jumpHeld = false; }
const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const isAtkKey = (c) => c === 'KeyJ' || c === 'KeyK';
addEventListener('keydown', (e) => {
  const c = e.code;
  if (c === 'Space' || c.startsWith('Arrow') || (c === 'Tab' && G.state === 'play')) e.preventDefault();
  keys.add(c);
  if (isAtkKey(c) && G.state === 'play') setAttack('key', true);
  if (e.repeat) return;
  if (c === 'KeyM') toggleMute();
  else if (c === 'KeyF') toggleFullscreen();
  if (G.state === 'title' && (c === 'Enter' || c === 'Space' || c === 'NumpadEnter')) { startGame(); return; }
  if (G.state === 'play') {
    if (c === 'Space') onJumpPress();
    else if (c === 'Escape' || c === 'KeyP') setPaused(true);
    else if (c === 'KeyQ') cycleWeapon(-1);
    else if (c === 'KeyE' || c === 'Tab') cycleWeapon(e.shiftKey ? -1 : 1);
    else if (c === 'KeyR') startReload();
    else { const k = SLOT_KEYS.indexOf(c); if (k >= 0 && combat.arsenal[k]) equip(combat.arsenal[k]); }
  } else if (G.state === 'paused') {
    if (c === 'Escape' || c === 'KeyP') setPaused(false);
  } else if (!$('scrEnd').hidden && (c === 'Enter' || c === 'KeyR')) restart(false);
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') onJumpRelease();
  if (isAtkKey(e.code)) setAttack('key', keys.has('KeyJ') || keys.has('KeyK'));
});
addEventListener('blur', () => { keys.clear(); onJumpRelease(); releaseAll(); mouseMask = 0; drag.active = false; });

function orbitBy(dx, dy, sens, now) {
  const yv = -dx * sens, pv = dy * sens * 0.7;
  rig.yawT += yv;
  rig.pitchT = clamp(rig.pitchT + pv, 0.3, 1.15);
  const dt = Math.max(0.008, (now - drag.t) / 1000);
  drag.vy = lerp(drag.vy, yv / dt, 0.5); drag.vp = lerp(drag.vp, pv / dt, 0.5);
  drag.t = now;
}
// mouse: left button attacks, right / middle drag orbits the camera, the cursor aims (twin-stick style)
let mouseMask = 0;
function mouseButtons(e) {
  const m = e.buttons | 0, cam = (m & 6) !== 0, wasCam = (mouseMask & 6) !== 0;
  setAttack('mouse', (m & 1) !== 0 && G.state === 'play');
  if (cam && !wasCam) { drag.active = true; drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.t = e.timeStamp; drag.vy = drag.vp = 0; }
  else if (!cam && wasCam && drag.active) { drag.active = false; rig.spin = clamp(drag.vy, -3, 3); rig.pspin = clamp(drag.vp, -1.5, 1.5); }
  mouseMask = m;
}
function cursorAim(e) { aim.cx = e.clientX; aim.cy = e.clientY; aim.cursorT = 3.5; }
canvas.addEventListener('pointerdown', (e) => {
  if (G.state === 'title' && e.pointerType === 'touch') return;
  if (e.pointerType === 'touch' && G.state === 'play') {
    if (e.clientX < innerWidth * 0.5 && touch.stickId === null) {
      touch.stickId = e.pointerId; touch.sx = e.clientX; touch.sy = e.clientY; touch.vx = touch.vy = 0;
      const st = $('stick'); st.style.left = `${e.clientX}px`; st.style.top = `${e.clientY}px`; st.classList.add('on');
      $('knob').style.transform = 'translate(0px, 0px)';
    } else if (touch.camId === null) {
      touch.camId = e.pointerId; touch.cx = e.clientX; touch.cy = e.clientY; drag.t = e.timeStamp; drag.vy = drag.vp = 0;
    }
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.pointerType !== 'touch') {
    cursorAim(e);
    mouseButtons(e);
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === touch.stickId) {
    let dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
    const L = Math.hypot(dx, dy), R = 56;
    if (L > R) { dx *= R / L; dy *= R / L; }
    touch.vx = dx / R; touch.vy = dy / R;
    $('knob').style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === touch.camId) {
    orbitBy(e.clientX - touch.cx, e.clientY - touch.cy, 0.008, e.timeStamp);
    touch.cx = e.clientX; touch.cy = e.clientY;
  } else if (e.pointerType !== 'touch') {
    if ((e.buttons | 0) !== mouseMask) mouseButtons(e);      // chorded buttons arrive as moves
    if (drag.active && e.pointerId === drag.id) {
      orbitBy(e.clientX - drag.x, e.clientY - drag.y, 0.006, e.timeStamp);
      drag.x = e.clientX; drag.y = e.clientY;
    } else cursorAim(e);
  }
});
function endPointer(e) {
  if (e.pointerId === touch.stickId) { touch.stickId = null; touch.vx = touch.vy = 0; $('stick').classList.remove('on'); }
  else if (e.pointerId === touch.camId) { touch.camId = null; rig.spin = clamp(drag.vy, -3, 3); rig.pspin = clamp(drag.vp, -1.5, 1.5); }
  else if (e.pointerType !== 'touch') mouseButtons(e.type === 'pointercancel' ? { buttons: 0, pointerId: e.pointerId } : e);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.distT = clamp(rig.distT * (1 + Math.sign(e.deltaY) * 0.09), 5.5, 20);
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const jumpBtn = $('btnJump');
jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); onJumpPress(); });
jumpBtn.addEventListener('pointerup', onJumpRelease);
jumpBtn.addEventListener('pointercancel', onJumpRelease);
jumpBtn.addEventListener('pointerleave', onJumpRelease);
const atkBtn = $('btnAtk');
atkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); try { atkBtn.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ } if (G.state === 'play') setAttack('touch', true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) atkBtn.addEventListener(ev, () => setAttack('touch', false));
$('btnSwap').addEventListener('pointerdown', (e) => { e.preventDefault(); if (G.state === 'play') cycleWeapon(1); });
let padOk = !!navigator.getGamepads;
function pollPad() {
  if (!padOk) return;
  let pads = null;
  try { pads = navigator.getGamepads(); } catch (e) { padOk = false; return; }   // blocked by the frame's permissions policy
  let gp = null;
  if (pads) for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { pad.mx = pad.my = pad.cx = pad.cy = 0; setAttack('pad', false); return; }
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  pad.mx = dz(gp.axes[0] || 0); pad.my = dz(gp.axes[1] || 0); pad.cx = dz(gp.axes[2] || 0); pad.cy = dz(gp.axes[3] || 0);
  const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const a = btn(0), st = btn(9), lb = btn(4), rb = btn(5), y = btn(3);
  if (a && !pad.a) { if (G.state === 'title') startGame(); else onJumpPress(); }
  if (!a && pad.a) onJumpRelease();
  setAttack('pad', (btn(2) || btn(7)) && G.state === 'play');       // X or right trigger
  if (G.state === 'play') {
    if (lb && !pad.lb) cycleWeapon(-1);
    if (rb && !pad.rb) cycleWeapon(1);
    if (y && !pad.y) startReload();
  }
  if (st && !pad.start) {
    if (G.state === 'title') startGame();
    else if (G.state === 'play') setPaused(true);
    else if (G.state === 'paused') setPaused(false);
    else if (!$('scrEnd').hidden) restart(false);
  }
  pad.a = a; pad.start = st; pad.lb = lb; pad.rb = rb; pad.y = y;
}
