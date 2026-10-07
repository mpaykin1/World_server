import * as THREE from 'three';
import { FULLSCREEN_VERTEX } from './shaders.mjs';

export function createFullscreenPass(fragmentShader, uniforms) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);
  return {
    scene,
    camera,
    material,
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    }
  };
}
