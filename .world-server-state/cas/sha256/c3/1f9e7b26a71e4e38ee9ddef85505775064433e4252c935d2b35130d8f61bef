import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh';
import { LosslessStreamingManager } from './streaming-manager.js';
import { getVerifiedAssetURL } from './asset-cache.js';
import { hydrateOrBuildBVH } from './bvh-cache.js';
import { loadPlyInWorker } from './ply-worker-loader.js';
import { fetchLosslessGlbByRanges } from './lossless-range-stream.js';

const gltfLoader = new GLTFLoader();
const plyLoader = new PLYLoader();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const tmpBox = new THREE.Box3();
const tmpSegment = new THREE.Line3();
const triPoint = new THREE.Vector3();
const capsulePoint = new THREE.Vector3();

function applyTransform(root, t) {
  root.position.fromArray(t.position || [0, 0, 0]);
  root.rotation.set(
    THREE.MathUtils.degToRad((t.rotationDeg || [0, 0, 0])[0]),
    THREE.MathUtils.degToRad((t.rotationDeg || [0, 0, 0])[1]),
    THREE.MathUtils.degToRad((t.rotationDeg || [0, 0, 0])[2]),
    'XYZ',
  );
  root.scale.setScalar(t.scale ?? 1);
  root.updateMatrixWorld(true);
}

function materialForPly(geometry) {
  const hasColor = Boolean(geometry.getAttribute('color'));
  return new THREE.MeshStandardMaterial({
    vertexColors: hasColor,
    color: hasColor ? 0xffffff : 0xb9b6ae,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

async function loadMeshObject(type, url, expectedSha=null, workerPly=true, rangePlan=null) {
  if (type === 'glb' && rangePlan?.mode==='byte-identical-parallel-range-glb-v1') {
    if(expectedSha&&rangePlan.sourceSha256&&expectedSha!==rangePlan.sourceSha256)throw new Error('GLB range plan source SHA mismatch');
    const {buffer,report}=await fetchLosslessGlbByRanges(url,rangePlan,{concurrency:rangePlan.concurrency??4});
    const gltf=await new Promise((resolve,reject)=>gltfLoader.parse(buffer,new URL('.',url).href,resolve,reject));
    gltf.scene.userData.__qualityRangeStream=report;gltf.scene.updateMatrixWorld(true);return gltf.scene;
  }
  const verifiedUrl=await getVerifiedAssetURL(url,expectedSha);
  if (type === 'glb') {
    const gltf = await gltfLoader.loadAsync(verifiedUrl);
    gltf.scene.updateMatrixWorld(true);
    return gltf.scene;
  }
  if (type === 'ply-mesh') {
    let geometry=null;
    try{geometry=await loadPlyInWorker(verifiedUrl,{enabled:workerPly});}catch(e){console.warn('PLY worker fallback',e);}
    if(!geometry) geometry = await plyLoader.loadAsync(verifiedUrl);
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, materialForPly(geometry));
  }
  throw new Error(`Unsupported mesh type for collision: ${type}`);
}

async function loadVisual(scene, renderer, manifest, onProgress) {
  const v = manifest.visual;
  if (manifest.streaming?.mode === 'lossless-spatial-chunks-v2' || manifest.streaming?.mode === 'lossless-glb-spatial-chunks-v1') {
    const root = new THREE.Group();
    root.name = '__LOSSLESS_STREAM_ROOT__';
    applyTransform(root, manifest.transform);
    scene.add(root);
    const manager = new LosslessStreamingManager({
      manifest, root,
      loadChunk: async chunk => {
        const chunkType = chunk.visualType || (manifest.streaming?.mode === 'lossless-glb-spatial-chunks-v1' ? 'glb' : 'ply-mesh');
        const obj = await loadMeshObject(chunkType, chunk.url, chunk.sha256||null, manifest.graphics?.fpsOptimization?.workerPlyDecode!==false);
        obj.traverse?.(m => { if (m.isMesh) { m.castShadow = manifest.graphics?.castShadows !== false; m.receiveShadow = true; } });
        return obj;
      },
    });
    const bootstrap = new THREE.Vector3().fromArray(manifest.streaming.bootstrapCenter || manifest.spawn?.preferredPosition || [0,0,0]);
    onProgress?.('Подгружаю lossless-чанки без снижения детализации…');
    await manager.bootstrap(bootstrap);
    return { root, kind: 'mesh', streaming: manager };
  }
  if (v.type === 'glb' || v.type === 'ply-mesh') {
    let rangePlan=null;if(v.type==='glb'&&manifest.streaming?.rangePlanUrl){const rr=await fetch(manifest.streaming.rangePlanUrl,{cache:'force-cache'});if(!rr.ok)throw new Error(`GLB range plan HTTP ${rr.status}`);rangePlan=await rr.json();}
    const root = await loadMeshObject(v.type, v.url, v.sha256||null, manifest.graphics?.fpsOptimization?.workerPlyDecode!==false, rangePlan);
    root.traverse?.(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = manifest.graphics?.castShadows !== false;
      obj.receiveShadow = true;
      if (obj.material?.map) obj.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    applyTransform(root, manifest.transform);
    scene.add(root);
    return { root, kind: 'mesh' };
  }

  if (v.type === 'spz' || v.type === 'ply-splat') {
    const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark');
    if (!scene.userData.sparkRenderer) {
      const spark = new SparkRenderer({ renderer });
      scene.userData.sparkRenderer = spark;
      scene.add(spark);
    }
    const verifiedSplatUrl=await getVerifiedAssetURL(v.url,v.sha256||null);
    const splat = new SplatMesh({
      url: verifiedSplatUrl,
      onProgress: evt => {
        if (!onProgress) return;
        const pct = evt?.lengthComputable ? Math.round(evt.loaded / evt.total * 100) : null;
        onProgress(pct === null ? 'Загрузка splat…' : `Загрузка splat ${pct}%`);
      },
    });
    scene.add(splat);
    await splat.initialized;
    applyTransform(splat, manifest.transform);
    return { root: splat, kind: 'splat' };
  }

  throw new Error(`Unsupported visual type: ${v.type}`);
}

async function makeColliderRoot(manifest, visual) {
  const c = manifest.collision;
  if (c.mode === 'visual-exact') {
    if (visual.kind !== 'mesh') throw new Error('visual-exact collision is forbidden for splats');
    return visual.root;
  }
  if (c.mode === 'proxy') {
    const type = c.type || (c.url?.toLowerCase().endsWith('.glb') ? 'glb' : 'ply-mesh');
    const root = await loadMeshObject(type, c.url, c.sha256||null, manifest.graphics?.fpsOptimization?.workerPlyDecode!==false);
    applyTransform(root, c.transform || manifest.transform);
    return root;
  }
  throw new Error(`Unsupported collision mode: ${c.mode}`);
}

async function buildBVH(root,cacheKey=null) {
  root.updateMatrixWorld(true);
  const generator = new StaticGeometryGenerator(root);
  generator.useGroups = false;
  generator.applyWorldTransforms = true;
  generator.attributes = ['position'];
  const geometry = generator.generate();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const bvhCache=await hydrateOrBuildBVH(geometry,cacheKey,{maxLeafTris:12,indirect:true});
  const material = new THREE.MeshBasicMaterial({ visible: false });
  const collider = new THREE.Mesh(geometry, material);
  collider.name = '__WORLD_COLLIDER__';
  collider.visible = false;
  collider.updateMatrixWorld(true);
  collider.userData.bvhCache=bvhCache;
  return collider;
}

export async function loadWorld({ scene, renderer, manifest, onProgress }) {
  onProgress?.('Загружаю визуальный мир без упрощения…');
  const visual = await loadVisual(scene, renderer, manifest, onProgress);
  onProgress?.('Строю физические коллизии…');
  const colliderRoot = await makeColliderRoot(manifest, visual);
  const collisionKey=manifest.collision?.sha256||manifest.visual?.sha256||null;
  const transformKey=JSON.stringify(manifest.collision?.transform||manifest.transform||{});
  const collider = await buildBVH(colliderRoot,collisionKey?`bvh:${collisionKey}:${transformKey}`:null);
  scene.add(collider);

  const bounds = collider.geometry.boundingBox.clone();
  return { manifest, visual, collider, bounds, streaming: visual.streaming || null };
}

export function raycastCollider(collider, origin, direction, maxDistance = Infinity) {
  const ray = new THREE.Ray(origin.clone(), direction.clone().normalize());
  const hit = collider.geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);
  if (!hit || hit.distance > maxDistance) return null;
  return hit;
}

function capsuleIsFree(collider, feet, player) {
  const radius = player.radius;
  const height = player.height;
  tmpSegment.start.copy(feet).addScaledVector(UP, radius + 0.015);
  tmpSegment.end.copy(feet).addScaledVector(UP, height - radius);
  tmpBox.makeEmpty().expandByPoint(tmpSegment.start).expandByPoint(tmpSegment.end);
  tmpBox.min.addScalar(-radius + 0.02);
  tmpBox.max.addScalar(radius - 0.02);
  let blocked = false;
  collider.geometry.boundsTree.shapecast({
    intersectsBounds: box => !blocked && box.intersectsBox(tmpBox),
    intersectsTriangle: tri => {
      if (blocked) return true;
      const d = tri.closestPointToSegment(tmpSegment, triPoint, capsulePoint);
      if (d < radius - 0.025) {
        blocked = true;
        return true;
      }
      return false;
    },
  });
  return !blocked;
}

function isWalkableHit(hit, maxSlopeDeg) {
  const n = hit?.face?.normal;
  if (!n) return true;
  const minY = Math.cos(THREE.MathUtils.degToRad(maxSlopeDeg));
  return n.y >= minY;
}

function trySnap(world, requestedPosition, playerConfig) {
  const { collider, bounds, manifest } = world;
  const maxSnap = manifest.spawn.maxSnapDistance ?? 12;
  const candidate = new THREE.Vector3().fromArray(requestedPosition);
  const originY = Math.min(bounds.max.y + 1.5, Math.max(candidate.y + 0.5, bounds.min.y + 0.5));
  const origin = new THREE.Vector3(candidate.x, originY, candidate.z);
  const hit = raycastCollider(collider, origin, DOWN, maxSnap + Math.max(0, originY - candidate.y));
  if (!hit || !isWalkableHit(hit, manifest.spawn.maxSlopeDeg ?? 50)) return null;
  const feet = hit.point.clone();
  feet.y += 0.03;
  if (!capsuleIsFree(collider, feet, playerConfig)) return null;
  return feet;
}

function autoFindSafeSpawn(world, playerConfig) {
  const { bounds, collider, manifest } = world;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const grid = Math.max(7, Math.min(15, manifest.spawn.gridSize ?? 11));
  const spanX = size.x * 0.68;
  const spanZ = size.z * 0.68;
  const rayY = bounds.max.y + Math.max(1, playerConfig.height);
  const maxRay = size.y + playerConfig.height * 4 + 5;
  const hits = [];

  for (let ix = 0; ix < grid; ix++) {
    const tx = grid === 1 ? 0.5 : ix / (grid - 1);
    const x = center.x + (tx - 0.5) * spanX;
    for (let iz = 0; iz < grid; iz++) {
      const tz = grid === 1 ? 0.5 : iz / (grid - 1);
      const z = center.z + (tz - 0.5) * spanZ;
      const hit = raycastCollider(collider, new THREE.Vector3(x, rayY, z), DOWN, maxRay);
      if (!hit || !isWalkableHit(hit, manifest.spawn.maxSlopeDeg ?? 50)) continue;
      const feet = hit.point.clone().addScaledVector(UP, 0.03);
      if (!capsuleIsFree(collider, feet, playerConfig)) continue;
      hits.push(feet);
    }
  }

  if (!hits.length) throw new Error('Auto spawn failed: no walkable ground with enough capsule clearance');

  // Choose the dominant elevation band, then the point nearest the world center.
  // This strongly favors streets/floors over isolated roofs or pits without hardcoding a Y value.
  const binSize = Math.max(0.18, playerConfig.radius * 0.75);
  const bins = new Map();
  for (const p of hits) {
    const key = Math.round(p.y / binSize);
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(p);
  }
  const rankedBins = [...bins.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0] - b[0];
  });
  const candidates = rankedBins[0][1];
  candidates.sort((a, b) => {
    const da = (a.x - center.x) ** 2 + (a.z - center.z) ** 2;
    const db = (b.x - center.x) ** 2 + (b.z - center.z) ** 2;
    return da - db;
  });
  return candidates[0].clone();
}

export function findSafeSpawn(world, playerConfig) {
  const spawn = world.manifest.spawn;
  if (spawn.mode === 'snap-to-ground') {
    const feet = trySnap(world, spawn.position, playerConfig);
    if (!feet) throw new Error(`Spawn invalid near [${spawn.position.join(', ')}]: no safe walkable ground`);
    return feet;
  }

  if (spawn.mode === 'auto-safe-ground') {
    if (Array.isArray(spawn.preferredPosition)) {
      const feet = trySnap(world, spawn.preferredPosition, playerConfig);
      if (feet) return feet;
    }
    return autoFindSafeSpawn(world, playerConfig);
  }

  throw new Error(`Unsupported spawn mode: ${spawn.mode}`);
}
