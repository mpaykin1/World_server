'use strict';
// SI-units collision solver. Requires authored geometry; no default infinite floor.
// Compatible with GameGoldenPhysics: swept movement + finite step candidates.
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(name + ' must be an object');
  return value;
}
function finite(value, name, min = -Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min)
    throw new TypeError(name + ' must be finite and >= ' + min);
  return value;
}
function vector(value, name) {
  object(value, name);
  return { x: finite(value.x, name + '.x'), y: finite(value.y, name + '.y'),
    z: finite(value.z, name + '.z') };
}
function createPhysicsConfig(ruleSet) {
  object(ruleSet, 'ruleSet');
  const world = object(ruleSet.world, 'ruleSet.world');
  const gravity = finite(world.gravity, 'ruleSet.world.gravity', 0.000001);
  const maxStep = finite(world.maxStepMeters, 'ruleSet.world.maxStepMeters', 0);
  if (maxStep > 2) throw new TypeError('ruleSet.world.maxStepMeters must be <= 2');
  if (!Array.isArray(world.solidLayers) || !world.solidLayers.length ||
      world.solidLayers.some(s => typeof s !== 'string' || !s.trim()))
    throw new TypeError('ruleSet.world.solidLayers must be nonempty');
  const bodyRadius = finite(world.bodyRadius, 'ruleSet.world.bodyRadius', 0.000001);
  const bodyHeight = finite(world.bodyHeight, 'ruleSet.world.bodyHeight', 0.000001);
  if (maxStep > bodyHeight) throw new TypeError('step height cannot exceed body height');
  return {
    gravity, step_heights: maxStep ? [maxStep / 2, maxStep] : [0],
    maxStepMeters: maxStep, bodyRadius, bodyHeight, units: 'SI',
    collisions: { solid: true, layers: [...new Set(world.solidLayers)] },
    destruction: world.destruction === true ? { enabled: true } : null
  };
}
function validateSolids(boxes, config) {
  if (!Array.isArray(boxes) || boxes.length > 5000)
    throw new TypeError('world.solids must be an array <= 5000');
  return boxes.map((box, i) => {
    object(box, 'world.solids[' + i + ']');
    const min = vector(box.min, 'world.solids[' + i + '].min');
    const max = vector(box.max, 'world.solids[' + i + '].max');
    if (!['x', 'y', 'z'].every(a => max[a] > min[a]))
      throw new TypeError('world.solids[' + i + '] must have positive volume');
    if (!config.collisions.layers.includes(box.layer))
      throw new TypeError('world.solids[' + i + '].layer is not solid');
    return { min, max, layer: box.layer };
  });
}
function overlaps(a, b, low, high) { return a < high && b > low; }
function collides(pos, config, boxes) {
  const r = config.bodyRadius, h = config.bodyHeight;
  return boxes.some(b => overlaps(pos.x - r, pos.x + r, b.min.x, b.max.x) &&
    overlaps(pos.y, pos.y + h, b.min.y, b.max.y) &&
    overlaps(pos.z - r, pos.z + r, b.min.z, b.max.z));
}
function moveHorizontal(pos, axis, delta, config, boxes) {
  if (!delta) return { pos, blocked: false, stepped: false };
  const target = { ...pos, [axis]: pos[axis] + delta };
  const other = axis === 'x' ? 'z' : 'x', r = config.bodyRadius;
  const obstacles = boxes.filter(b =>
    overlaps(pos[other] - r, pos[other] + r, b.min[other], b.max[other]) &&
    overlaps(pos.y, pos.y + config.bodyHeight, b.min.y, b.max.y) &&
    (delta > 0 ?
      pos[axis] + r <= b.min[axis] && target[axis] + r > b.min[axis] :
      pos[axis] - r >= b.max[axis] && target[axis] - r < b.max[axis]))
    .sort((a, b) => delta > 0 ? a.min[axis] - b.min[axis] : b.max[axis] - a.max[axis]);
  let moving = target, stepped = false;
  for (const block of obstacles) {
    const height = block.max.y - moving.y;
    if (height > 0 && height <= config.maxStepMeters) {
      const elevated = { ...moving, y: block.max.y };
      if (!collides(elevated, config, boxes)) {
        moving = elevated; stepped = true; continue;
      }
    }
    moving = { ...moving, [axis]: delta > 0 ? block.min[axis] - r : block.max[axis] + r };
    return { pos: moving, blocked: true, stepped };
  }
  if (collides(moving, config, boxes)) return { pos, blocked: true, stepped: false };
  return { pos: moving, blocked: false, stepped };
}
function simulatePhysicsStep(config, world, state, dt) {
  object(config, 'config');
  object(world, 'world');
  object(state, 'state');
  finite(dt, 'dt', 0.000001);
  if (dt > 0.25) throw new TypeError('dt must be <= 0.25 seconds');
  const boxes = validateSolids(world.solids, config);
  let pos = vector(state.position, 'state.position');
  const velocity = vector(state.velocity, 'state.velocity');
  if (collides(pos, config, boxes)) throw new Error('Initial body intersects a solid obstacle');
  const maxDistance = Math.max(Math.abs(velocity.x), Math.abs(velocity.z), Math.abs(velocity.y)) * dt;
  const substeps = Math.max(1, Math.ceil(maxDistance / 0.08), Math.ceil(dt / (1 / 120)));
  if (substeps > 1000) throw new RangeError('Movement exceeds safe physics budget');
  const h = dt / substeps, contacts = { wall: false, step: false, ground: false, ceiling: false };
  for (let i = 0; i < substeps; i++) {
    for (const axis of ['x', 'z']) {
      const step = moveHorizontal(pos, axis, velocity[axis] * h, config, boxes);
      pos = step.pos;
      contacts.wall ||= step.blocked;
      contacts.step ||= step.stepped;
      if (step.blocked) velocity[axis] = 0;
    }
    velocity.y -= config.gravity * h;
    const oldY = pos.y, nextY = oldY + velocity.y * h;
    if (velocity.y <= 0) {
      const floors = boxes.filter(b =>
        overlaps(pos.x - config.bodyRadius, pos.x + config.bodyRadius, b.min.x, b.max.x) &&
        overlaps(pos.z - config.bodyRadius, pos.z + config.bodyRadius, b.min.z, b.max.z) &&
        oldY >= b.max.y - 1e-8 && nextY <= b.max.y);
      if (floors.length) {
        pos.y = Math.max(...floors.map(b => b.max.y));
        velocity.y = 0;
        contacts.ground = true;
      } else pos.y = nextY;
    } else {
      const ceilings = boxes.filter(b =>
        overlaps(pos.x - config.bodyRadius, pos.x + config.bodyRadius, b.min.x, b.max.x) &&
        overlaps(pos.z - config.bodyRadius, pos.z + config.bodyRadius, b.min.z, b.max.z) &&
        oldY + config.bodyHeight <= b.min.y &&
        nextY + config.bodyHeight >= b.min.y);
      if (ceilings.length) {
        pos.y = Math.min(...ceilings.map(b => b.min.y)) - config.bodyHeight;
        velocity.y = 0;
        contacts.ceiling = true;
      } else pos.y = nextY;
    }
  }
  return { position: pos, velocity, contacts, substeps };
}
function followCamera(position, target, damping) {
  const current = vector(position, 'camera.position');
  const desired = vector(target, 'camera.target');
  finite(damping, 'camera.damping', 0);
  if (damping > 1) throw new TypeError('camera.damping cannot exceed 1');
  return Object.fromEntries(['x', 'y', 'z'].map(a =>
    [a, current[a] + (desired[a] - current[a]) * damping]));
}
module.exports = { createPhysicsConfig, simulatePhysicsStep, followCamera };
