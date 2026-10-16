/* Melee animations: a pose curve per swing type. pose(w, t, step, fin) → { ang, push, active }
     ang    angle of the weapon relative to the aim, degrees (+ = up when facing right)
     push   how far the grip travels along the aim (world units)
     active the hit window
   trail: 'arc' (swept crescent) | 'streak' (straight speed line) | 'none'
   lunge: [normal, finisher] step forward; swing: whoosh weight for SFX.swing
   impactAt / impact(a): a moment in the swing that triggers an effect (the hammer's slam)
   hold: true + update(dt, w) + render(w, hand, draw, li): weapons driven by holding the button (flail) */
defineAnim('punch', {
  trail: 'streak', lunge: [2.2, 3.4], swing: 0.6,
  pose(w, t, step, fin) {
    if (fin) { const k = easeOut(span(t, 0.12, 0.55)); return { ang: lerp(-65, 70, k), push: 0.3 + 0.3 * Math.sin(k * Math.PI), active: t > 0.18 && t < 0.58 }; }
    const k = t < 0.2 ? -0.15 * span(t, 0, 0.2) : t < 0.45 ? lerp(-0.15, 0.6, easeOut(span(t, 0.2, 0.45))) : lerp(0.6, 0, easeInOut(span(t, 0.45, 1)));
    return { ang: step % 2 ? 8 : -8, push: k, active: t > 0.24 && t < 0.56 };
  },
});
defineAnim('jab', {
  trail: 'streak', lunge: [2.2, 3.4], swing: 1,
  pose(w, t) {
    const k = t < 0.2 ? -0.2 * span(t, 0, 0.2) : t < 0.42 ? lerp(-0.2, 0.75, easeOut(span(t, 0.2, 0.42))) : lerp(0.75, 0, easeInOut(span(t, 0.42, 1)));
    return { ang: 0, push: k, active: t > 0.24 && t < 0.55 };
  },
});
defineAnim('stab', {
  trail: 'streak', lunge: [2.2, 3.4], swing: 0.6,
  pose(w, t, step) {
    const k = t < 0.3 ? lerp(0, 0.55, easeOut(span(t, 0, 0.3))) : lerp(0.55, 0, easeInOut(span(t, 0.3, 1)));
    return { ang: [-14, 10, 0][step % 3], push: k, active: t > 0.12 && t < 0.5 };
  },
});
defineAnim('slash', {
  trail: 'arc', lunge: [2.2, 3.4], swing: 1,
  pose(w, t, step, fin) {
    let a0 = 115, a1 = -75;
    if (fin && w.fin && w.fin.over) { a0 = 165; a1 = -55; } else if (step % 2) { a0 = -75; a1 = 115; }
    const sg = Math.sign(a1 - a0);
    let ang;
    if (t < 0.18) ang = a0 - sg * 14 * easeOut(span(t, 0, 0.18));
    else if (t < 0.5) ang = lerp(a0 - sg * 14, a1, easeOut(span(t, 0.18, 0.5)));
    else ang = a1 + sg * 6 * easeInOut(span(t, 0.5, 1));
    return { ang, push: 0.12, active: t > 0.2 && t < 0.48 };
  },
});
defineAnim('chop', {
  trail: 'arc', lunge: [0.8, 0.8], swing: 2,
  pose(w, t) {
    let ang;
    if (t < 0.45) ang = lerp(70, 150, easeInOut(span(t, 0, 0.45)));
    else if (t < 0.58) ang = lerp(150, -55, easeIn(span(t, 0.45, 0.58)));
    else ang = -55 + 8 * easeInOut(span(t, 0.58, 1));
    return { ang, push: 0.1, active: t > 0.5 && t < 0.66 };
  },
});
defineAnim('slam', {
  trail: 'arc', lunge: [0.8, 0.8], swing: 2, trailWindow: [0.48, 0.64],
  impactAt: 0.6, impact: (a) => slamImpact(a),
  pose(w, t) {
    let ang;
    if (t < 0.5) ang = lerp(70, 172, easeInOut(span(t, 0, 0.5)));
    else if (t < 0.6) ang = lerp(172, -70, easeIn(span(t, 0.5, 0.6)));
    else ang = -70 + 6 * Math.sin(span(t, 0.6, 1) * Math.PI);
    return { ang, push: 0.15, active: false };
  },
});
defineAnim('thrust', {
  trail: 'streak', lunge: [4.5, 4.5], swing: 1,
  pose(w, t) {
    const k = t < 0.25 ? lerp(0, -0.4, easeOut(span(t, 0, 0.25))) : t < 0.42 ? lerp(-0.4, 1.15, easeOut(span(t, 0.25, 0.42))) : lerp(1.15, 0, easeInOut(span(t, 0.42, 1)));
    return { ang: 0, push: k, active: t > 0.28 && t < 0.52 };
  },
});
defineAnim('spin', {
  trail: 'arc', lunge: [0.8, 0.8], swing: 1.5,
  pose(w, t) {
    const k = easeInOut(span(t, 0.05, 0.9));
    return { ang: 90 - 420 * k, push: 0.15, active: t > 0.12 && t < 0.88 };
  },
});
// the flail is driven by holding the button: the ball circles on a spring-damped chain
defineAnim('flail', {
  trail: 'arc', hold: true,
  update: (dt, w) => updateFlail(dt, w),
  render: (w, hand, draw, li) => renderFlailHeld(w, hand, draw, li),
  meter: () => ({ fill: combat.flail.spin, text: combat.flail.on ? 'вращение' : 'держи атаку' }),
  pose: () => ({ ang: 60, push: 0, active: false }),
});
