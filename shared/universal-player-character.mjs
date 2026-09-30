import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const UNIVERSAL_PLAYER_BASE = '/assets/characters/kaykit-knight';

async function readJson(url, fetchFn) {
  const response = await fetchFn(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Universal player asset fetch failed: ${response.status} ${url}`);
  return response.json();
}

function applyShadows(root, enabled) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = enabled;
    node.receiveShadow = enabled;
  });
}

function disposeObject(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose?.();
      }
      material.dispose?.();
    }
  });
}

export async function loadUniversalPlayer(options = {}) {
  const baseUrl = String(options.baseUrl || UNIVERSAL_PLAYER_BASE).replace(/\/$/, '');
  const fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
  if (!fetchFn) throw new Error('Universal player runtime requires fetch');
  const loader = options.loader || new GLTFLoader();

  const [manifest, semantics] = await Promise.all([
    readJson(`${baseUrl}/manifest.json`, fetchFn),
    readJson(`${baseUrl}/semantic-actions.json`, fetchFn)
  ]);

  const [modelGltf, ...animationGltfs] = await Promise.all([
    loader.loadAsync(`${baseUrl}/${manifest.model}`),
    ...manifest.animationGroups.map((relative) => loader.loadAsync(`${baseUrl}/${relative}`))
  ]);

  const object = modelGltf.scene;
  const scale = Number.isFinite(options.scale) ? options.scale : 1;
  object.scale.setScalar(scale);
  applyShadows(object, options.shadows !== false);
  options.parent?.add?.(object);

  const clips = animationGltfs.flatMap((gltf) => gltf.animations || []);
  const clipByName = new Map(clips.map((clip) => [clip.name, clip]));
  const actionByClip = new Map();
  const mixer = new THREE.AnimationMixer(object);
  const looping = new Set(semantics.looping || []);
  let activeAction = null;
  let activeSemantic = null;

  function semanticClipName(name) {
    const candidates = semantics.actions?.[name] || [];
    return candidates.find((candidate) => clipByName.has(candidate)) || null;
  }

  function supports(name) {
    return Boolean(semanticClipName(name));
  }

  function actionForClip(clip) {
    if (!actionByClip.has(clip.name)) actionByClip.set(clip.name, mixer.clipAction(clip));
    return actionByClip.get(clip.name);
  }

  function play(name, options = {}) {
    const clipName = semanticClipName(name);
    if (!clipName) return null;
    const clip = clipByName.get(clipName);
    const action = actionForClip(clip);
    const fade = Number.isFinite(options.fade) ? Math.max(0, options.fade) : 0.16;
    const shouldLoop = options.loop ?? looping.has(name);
    const timeScale = Number.isFinite(options.timeScale) ? options.timeScale : 1;

    if (activeAction === action && shouldLoop) return action;
    if (activeAction && activeAction !== action) activeAction.fadeOut(fade);

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(timeScale);
    action.clampWhenFinished = !shouldLoop;
    action.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
    action.fadeIn(fade).play();
    activeAction = action;
    activeSemantic = name;
    return action;
  }

  function update(deltaSeconds) {
    mixer.update(Math.max(0, Number(deltaSeconds) || 0));
  }

  function listSemantics() {
    return Object.keys(semantics.actions || {}).map((name) => ({
      name,
      clip: semanticClipName(name),
      supported: supports(name)
    }));
  }

  function dispose() {
    mixer.stopAllAction();
    object.parent?.remove?.(object);
    disposeObject(object);
  }

  return Object.freeze({
    id: manifest.id,
    object,
    mixer,
    manifest,
    semantics,
    clips,
    get activeSemantic() { return activeSemantic; },
    semanticClipName,
    supports,
    play,
    update,
    listSemantics,
    dispose
  });
}
