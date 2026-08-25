import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { sweepPlayerAgainstDynamicMesh } from './dynamic-swept-collision.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const tempBox = new THREE.Box3();
const tempSegment = new THREE.Line3();
const triPoint = new THREE.Vector3();
const capsulePoint = new THREE.Vector3();
const correction = new THREE.Vector3();
const normal = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const dynPlayerBox = new THREE.Box3();
const dynPlayerCenter = new THREE.Vector3();
const dynBoxCenter = new THREE.Vector3();
const dynPush = new THREE.Vector3();

export class PlayerController {
  constructor({ camera, collider, spawn, config, worldBounds }) {
    this.camera = camera;
    this.collider = collider;
    this.config = config;
    this.worldBounds = worldBounds;
    this.position = spawn.clone();
    this.lastSafePosition = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.bodyYaw = 0;
    this._wasGrounded = false;
    this._fixedDt = 1 / 60;
    this._accumulator = 0;
    this._latestInput = ZERO_INPUT;
    this._jumpGrace = 0;
    this.dynamicColliders = [];
    this._debug = { collisions: 0, substeps: 0, stepUps: 0, groundSnaps: 0, slopeDeg: 0 };
    this._buildDebugBody();
    this._updateCamera();
  }

  _buildDebugBody() {
    const group = new THREE.Group();
    group.name = '__PLAYER_DEBUG_BODY__';
    const mat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.75, metalness: 0.05 });
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 1 });
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(this.config.radius * 0.92, Math.max(0.2, this.config.height - this.config.radius * 2.3), 5, 10),
      mat,
    );
    torso.position.y = this.config.height * 0.5;
    const footGeo = new THREE.BoxGeometry(this.config.radius * 0.65, 0.12, this.config.radius * 1.15);
    const left = new THREE.Mesh(footGeo, footMat), right = new THREE.Mesh(footGeo, footMat);
    left.position.set(-this.config.radius * 0.42, 0.08, -this.config.radius * 0.22);
    right.position.set(this.config.radius * 0.42, 0.08, -this.config.radius * 0.22);
    group.add(torso, left, right);
    group.visible = new URLSearchParams(location.search).get('debugPlayer') === '1';
    this.debugBody = group;
  }

  addToScene(scene) { scene.add(this.debugBody); }

  setInput(input) {
    this._latestInput = input || ZERO_INPUT;
    const sensitivity = 0.00225;
    this.yaw += (input?.lookX || 0) * sensitivity;
    this.pitch -= (input?.lookY || 0) * sensitivity;
    const maxPitch = THREE.MathUtils.degToRad(89);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -maxPitch, maxPitch);
  }

  update(frameDt) {
    this._accumulator = Math.min(this._accumulator + Math.min(frameDt, 0.1), 0.25);
    let steps = 0;
    while (this._accumulator >= this._fixedDt && steps < 8) {
      this._step(this._fixedDt, this._latestInput || ZERO_INPUT);
      this._accumulator -= this._fixedDt;
      steps++;
    }
    this._debug.substeps = steps;
    this._updateCamera();
    this._updateDebugBody();
  }

  _step(dt, input) {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const desired = new THREE.Vector3()
      .addScaledVector(forward, input.moveForward || 0)
      .addScaledVector(right, input.moveX || 0);
    if (desired.lengthSq() > 1) desired.normalize();

    const control = this.grounded ? 1 : this.config.airControl;
    const accel = this.grounded ? 32 : 10 * control;
    this.velocity.x = moveTowards(this.velocity.x, desired.x * this.config.moveSpeed, accel * dt);
    this.velocity.z = moveTowards(this.velocity.z, desired.z * this.config.moveSpeed, accel * dt);

    if (desired.lengthSq() > 0.001) this.bodyYaw = Math.atan2(desired.x, -desired.z);

    if (input.jump && this.grounded) {
      // Invariant PHY-003: the jump impulse only touches world Y velocity.
      this.velocity.y = this.config.jumpSpeed;
      this.grounded = false;
      this._jumpGrace = 0.14;
    }
    this._jumpGrace = Math.max(0, this._jumpGrace - dt);

    this.velocity.y = Math.max(this.velocity.y - this.config.gravity * dt, -this.config.maxFallSpeed);
    const before = this.position.clone();
    const beforeGrounded = this.grounded;
    const requested = this.position.clone().addScaledVector(this.velocity, dt);
    this.position.copy(requested);

    this._wasGrounded = beforeGrounded;
    this.grounded = false;
    const horizontalIntent = desired.lengthSq() > 0.001;
    const baseResult = this._resolveCapsuleCollision();

    if (horizontalIntent && beforeGrounded && baseResult.horizontalBlocked && this._jumpGrace <= 0) {
      this._attemptStepUp(before, requested, baseResult);
    }

    if (!this.grounded && beforeGrounded && this._jumpGrace <= 0 && this.velocity.y <= 0.5) {
      this._tryGroundSnap();
    }

    this._previousStepPosition = before.clone();
    this._resolveDynamicCollisions(before);

    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (this.grounded) this.lastSafePosition.copy(this.position);

    if (this.position.y < this.worldBounds.min.y - this.config.fallResetMargin || !Number.isFinite(this.position.y)) this.reset();
  }

  _capsuleSegmentAt(feet, out = new THREE.Line3()) {
    const r = this.config.radius;
    out.start.copy(feet).addScaledVector(UP, r);
    out.end.copy(feet).addScaledVector(UP, this.config.height - r);
    return out;
  }

  _capsuleFreeAt(feet, margin = 0.015) {
    const radius = this.config.radius;
    this._capsuleSegmentAt(feet, tempSegment);
    tempBox.makeEmpty().expandByPoint(tempSegment.start).expandByPoint(tempSegment.end);
    tempBox.min.addScalar(-radius + margin); tempBox.max.addScalar(radius - margin);
    let blocked = false;
    this.collider.geometry.boundsTree.shapecast({
      intersectsBounds: box => !blocked && box.intersectsBox(tempBox),
      intersectsTriangle: tri => {
        if (blocked) return true;
        const d = tri.closestPointToSegment(tempSegment, triPoint, capsulePoint);
        if (d < radius - margin) { blocked = true; return true; }
        return false;
      },
    });
    return !blocked;
  }

  _resolveCapsuleCollision() {
    const radius = this.config.radius;
    this._capsuleSegmentAt(this.position, tempSegment);
    tempBox.makeEmpty().expandByPoint(tempSegment.start).expandByPoint(tempSegment.end);
    tempBox.min.addScalar(-radius); tempBox.max.addScalar(radius);

    let collisions = 0, groundNormalY = -1, horizontalBlocked = false;
    this.collider.geometry.boundsTree.shapecast({
      intersectsBounds: box => box.intersectsBox(tempBox),
      intersectsTriangle: tri => {
        const distance = tri.closestPointToSegment(tempSegment, triPoint, capsulePoint);
        if (distance >= radius) return false;
        collisions++;
        const depth = radius - distance;
        normal.subVectors(capsulePoint, triPoint);
        if (normal.lengthSq() < 1e-12 && tri instanceof ExtendedTriangle) tri.getNormal(normal);
        if (normal.lengthSq() < 1e-12) normal.copy(UP);
        normal.normalize();
        if (Math.abs(normal.y) < 0.55) horizontalBlocked = true;
        groundNormalY = Math.max(groundNormalY, normal.y);
        tempSegment.start.addScaledVector(normal, depth);
        tempSegment.end.addScaledVector(normal, depth);
        return false;
      },
    });

    const resolvedFeet = tempSegment.start.clone().addScaledVector(UP, -radius);
    correction.subVectors(resolvedFeet, this.position);
    this.position.copy(resolvedFeet);
    this._debug.collisions = collisions;

    if (correction.lengthSq() > 1e-12) {
      const n = correction.clone().normalize();
      const minGroundY = Math.cos(THREE.MathUtils.degToRad(this.config.maxSlopeDeg ?? 50));
      if (groundNormalY >= minGroundY && this.velocity.y <= 0.5) {
        this.grounded = true;
        this._debug.slopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(groundNormalY, -1, 1)));
      }
      const into = this.velocity.dot(n);
      if (into < 0) this.velocity.addScaledVector(n, -into);
    }
    return { collisions, horizontalBlocked, correction: correction.clone(), groundNormalY };
  }

  _attemptStepUp(before, requested, baseResult) {
    const stepHeight = Math.min(this.config.stepHeight ?? 0.38, 0.45);
    if (stepHeight <= 0) return false;
    const basePos = this.position.clone();
    const baseHorizontal = horizontalDistanceSq(before, basePos);
    const candidate = requested.clone(); candidate.y = before.y + stepHeight;
    if (!this._capsuleFreeAt(candidate, 0.02)) return false;

    this.position.copy(candidate);
    this.grounded = false;
    const stepResult = this._resolveCapsuleCollision();
    const steppedHorizontal = horizontalDistanceSq(before, this.position);
    if (steppedHorizontal <= baseHorizontal + 1e-5) {
      this.position.copy(basePos); this.grounded = false;
      return false;
    }

    // Find support below the stepped capsule; do not allow stepping into mid-air.
    const hit = this._raycastDown(this.position.clone().addScaledVector(UP, 0.08), stepHeight + (this.config.groundSnap ?? 0.24) + 0.12);
    if (!hit || !this._isWalkableNormal(hit.face?.normal)) {
      this.position.copy(basePos); this.grounded = false;
      return false;
    }
    const feet = hit.point.clone().addScaledVector(UP, 0.025);
    if (!this._capsuleFreeAt(feet, 0.02)) {
      this.position.copy(basePos); this.grounded = false;
      return false;
    }
    this.position.copy(feet); this.grounded = true; this.velocity.y = Math.max(0, this.velocity.y);
    this._debug.stepUps++;
    return true;
  }

  _raycastDown(origin, maxDistance) {
    const ray = new THREE.Ray(origin, DOWN);
    const hit = this.collider.geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);
    if (!hit || hit.distance > maxDistance) return null;
    return hit;
  }

  _isWalkableNormal(n) {
    if (!n) return true;
    const minY = Math.cos(THREE.MathUtils.degToRad(this.config.maxSlopeDeg ?? 50));
    return n.y >= minY;
  }

  _tryGroundSnap() {
    const snap = this.config.groundSnap ?? 0.24;
    const origin = this.position.clone().addScaledVector(UP, 0.06);
    const hit = this._raycastDown(origin, snap + 0.08);
    if (!hit || !this._isWalkableNormal(hit.face?.normal)) return false;
    const feet = hit.point.clone().addScaledVector(UP, 0.025);
    if (feet.y > this.position.y + 0.08 || !this._capsuleFreeAt(feet, 0.02)) return false;
    this.position.copy(feet); this.grounded = true; this.velocity.y = 0; this._debug.groundSnaps++;
    return true;
  }

  _updateCamera() {
    this.camera.position.set(this.position.x, this.position.y + this.config.eyeHeight, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0); // CAM-001: roll is invariantly zero.
    this.camera.updateMatrixWorld(true);
  }

  _updateDebugBody() {
    this.debugBody.position.copy(this.position);
    this.debugBody.rotation.set(0, this.bodyYaw, 0);
  }


  setDynamicColliders(colliders = []) {
    this.dynamicColliders = Array.isArray(colliders) ? colliders : [];
  }

  resolveDynamicCollisions() { return this._resolveDynamicCollisions(this._previousStepPosition||this.position); }

  _resolveDynamicCollisions(before=this.position) {
    if (!this.dynamicColliders?.length) return 0;
    const r = this.config.radius, h = this.config.height;
    let hits = 0;
    for (const c of this.dynamicColliders) {
      if(c?.kind==='mesh-bvh'){
        const sweep=sweepPlayerAgainstDynamicMesh(c,before,this.position,this);
        if(sweep?.hit){
          this.position.copy(sweep.position);hits++;const wn=sweep.normal;const into=this.velocity.dot(wn);if(into<0)this.velocity.addScaledVector(wn,-into);
          const minGroundY=Math.cos(THREE.MathUtils.degToRad(this.config.maxSlopeDeg??50));if(wn.y>=minGroundY){this.grounded=true;if(this.velocity.y<0)this.velocity.y=0;}
          continue;
        }
      }
      const box = c?.box || c?.bounds;
      if (!box?.isBox3) continue;
      dynPlayerBox.min.set(this.position.x-r, this.position.y+0.01, this.position.z-r);
      dynPlayerBox.max.set(this.position.x+r, this.position.y+h, this.position.z+r);
      if (!dynPlayerBox.intersectsBox(box)) continue;
      const ox = Math.min(dynPlayerBox.max.x,box.max.x)-Math.max(dynPlayerBox.min.x,box.min.x);
      const oy = Math.min(dynPlayerBox.max.y,box.max.y)-Math.max(dynPlayerBox.min.y,box.min.y);
      const oz = Math.min(dynPlayerBox.max.z,box.max.z)-Math.max(dynPlayerBox.min.z,box.min.z);
      if (ox<=1e-5||oy<=1e-5||oz<=1e-5) continue;
      dynPlayerBox.getCenter(dynPlayerCenter); box.getCenter(dynBoxCenter); dynPush.set(0,0,0);
      if (oy<=ox && oy<=oz) dynPush.y = (dynPlayerCenter.y>=dynBoxCenter.y ? oy : -oy) + (dynPlayerCenter.y>=dynBoxCenter.y ? 0.002 : -0.002);
      else if (ox<=oz) dynPush.x = (dynPlayerCenter.x>=dynBoxCenter.x ? ox : -ox) + (dynPlayerCenter.x>=dynBoxCenter.x ? 0.002 : -0.002);
      else dynPush.z = (dynPlayerCenter.z>=dynBoxCenter.z ? oz : -oz) + (dynPlayerCenter.z>=dynBoxCenter.z ? 0.002 : -0.002);
      this.position.add(dynPush); hits++;
      if (dynPush.y>0) { this.grounded=true; if(this.velocity.y<0)this.velocity.y=0; }
      if (dynPush.x && Math.sign(this.velocity.x)!==Math.sign(dynPush.x)) this.velocity.x=0;
      if (dynPush.z && Math.sign(this.velocity.z)!==Math.sign(dynPush.z)) this.velocity.z=0;
      if (dynPush.y<0 && this.velocity.y>0) this.velocity.y=0;
    }
    this._debug.dynamicCollisions = hits;
    return hits;
  }

  applyExternalDisplacement(delta, { carrySafePosition=false } = {}) {
    if (!delta || !Number.isFinite(delta.x) || !Number.isFinite(delta.y) || !Number.isFinite(delta.z)) return false;
    this.position.add(delta);
    if (carrySafePosition) this.lastSafePosition.add(delta);
    return true;
  }

  getFeetForward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.bodyYaw), 0, -Math.cos(this.bodyYaw)).normalize();
  }

  getActionFrame() {
    // Shared contract used by sword/gun/shield systems: attacks cannot disagree with feet direction.
    return { feetForward: this.getFeetForward(new THREE.Vector3()), up: UP.clone(), bodyYaw: this.bodyYaw };
  }

  reset() {
    this.position.copy(this.lastSafePosition); this.position.y += 0.15;
    this.velocity.set(0,0,0); this.grounded = false; this._jumpGrace = 0;
  }

  getDebugString() {
    return [
      `POS ${this.position.x.toFixed(2)} ${this.position.y.toFixed(2)} ${this.position.z.toFixed(2)}`,
      `VEL ${this.velocity.x.toFixed(2)} ${this.velocity.y.toFixed(2)} ${this.velocity.z.toFixed(2)}`,
      `GROUND ${this.grounded ? 'YES' : 'NO'} COLL ${this._debug.collisions} DYN ${this._debug.dynamicCollisions||0} STEP ${this._debug.stepUps} SNAP ${this._debug.groundSnaps}`,
      `YAW ${THREE.MathUtils.radToDeg(this.yaw).toFixed(1)} PITCH ${THREE.MathUtils.radToDeg(this.pitch).toFixed(1)} ROLL 0.0`,
    ].join('\n');
  }
}

const ZERO_INPUT = Object.freeze({ moveX:0, moveForward:0, lookX:0, lookY:0, jump:false });
function moveTowards(current, target, maxDelta) {
  if (Math.abs(target-current) <= maxDelta) return target;
  return current + Math.sign(target-current) * maxDelta;
}
function horizontalDistanceSq(a,b) { const dx=a.x-b.x, dz=a.z-b.z; return dx*dx+dz*dz; }
