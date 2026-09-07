import * as THREE from 'three';

export const CREATURE_CATEGORIES = [
  'reptile','croc_teeth','fish','dragon','dragon_fire','human','human_sword',
  'human_torch','human_gun','ship','steampunk_vehicle','creature','monster'
];

const DEFAULT_POLICY = {
  full: { maxDistance: 30, tickRate: 1, aiEnabled: true, despawn: false },
  high: { maxDistance: 60, tickRate: 0.5, aiEnabled: true, despawn: false },
  medium: { maxDistance: 100, tickRate: 0.25, aiEnabled: false, despawn: false },
  low: { maxDistance: 160, tickRate: 0, aiEnabled: false, despawn: true }
};

const PALETTE = {
  reptile: 0x6f8c47, croc_teeth: 0x556b38, fish: 0x4c86a8, dragon: 0x7d3d38,
  dragon_fire: 0x8f402d, human: 0x9f7f65, human_sword: 0x7b8392,
  human_torch: 0x8d7156, human_gun: 0x66717d, ship: 0x74523b,
  steampunk_vehicle: 0x855f38, creature: 0x6d725f, monster: 0x70445f
};

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(0.5, 8, 6);
const materialCache = new Map();
function mat(color, emissive = 0) {
  const key = `${color}:${emissive}`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.72, metalness: emissive ? 0.1 : 0.05,
      emissive: new THREE.Color(emissive), emissiveIntensity: emissive ? 1.4 : 0
    }));
  }
  return materialCache.get(key);
}

function cube(group, size, pos, color, record, emissive = 0) {
  const mesh = new THREE.Mesh(boxGeometry, mat(color, emissive));
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.creatureRecord = record;
  group.add(mesh);
  return mesh;
}

function sphere(group, size, pos, color, record) {
  const mesh = new THREE.Mesh(sphereGeometry, mat(color));
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.userData.creatureRecord = record;
  group.add(mesh);
  return mesh;
}

function addHuman(group, color, record, tool) {
  cube(group, [0.7,1.15,0.42], [0,1.25,0], color, record);
  sphere(group, [0.46,0.5,0.46], [0,2.15,0], 0xb99372, record);
  cube(group, [0.24,0.92,0.24], [-0.52,1.28,0], color, record);
  cube(group, [0.24,0.92,0.24], [0.52,1.28,0], color, record);
  cube(group, [0.28,0.95,0.30], [-0.22,0.28,0], 0x383a42, record);
  cube(group, [0.28,0.95,0.30], [0.22,0.28,0], 0x383a42, record);
  if (tool === 'sword') {
    cube(group, [0.12,1.25,0.12], [0.77,1.15,0], 0xbac3cf, record);
    cube(group, [0.48,0.10,0.12], [0.77,0.63,0], 0x503a27, record);
  } else if (tool === 'torch') {
    cube(group, [0.13,1.05,0.13], [0.77,1.22,0], 0x5b402c, record);
    cube(group, [0.30,0.38,0.30], [0.77,1.90,0], 0xff8a32, record, 0xff5b16);
  } else if (tool === 'gun') {
    cube(group, [0.75,0.18,0.18], [0.72,1.28,-0.15], 0x343a42, record);
    cube(group, [0.16,0.45,0.16], [0.48,1.05,-0.15], 0x343a42, record);
  }
}

function buildCreature(category, record) {
  const group = new THREE.Group();
  const color = PALETTE[category] || 0x777777;
  const detail = new THREE.Group();
  detail.name = 'microDetail';
  group.add(detail);

  if (category.startsWith('human')) {
    const tool = category.includes('sword') ? 'sword' : category.includes('torch') ? 'torch' : category.includes('gun') ? 'gun' : null;
    addHuman(group, color, record, tool);
  } else if (category === 'fish') {
    sphere(group, [1.35,0.62,0.58], [0,1.0,0], color, record);
    cube(group, [0.72,0.78,0.12], [-1.25,1.0,0], 0x6ca8c4, record).rotation.z = Math.PI / 4;
    cube(group, [0.55,0.12,0.58], [0,1.48,0], 0x6ca8c4, record);
  } else if (category === 'ship') {
    cube(group, [2.6,0.55,1.05], [0,0.62,0], color, record);
    cube(group, [1.65,0.38,0.72], [0,1.05,0], 0x8d694b, record);
    cube(group, [0.12,2.25,0.12], [0,2.0,0], 0x4b3828, record);
    cube(group, [0.08,1.28,1.55], [0.05,2.18,0], 0xb4aa8a, record);
  } else if (category === 'steampunk_vehicle') {
    cube(group, [2.15,0.72,1.0], [0,0.72,0], color, record);
    cube(group, [0.85,0.82,0.82], [0.28,1.42,0], 0x9a7145, record);
    for (const x of [-0.72,0.72]) for (const z of [-0.58,0.58]) {
      sphere(group, [0.42,0.42,0.22], [x,0.35,z], 0x2e2b29, record).rotation.x = Math.PI / 2;
    }
    cube(group, [0.28,1.35,0.28], [-0.55,1.64,0], 0x55483c, record);
  } else {
    const longBody = category.includes('croc') || category === 'reptile';
    sphere(group, [longBody ? 1.45 : 1.05,0.68,0.72], [0,0.9,0], color, record);
    sphere(group, [0.65,0.55,0.58], [1.08,1.05,0], color, record);
    for (const x of [-0.62,0.62]) for (const z of [-0.44,0.44]) {
      cube(group, [0.22,0.62,0.22], [x,0.34,z], color, record);
    }
    cube(group, [1.15,0.24,0.24], [-1.15,0.86,0], color, record).rotation.z = -0.18;
    if (category.includes('dragon')) {
      const wingL = cube(group, [1.25,0.10,1.05], [-0.15,1.45,0.88], 0x63343a, record);
      const wingR = cube(group, [1.25,0.10,1.05], [-0.15,1.45,-0.88], 0x63343a, record);
      wingL.name = 'wingL'; wingR.name = 'wingR';
      if (category === 'dragon_fire') cube(group, [0.75,0.28,0.28], [1.82,1.04,0], 0xff6a22, record, 0xff4c00);
    }
    if (category === 'croc_teeth' || category === 'monster' || category === 'creature') {
      for (let i = 0; i < 4; i++) cube(group, [0.10,0.20,0.10], [1.52,0.82 + (i%2)*0.18,-0.24 + i*0.16], 0xe6dfc6, record);
    }
    if (category === 'monster' || category === 'creature') {
      cube(group, [0.16,0.62,0.16], [0.78,1.72,0.42], 0xc3b69d, record).rotation.z = -0.28;
      cube(group, [0.16,0.62,0.16], [0.78,1.72,-0.42], 0xc3b69d, record).rotation.z = -0.28;
    }
  }

  // Tiny voxel surface irregularities: only visible in the full LOD tier.
  for (let i = 0; i < 5; i++) {
    cube(detail, [0.10,0.10,0.10], [-0.45 + i*0.22,1.45 + (i%2)*0.08,0.46], 0xc5b088, record);
  }
  group.userData.detailGroup = detail;
  return group;
}

function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CreatureWorld {
  constructor({ scene, viewer, camera, renderer }) {
    this.scene = scene; this.viewer = viewer; this.camera = camera; this.renderer = renderer;
    this.policy = { ...DEFAULT_POLICY };
    this.creatures = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hud = this.createHud();
    this.onPointer = this.onPointer.bind(this);
    renderer.domElement.addEventListener('pointerdown', this.onPointer, { passive: true });
    this.loadPolicy();
  }

  async loadPolicy() {
    try {
      const r = await fetch('/data/creature-lod-policy.json', { cache: 'no-store' });
      if (!r.ok) return;
      const json = await r.json();
      if (json?.tiers) this.policy = json.tiers;
    } catch (_) {}
  }

  createHud() {
    const el = document.createElement('div');
    el.id = 'creatureFactoryLiveHud';
    el.style.cssText = 'position:fixed;right:10px;top:10px;z-index:45;pointer-events:none;padding:8px 10px;border:1px solid rgba(134,197,122,.35);border-radius:10px;background:rgba(4,10,5,.62);backdrop-filter:blur(6px);color:#d7efcc;font:11px/1.35 system-ui;max-width:230px';
    el.innerHTML = '<b>Creature Factory · LIVE</b><div>загрузка существ…</div>';
    document.body.appendChild(el);
    return el;
  }

  spawn(count = 26, seed = 'world-server-live') {
    const rand = seeded(seed);
    for (let i = 0; i < count; i++) {
      const category = CREATURE_CATEGORIES[i % CREATURE_CATEGORIES.length];
      const record = {
        id: `live:${i}`, category, hp: 100, maxHp: 100, alive: true,
        state: 'idle', lodTier: 'full', accum: rand(), phase: rand() * Math.PI * 2,
        respawnAt: 0, baseY: 0.15 + rand() * 0.25
      };
      const group = buildCreature(category, record);
      record.group = group;
      const angle = (i / count) * Math.PI * 2 + rand() * 0.16;
      const radius = 10 + (i % 4) * 7 + rand() * 3;
      group.position.set(Math.cos(angle) * radius, record.baseY, 10 + Math.sin(angle) * radius);
      group.rotation.y = -angle + Math.PI / 2;
      group.scale.setScalar(category.startsWith('human') ? 0.7 : 0.8);
      this.scene.add(group);
      this.creatures.push(record);
    }
    this.updateHud();
    return this.creatures;
  }

  tierFor(distance) {
    for (const name of ['full','high','medium','low']) {
      const tier = this.policy[name];
      if (tier && distance <= Number(tier.maxDistance || Infinity)) return name;
    }
    return 'low';
  }

  tickRateFor(tier) {
    return Math.max(0, Number(this.policy[tier]?.tickRate ?? DEFAULT_POLICY[tier]?.tickRate ?? 0));
  }

  update(now, dt) {
    const viewer = this.viewer.position;
    for (const c of this.creatures) {
      if (!c.alive) {
        if (c.respawnAt && now >= c.respawnAt) {
          c.alive = true; c.hp = c.maxHp; c.state = 'idle'; c.group.visible = true; c.group.scale.setScalar(c.category.startsWith('human') ? 0.7 : 0.8);
          c.respawnAt = 0;
        }
        continue;
      }
      const dist = c.group.position.distanceTo(viewer);
      const tier = this.tierFor(dist);
      c.lodTier = tier;
      c.group.visible = tier !== 'low';
      if (!c.group.visible) continue;
      if (c.group.userData.detailGroup) c.group.userData.detailGroup.visible = tier === 'full';
      const tickRate = this.tickRateFor(tier);
      c.accum += dt;
      const interval = tickRate > 0 ? 1 / tickRate : Infinity;
      if (c.accum < interval) continue;
      const step = c.accum; c.accum = 0;
      const aiEnabled = !!this.policy[tier]?.aiEnabled;
      if (aiEnabled && dist < 12 && !c.category.includes('ship') && !c.category.includes('vehicle')) c.state = 'chase';
      if (c.state === 'chase' && dist > 2.5) {
        const dir = new THREE.Vector3().subVectors(viewer, c.group.position); dir.y = 0;
        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          const speed = c.category === 'dragon' || c.category === 'dragon_fire' ? 1.55 : 0.8;
          c.group.position.addScaledVector(dir, speed * step);
          c.group.rotation.y = Math.atan2(dir.x, dir.z);
        }
      }
      const t = now * 0.001 + c.phase;
      c.group.position.y = c.baseY + Math.sin(t * 2.2) * (c.category === 'fish' ? 0.18 : 0.05);
      if (c.category.includes('dragon')) {
        const wingL = c.group.getObjectByName('wingL');
        const wingR = c.group.getObjectByName('wingR');
        if (wingL) wingL.rotation.x = Math.sin(t * 5.5) * 0.55;
        if (wingR) wingR.rotation.x = -Math.sin(t * 5.5) * 0.55;
      }
    }
    if ((now | 0) % 500 < 18) this.updateHud();
  }

  damage(record, amount = 40) {
    if (!record?.alive) return false;
    record.hp = Math.max(0, record.hp - amount);
    record.group.scale.multiplyScalar(0.92);
    setTimeout(() => { if (record.alive) record.group.scale.setScalar(record.category.startsWith('human') ? 0.7 : 0.8); }, 90);
    if (record.hp <= 0) {
      record.alive = false; record.state = 'dead'; record.group.visible = false;
      record.respawnAt = performance.now() + 5000;
    } else {
      record.state = 'chase';
    }
    this.updateHud(record);
    return true;
  }

  onPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.creatures.map(c => c.group), true);
    const record = hits[0]?.object?.userData?.creatureRecord;
    if (record) this.damage(record, 40);
  }

  updateHud(selected) {
    const alive = this.creatures.filter(c => c.alive).length;
    const counts = { full:0, high:0, medium:0, low:0 };
    for (const c of this.creatures) counts[c.lodTier] = (counts[c.lodTier] || 0) + 1;
    const selectedText = selected ? `<div>${selected.category}: ${selected.hp}/${selected.maxHp} HP</div>` : '';
    this.hud.innerHTML = `<b>Creature Factory · LIVE</b><div>${alive}/${this.creatures.length} живы · 13 типов</div><div>LOD ${counts.full}/${counts.high}/${counts.medium}/${counts.low}</div>${selectedText}<div style="opacity:.7">Клик/тап по существу = урон</div>`;
  }

  stats() {
    return {
      total: this.creatures.length,
      alive: this.creatures.filter(c => c.alive).length,
      categories: [...new Set(this.creatures.map(c => c.category))],
      creatures: this.creatures.map(c => ({ id:c.id, category:c.category, hp:c.hp, alive:c.alive, state:c.state, lodTier:c.lodTier }))
    };
  }
}
