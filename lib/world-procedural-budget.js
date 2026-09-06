'use strict';

const { clamp, finite, integer, normalizeRecipe } = require('../shared/world-procedural-core');

const DEVICE_PRESETS = Object.freeze({
  low: Object.freeze({ chunkRadius: 2, maxActiveVoxels: 65000, maxChunkVoxels: 6000, semanticDetailRatio: 0.08, textureTier: 0, shadowTier: 0, animationHz: 30, generationMsBudget: 4 }),
  medium: Object.freeze({ chunkRadius: 3, maxActiveVoxels: 180000, maxChunkVoxels: 12000, semanticDetailRatio: 0.16, textureTier: 1, shadowTier: 1, animationHz: 45, generationMsBudget: 6 }),
  high: Object.freeze({ chunkRadius: 5, maxActiveVoxels: 420000, maxChunkVoxels: 24000, semanticDetailRatio: 0.26, textureTier: 2, shadowTier: 2, animationHz: 60, generationMsBudget: 8 }),
  ultra: Object.freeze({ chunkRadius: 7, maxActiveVoxels: 850000, maxChunkVoxels: 48000, semanticDetailRatio: 0.34, textureTier: 3, shadowTier: 3, animationHz: 60, generationMsBudget: 10 })
});

function classifyDevice(capabilities = {}) {
  const memory = finite(capabilities.deviceMemory, 0);
  const cores = finite(capabilities.hardwareConcurrency, 0);
  const mobile = Boolean(capabilities.isMobile);
  const gpuTier = finite(capabilities.gpuTier, 0);
  const maxTextureSize = finite(capabilities.maxTextureSize, 0);
  const score = (memory >= 8 ? 2 : memory >= 4 ? 1 : 0)
    + (cores >= 8 ? 2 : cores >= 4 ? 1 : 0)
    + (gpuTier >= 3 ? 2 : gpuTier >= 1 ? 1 : 0)
    + (maxTextureSize >= 8192 ? 1 : 0)
    - (mobile ? 1 : 0);
  if (score >= 6) return 'ultra';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function budgetForDevice(recipeInput, capabilities = {}, qualityScale = 1) {
  const recipe = normalizeRecipe(recipeInput);
  const tier = capabilities.forceTier && DEVICE_PRESETS[capabilities.forceTier] ? capabilities.forceTier : classifyDevice(capabilities);
  const preset = DEVICE_PRESETS[tier];
  const scale = clamp(finite(qualityScale, 1), 0.35, 1.25);
  const detailScale = clamp(scale * (0.55 + recipe.style.detail * 0.55), 0.35, 1.25);
  return {
    tier,
    targetFps: recipe.performance.targetFps,
    targetFrameMs: 1000 / recipe.performance.targetFps,
    qualityScale: +scale.toFixed(4),
    chunkRadius: integer(Math.round(preset.chunkRadius * Math.sqrt(detailScale)), 2, 1, 10),
    maxActiveVoxels: integer(Math.round(preset.maxActiveVoxels * detailScale), preset.maxActiveVoxels, 25000, 1500000),
    maxChunkVoxels: integer(Math.min(recipe.performance.maxChunkVoxels, Math.round(preset.maxChunkVoxels * detailScale)), preset.maxChunkVoxels, 512, 120000),
    semanticDetailRatio: +clamp(preset.semanticDetailRatio * detailScale, 0.04, 0.42).toFixed(4),
    textureTier: Math.max(0, Math.min(3, preset.textureTier + (scale > 1.1 ? 1 : 0))),
    shadowTier: Math.max(0, Math.min(3, preset.shadowTier + (scale > 1.1 ? 1 : 0))),
    animationHz: integer(Math.min(recipe.animation.enabled ? preset.animationHz : 0, recipe.performance.targetFps), preset.animationHz, 0, 120),
    generationMsBudget: +clamp(preset.generationMsBudget * Math.min(1.15, scale), 2, 14).toFixed(2),
    adaptiveResolution: true,
    offMainThreadPreferred: true
  };
}

function deriveEnhancerPolicy(budget) {
  return {
    enabled: true,
    maxAddedVoxelRatio: clamp(finite(budget.semanticDetailRatio, 0.16), 0.04, 0.42),
    maxAddedVoxelAbsolute: integer(Math.round(finite(budget.maxActiveVoxels, 180000) * 0.18), 32000, 4000, 120000),
    edgeDensity: clamp(0.58 + finite(budget.qualityScale, 1) * 0.28, 0.55, 0.98),
    semanticDetail: true,
    prioritySort: true
  };
}

function deriveGeneratorOptions(budget) {
  const scale = finite(budget.qualityScale, 1);
  return {
    chunkSize: 16,
    maxVoxels: integer(budget.maxChunkVoxels, 12000, 512, 120000),
    surfaceDepth: scale < 0.55 ? 1 : scale < 0.85 ? 2 : scale < 1.12 ? 3 : 4
  };
}

class AdaptiveBudgetController {
  constructor(options = {}) {
    this.targetFps = integer(options.targetFps, 60, 24, 240);
    this.targetFrameMs = 1000 / this.targetFps;
    this.qualityScale = clamp(finite(options.initialQualityScale, 1), 0.35, 1.25);
    this.ewmaFrameMs = this.targetFrameMs;
    this.alpha = clamp(finite(options.alpha, 0.08), 0.01, 0.5);
    this.cooldownFrames = integer(options.cooldownFrames, 30, 5, 240);
    this.framesSinceAdjust = 0;
  }

  observeFrame(frameMs) {
    const ms = clamp(finite(frameMs, this.targetFrameMs), 1, 250);
    this.ewmaFrameMs += (ms - this.ewmaFrameMs) * this.alpha;
    this.framesSinceAdjust += 1;
    if (this.framesSinceAdjust >= this.cooldownFrames) {
      const slow = this.ewmaFrameMs > this.targetFrameMs * 1.12;
      const fast = this.ewmaFrameMs < this.targetFrameMs * 0.82;
      if (slow) this.qualityScale = clamp(this.qualityScale - 0.08, 0.35, 1.25);
      else if (fast) this.qualityScale = clamp(this.qualityScale + 0.035, 0.35, 1.25);
      if (slow || fast) this.framesSinceAdjust = 0;
      else this.framesSinceAdjust = Math.floor(this.cooldownFrames * 0.5);
    }
    return this.snapshot();
  }

  snapshot() {
    return {
      targetFps: this.targetFps,
      targetFrameMs: +this.targetFrameMs.toFixed(3),
      ewmaFrameMs: +this.ewmaFrameMs.toFixed(3),
      qualityScale: +this.qualityScale.toFixed(4)
    };
  }
}

module.exports = { DEVICE_PRESETS, classifyDevice, budgetForDevice, deriveEnhancerPolicy, deriveGeneratorOptions, AdaptiveBudgetController };
