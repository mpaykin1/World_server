'use strict';

const SERVICE_MAP = Object.freeze({
  Workspace: 'world.scene+world.physics', Players: 'runtime.players', RunService: 'runtime.scheduler',
  ReplicatedStorage: 'runtime.shared-registry', CollectionService: 'runtime.tags',
  UserInputService: 'shared/ai3d-playable-runtime.js', ContextActionService: 'shared/ai3d-playable-runtime.js',
  Lighting: 'runtime.lighting', Debris: 'runtime.lifecycle', TweenService: 'runtime.tween',
  AssetService: 'roblox-asset-resolver', ServerScriptService: 'runtime.server-behaviors', SoundService: 'runtime.audio'
});

const API_MAP = Object.freeze([
  { pattern: /\bWorkspace:Raycast\s*\(|\bworkspace:Raycast\s*\(/, capability: 'physics.raycast', adapter: 'world-physics' },
  { pattern: /:ApplyImpulse\s*\(/, capability: 'physics.impulse', adapter: 'world-physics' },
  { pattern: /\.AssemblyLinearVelocity\b/, capability: 'physics.velocity', adapter: 'world-physics' },
  { pattern: /\.Touched\b/, capability: 'physics.contact-events', adapter: 'world-physics' },
  { pattern: /\bRemoteEvent\b|\.OnServerEvent\b|:FireServer\s*\(|:FireClient\s*\(/, capability: 'network.events', adapter: 'world-event-bus' },
  { pattern: /\bUserInputService\b|\bContextActionService\b/, capability: 'input.actions', adapter: 'golden-controls' },
  { pattern: /RenderStepped|BindToRenderStep|\.Heartbeat\b|\.Stepped\b/, capability: 'scheduler.frames', adapter: 'world-scheduler' },
  { pattern: /\bTweenService\b|:Create\s*\([^\n]*TweenInfo/, capability: 'animation.tween', adapter: 'world-tween' },
  { pattern: /\bCollectionService\b|:GetTagged\s*\(|:AddTag\s*\(/, capability: 'entities.tags', adapter: 'world-tags' },
  { pattern: /\bHumanoid\b/, capability: 'character.controller', adapter: 'golden-character-controller' },
  { pattern: /\bCFrame\b/, capability: 'transform.cframe', adapter: 'transform-adapter' },
  { pattern: /GetAttribute\s*\(|SetAttribute\s*\(/, capability: 'entities.attributes', adapter: 'component-metadata' },
  { pattern: /\bLighting\b/, capability: 'render.lighting', adapter: 'world-lighting' }
]);

function extractServices(source) {
  const found = new Set();
  const re = /game:GetService\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = re.exec(String(source || '')))) found.add(match[1]);
  return [...found].sort();
}

function mapServices(services) {
  return services.map((service) => ({ service, target: SERVICE_MAP[service] || null, supported: Boolean(SERVICE_MAP[service]) }));
}

function detectApiCapabilities(source) {
  const text = String(source || '');
  return API_MAP.filter((entry) => entry.pattern.test(text)).map(({ capability, adapter }) => ({ capability, adapter }));
}

function unsupportedServices(services) {
  return services.filter((service) => !SERVICE_MAP[service]);
}

module.exports = { SERVICE_MAP, API_MAP, extractServices, mapServices, detectApiCapabilities, unsupportedServices };
