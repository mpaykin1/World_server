'use strict';

const { extractServices, mapServices, detectApiCapabilities, unsupportedServices } = require('./roblox-compatibility');

const BEHAVIORS = Object.freeze([
  ['procedural-world', /WorldGenerator|procedural|generate(?:Chunk|World|City)|chunkSize|seed/i],
  ['chunk-streaming', /ChunkPool|loadChunk|unloadChunk|activeChunks|chunk[_\s-]?radius/i],
  ['projectile-physics', /ApplyImpulse|AssemblyLinearVelocity|trajectory|projectile|throwRock|Raycast/i],
  ['climbing', /climb|SurfaceClimber|wallNormal|ledge/i],
  ['air-movement', /AthleticAirMovement|airControl|air[_\s-]?move|doubleJump|wallJump/i],
  ['player-input', /UserInputService|ContextActionService|KeyCode|Touch/i],
  ['network-events', /RemoteEvent|OnServerEvent|FireServer|FireClient|FireAllClients/i],
  ['lighting', /Lighting|PointLight|SpotLight|SurfaceLight|lantern/i],
  ['visual-effects', /ParticleEmitter|Trail|Beam|BloomEffect|ColorCorrection|visual/i],
  ['tagged-entities', /CollectionService|GetTagged|AddTag/i],
  ['character-controller', /Humanoid|HumanoidRootPart|CharacterAdded/i],
  ['tween-animation', /TweenService|TweenInfo/i],
  ['lifecycle-cleanup', /Debris|Destroy\s*\(/i]
]);

function detectBehaviors(script) {
  const haystack = `${script.name}\n${script.source}`;
  return BEHAVIORS.filter(([, pattern]) => pattern.test(haystack)).map(([name]) => name);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => { const key = keyFn(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

function translateScript(script) {
  const services = extractServices(script.source);
  const capabilities = detectApiCapabilities(script.source);
  const unsupported = unsupportedServices(services);
  const warnings = unsupported.map((service) => `Unsupported Roblox service: ${service}`);
  return {
    name: script.name, className: script.className, sourceSha256: script.sha256, sourceBytes: script.bytes,
    executionPolicy: 'never-execute-during-import', services: mapServices(services),
    behaviors: detectBehaviors(script), capabilities, warnings,
    translation: 'semantic-component-plan'
  };
}

function aggregateBehaviorPlan(scripts) {
  const translated = scripts.map(translateScript);
  const behaviors = [...new Set(translated.flatMap((item) => item.behaviors))].sort();
  const capabilities = uniqueBy(translated.flatMap((item) => item.capabilities), (item) => `${item.capability}:${item.adapter}`)
    .sort((a, b) => a.capability.localeCompare(b.capability));
  const warnings = [...new Set(translated.flatMap((item) => item.warnings))].sort();
  return { scripts: translated, behaviors, capabilities, warnings };
}

module.exports = { BEHAVIORS, detectBehaviors, translateScript, aggregateBehaviorPlan };
