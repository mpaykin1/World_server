import * as THREE from 'three';
import { LightCapture } from './capture.mjs';
import { createFullscreenPass } from './fullscreen.mjs';
import {
  LIGHT_EXTRACT_FRAGMENT,
  TEMPORAL_FRAGMENT,
  KAWASE_FRAGMENT,
  COMPOSITE_FRAGMENT,
  COPY_FRAGMENT
} from './shaders.mjs';
import { livingGoldProfile, mergeLightProfile, validateLightProfile } from './profile.mjs';

function hdrTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: false
  });
}

function colorUniform(value) {
  return { value: new THREE.Color(value[0], value[1], value[2]) };
}

export class LightPipeline {
  constructor({
    renderer,
    colorScene,
    maskScene,
    camera,
    width,
    height,
    profile = livingGoldProfile
  }) {
    this.renderer = renderer;
    this.colorScene = colorScene;
    this.maskScene = maskScene;
    this.camera = camera;
    this.profile = mergeLightProfile(livingGoldProfile, profile);
    validateLightProfile(this.profile);

    this.capture = new LightCapture(renderer, width, height);
    this.raw = hdrTarget(width, height);
    this.stable = hdrTarget(width, height);
    this.history = hdrTarget(width, height);
    this.bloomA = hdrTarget(width, height);
    this.bloomB = hdrTarget(width, height);
    this.size = new THREE.Vector2(width, height);
    this.hasHistory = false;

    this.extract = this.#createExtractPass();
    this.temporal = this.#createTemporalPass();
    this.blur = this.#createBlurPass();
    this.composite = this.#createCompositePass();
    this.copy = createFullscreenPass(COPY_FRAGMENT, { tInput: { value: null } });
  }

  #createExtractPass() {
    const p = this.profile;
    return createFullscreenPass(LIGHT_EXTRACT_FRAGMENT, {
      tMask: { value: this.capture.mask.texture },
      tNormal: { value: this.capture.normal.texture },
      tDepth: { value: this.capture.depth.texture },
      uResolution: { value: this.size },
      uTime: { value: 0 },
      uCoreColor: colorUniform(p.core),
      uGoldColor: colorUniform(p.gold),
      uAmberColor: colorUniform(p.amber),
      uCoreGain: { value: p.coreGain },
      uGoldGain: { value: p.goldGain },
      uHaloGain: { value: p.haloGain },
      uRimPower: { value: p.rimPower },
      uDepthGain: { value: p.depthGain },
      uFilamentGain: { value: p.filamentGain },
      uFilamentThreshold: { value: p.filamentThreshold },
      uEdgeSoftness: { value: p.edgeSoftness },
      uZoneGain: { value: new THREE.Vector3(p.topGain, p.middleGain, p.bottomGain) },
      uLightDirection: { value: new THREE.Vector3(...p.lightDirection).normalize() },
      uDirectionalStrength: { value: p.directionalStrength },
      uLightCutoff: { value: p.lightCutoff },
      uLightSoftness: { value: p.lightSoftness },
      uShadowFloor: { value: p.shadowFloor },
      uThicknessVariation: { value: p.thicknessVariation },
      uProjectedEdgeWeight: { value: p.projectedEdgeWeight }
    });
  }

  #createTemporalPass() {
    return createFullscreenPass(TEMPORAL_FRAGMENT, {
      tCurrent: { value: this.raw.texture },
      tHistory: { value: this.history.texture },
      uHistoryWeight: { value: this.profile.temporalBlend }
    });
  }

  #createBlurPass() {
    return createFullscreenPass(KAWASE_FRAGMENT, {
      tInput: { value: null },
      uResolution: { value: this.size },
      uRadius: { value: this.profile.bloomRadius }
    });
  }

  #createCompositePass() {
    return createFullscreenPass(COMPOSITE_FRAGMENT, {
      tColor: { value: this.capture.color.texture },
      tLight: { value: this.stable.texture },
      tBloom: { value: this.bloomB.texture },
      uBloomGain: { value: this.profile.bloomGain }
    });
  }

  setProfile(overrides = {}) {
    this.profile = mergeLightProfile(this.profile, overrides);
    validateLightProfile(this.profile);
    const p = this.profile;
    const u = this.extract.material.uniforms;
    u.uCoreColor.value.setRGB(...p.core);
    u.uGoldColor.value.setRGB(...p.gold);
    u.uAmberColor.value.setRGB(...p.amber);
    u.uCoreGain.value = p.coreGain;
    u.uGoldGain.value = p.goldGain;
    u.uHaloGain.value = p.haloGain;
    u.uRimPower.value = p.rimPower;
    u.uDepthGain.value = p.depthGain;
    u.uFilamentGain.value = p.filamentGain;
    u.uFilamentThreshold.value = p.filamentThreshold;
    u.uEdgeSoftness.value = p.edgeSoftness;
    u.uZoneGain.value.set(p.topGain, p.middleGain, p.bottomGain);
    u.uLightDirection.value.set(...p.lightDirection).normalize();
    u.uDirectionalStrength.value = p.directionalStrength;
    u.uLightCutoff.value = p.lightCutoff;
    u.uLightSoftness.value = p.lightSoftness;
    u.uShadowFloor.value = p.shadowFloor;
    u.uThicknessVariation.value = p.thicknessVariation;
    u.uProjectedEdgeWeight.value = p.projectedEdgeWeight;
    this.temporal.material.uniforms.uHistoryWeight.value = p.temporalBlend;
    this.blur.material.uniforms.uRadius.value = p.bloomRadius;
    this.composite.material.uniforms.uBloomGain.value = p.bloomGain;
  }

  resize(width, height) {
    this.size.set(width, height);
    this.capture.resize(width, height);
    for (const rt of [this.raw, this.stable, this.history, this.bloomA, this.bloomB]) {
      rt.setSize(width, height);
    }
    this.hasHistory = false;
  }

  render(timeSeconds = 0) {
    this.capture.render({
      colorScene: this.colorScene,
      maskScene: this.maskScene,
      camera: this.camera
    });
    this.extract.material.uniforms.uTime.value = timeSeconds;
    this.#draw(this.raw, this.extract);
    this.#stabilize();
    this.#bloom();
    this.#draw(null, this.composite);
  }

  #stabilize() {
    if (!this.hasHistory) {
      this.#copy(this.raw.texture, this.stable);
      this.#copy(this.raw.texture, this.history);
      this.hasHistory = true;
      return;
    }
    this.#draw(this.stable, this.temporal);
    this.#copy(this.stable.texture, this.history);
  }

  #bloom() {
    this.blur.material.uniforms.tInput.value = this.stable.texture;
    this.blur.material.uniforms.uRadius.value = this.profile.bloomRadius;
    this.#draw(this.bloomA, this.blur);
    this.blur.material.uniforms.tInput.value = this.bloomA.texture;
    this.blur.material.uniforms.uRadius.value = this.profile.bloomRadius * 2.1;
    this.#draw(this.bloomB, this.blur);
  }

  #copy(texture, target) {
    this.copy.material.uniforms.tInput.value = texture;
    this.#draw(target, this.copy);
  }

  #draw(target, pass) {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(pass.scene, pass.camera);
  }

  dispose() {
    this.capture.dispose();
    for (const rt of [this.raw, this.stable, this.history, this.bloomA, this.bloomB]) {
      rt.dispose();
    }
    for (const pass of [this.extract, this.temporal, this.blur, this.composite, this.copy]) {
      pass.dispose();
    }
  }
}
