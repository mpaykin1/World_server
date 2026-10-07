'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = {
  schemaVersion: '1.0.0',
  tiers: {
    full:    { maxDistance: 30, tickRate: 1.0, animDetail: 'full',    aiEnabled: true,  physicsDetail: 'full',    despawn: false },
    high:    { maxDistance: 60, tickRate: 0.5, animDetail: 'reduced', aiEnabled: true,  physicsDetail: 'reduced', despawn: false },
    medium:  { maxDistance: 100, tickRate: 0.25, animDetail: 'minimal', aiEnabled: false, physicsDetail: 'bbox',    despawn: false },
    low:     { maxDistance: 160, tickRate: 0.0, animDetail: 'none',   aiEnabled: false, physicsDetail: 'none',    despawn: true }
  },
  tierOrder: ['full', 'high', 'medium', 'low']
};

function loadPolicy(policyPath) {
  if (!policyPath) return DEFAULT_POLICY;
  const resolved = path.resolve(policyPath);
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tiers) return parsed;
  } catch (_) {}
  return DEFAULT_POLICY;
}

function getLodTier(distance, policy) {
  const tiers = (policy || DEFAULT_POLICY).tiers;
  const tierOrder = (policy || DEFAULT_POLICY).tierOrder || Object.keys(tiers);
  const d = Math.max(0, Number(distance) || 0);
  for (const name of tierOrder) {
    const tier = tiers[name];
    if (tier && d <= tier.maxDistance) return name;
  }
  return tierOrder[tierOrder.length - 1] || 'low';
}

function getTierConfig(tierName, policy) {
  const tiers = (policy || DEFAULT_POLICY).tiers;
  return tiers[tierName] || null;
}

function shouldTick(accumulatedDt, tierName, policy) {
  const tier = getTierConfig(tierName, policy);
  if (!tier) return false;
  if (tier.tickRate <= 0) return false;
  return accumulatedDt >= (1 / tier.tickRate);
}

function computeUpdateInterval(tierName, policy) {
  const tier = getTierConfig(tierName, policy);
  if (!tier || tier.tickRate <= 0) return Infinity;
  return 1 / tier.tickRate;
}

module.exports = { DEFAULT_POLICY, loadPolicy, getLodTier, getTierConfig, shouldTick, computeUpdateInterval };
