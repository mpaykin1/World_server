'use strict';

const fs = require('fs');
const path = require('path');
const { redundantCandidateScore } = require('./science-h2-redundant-rule');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_DIR = path.join(ROOT, 'science', 'gameplay');
const REQUIRED_GATES = Object.freeze([
  'scienceEvidence',
  'productionRuntime',
  'visibleEffect',
  'playerInteraction',
  'navigatorAge5',
  'telemetry',
  'regressionTests'
]);
const SCIENCE_DOMAINS = Object.freeze([
  'visualDestruction',
  'recoveryAnimation',
  'playerDestruction',
  'weapons',
  'npcBehavior',
  'newBuildings',
  'newTextures',
  'roads',
  'destructionPhysics',
  'controls',
  'worldGeneration',
  'multiplayer'
]);
const DOMAIN_STAGES = Object.freeze(['disabled', 'planned', 'experimental', 'verified-runtime', 'production-enabled']);
const DOMAIN_GATES = Object.freeze([
  'implementation',
  'causeEffect',
  'navigator',
  'telemetry',
  'regression',
  'performance',
  'productionEvidence'
]);

const CARDINAL = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const key = node => `${node.x},${node.y},${node.z}`;

const contractCache = new Map();
const evidenceCache = new Map();
const mechanicHandlers = new Map();

function normalizeRunId(runId) {
  const id = String(runId || '').trim().toUpperCase();
  if (!/^RUN_\d{3}$/.test(id)) throw new Error(`Invalid science run ID: ${runId}`);
  return id;
}

function validateAge5Navigator(navigator) {
  if (!navigator || typeof navigator !== 'object') throw new Error('Navigator config is missing.');
  if (navigator.audienceAge !== 5) throw new Error('Science Navigator must target age 5.');
  if (navigator.language !== 'ru') throw new Error('Science Navigator must use ru language in primary contract.');
  for (const field of ['intro', 'damage', 'regrow', 'scienceNote']) {
    if (typeof navigator[field] !== 'string' || !navigator[field].trim()) {
      throw new Error(`Missing required age-5 Navigator copy: ${field}`);
    }
  }
}

function validateDomains(domains) {
  if (!domains || typeof domains !== 'object') throw new Error('Science contract missing domains map.');
  for (const domain of SCIENCE_DOMAINS) {
    const cfg = domains[domain];
    if (!cfg || typeof cfg !== 'object') throw new Error(`Science domain ${domain} missing.`);
    if (!DOMAIN_STAGES.includes(cfg.stage)) throw new Error(`Invalid stage ${cfg.stage} for domain ${domain}.`);
    if (typeof cfg.runtime?.preview !== 'boolean' || typeof cfg.runtime?.production !== 'boolean') {
      throw new Error(`Domain ${domain} must declare preview/production boolean runtime flags.`);
    }
    if (!cfg.gates || typeof cfg.gates !== 'object') throw new Error(`Domain ${domain} missing gates.`);
    for (const gate of DOMAIN_GATES) {
      if (typeof cfg.gates[gate] !== 'boolean') throw new Error(`Domain ${domain} missing gate ${gate}.`);
    }
    if (cfg.stage === 'production-enabled') {
      if (!cfg.runtime.production) throw new Error(`Domain ${domain} marked production-enabled but production runtime is false.`);
      for (const gate of DOMAIN_GATES) {
        if (!cfg.gates[gate]) throw new Error(`Production domain is not fully verified: ${domain} gate ${gate} is false.`);
      }
    }
  }
}

function domainRuntimeEnabled(contract, domain, env = 'preview') {
  if (!contract || !SCIENCE_DOMAINS.includes(domain)) return false;
  const cfg = contract.domains?.[domain];
  if (!cfg) return false;
  if (env === 'production') {
    return cfg.stage === 'production-enabled' && cfg.runtime?.production === true;
  }
  return (cfg.stage === 'experimental' || cfg.stage === 'verified-runtime' || cfg.stage === 'production-enabled') &&
    cfg.runtime?.preview === true;
}

function validateContract(contract) {
  if (!contract || typeof contract !== 'object') throw new Error('Contract must be an object.');
  const runId = normalizeRunId(contract.runId);
  if (typeof contract.version !== 'number' || contract.version < 1) throw new Error(`Invalid version for ${runId}.`);
  if (typeof contract.enabled !== 'boolean') throw new Error(`Contract ${runId} missing enabled flag.`);
  if (typeof contract.sourceEvidence !== 'string' || !contract.sourceEvidence) throw new Error(`Contract ${runId} missing sourceEvidence.`);
  const mechanicType = String(contract.mechanic?.type || '');
  if (!mechanicHandlers.has(mechanicType)) throw new Error(`Unknown mechanic type for ${runId}: ${mechanicType}.`);
  validateAge5Navigator(contract.navigator);
  validateDomains(contract.domains);
  if (contract.telemetry?.pii !== false) throw new Error('Science telemetry must disable PII.');
  for (const gate of REQUIRED_GATES) {
    if (typeof contract.completionGates?.[gate] !== 'boolean') throw new Error(`Missing completion gate ${gate}.`);
    if (contract.enabled && contract.completionGates[gate] !== true) throw new Error(`Enabled ${runId} has incomplete gate ${gate}.`);
  }
  return contract;
}

function contractPath(runId) {
  return path.join(CONTRACT_DIR, `${normalizeRunId(runId)}.gameplay.json`);
}

function loadContract(runId) {
  const id = normalizeRunId(runId);
  if (contractCache.has(id)) return contractCache.get(id);
  const contract = validateContract(JSON.parse(fs.readFileSync(contractPath(id), 'utf8')));
  contractCache.set(id, contract);
  return contract;
}

function evidenceFor(contract) {
  if (evidenceCache.has(contract.sourceEvidence)) return evidenceCache.get(contract.sourceEvidence);
  const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, contract.sourceEvidence), 'utf8'));
  evidenceCache.set(contract.sourceEvidence, evidence);
  return evidence;
}

function isVerified(contract) {
  if (!contract.enabled) return false;
  return contract.science?.verifiedPassRequired === false || evidenceFor(contract)?.pass === true;
}

function listContractIds() {
  if (!fs.existsSync(CONTRACT_DIR)) return [];
  return fs.readdirSync(CONTRACT_DIR)
    .map(name => name.match(/^(RUN_\d{3})\.gameplay\.json$/)?.[1])
    .filter(Boolean).sort();
}

function publicRun(contract) {
  const verified = isVerified(contract);
  return {
    runId: contract.runId,
    active: verified,
    verified,
    mechanic: contract.mechanic.type,
    navigator: {
      audienceAge: 5,
      intro: contract.navigator.intro,
      damage: contract.navigator.damage,
      regrow: contract.navigator.regrow,
      scienceNote: contract.navigator.scienceNote,
      domains: contract.navigator.domains
    },
    eligibleBlockTypes: [...(contract.mechanic.eligibleBlockTypes || [])],
    domains: Object.fromEntries(SCIENCE_DOMAINS.map(domain => [domain, contract.domains[domain]])),
    completionGates: contract.completionGates
  };
}

function listPublicRuns() {
  const runs = [];
  for (const id of listContractIds()) {
    try { runs.push(publicRun(loadContract(id))); }
    catch { /* malformed future contracts fail closed without breaking the world */ }
  }
  return runs;
}

function getActiveContract(runId) {
  const contract = loadContract(runId);
  return isVerified(contract) ? contract : null;
}

function getActiveContractsForEvent(event) {
  const wanted = String(event || '');
  const contracts = [];
  for (const id of listContractIds()) {
    try {
      const contract = getActiveContract(id);
      if (contract && contract.mechanic?.event === wanted) contracts.push(contract);
    } catch { /* malformed future contract stays inactive */ }
  }
  return contracts;
}

function registerMechanicHandler(type, handler) {
  const id = String(type || '');
  if (!/^[a-z0-9_]{3,64}$/.test(id) || typeof handler !== 'function') throw new Error('Invalid science gameplay mechanic handler.');
  mechanicHandlers.set(id, handler);
}

function normalizeNodes(nodes, eligible) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(nodes) ? nodes : []) {
    const node = { x: Number(raw.x), y: Number(raw.y), z: Number(raw.z), blockType: Number(raw.blockType ?? raw.block_type) };
    if (![node.x, node.y, node.z, node.blockType].every(Number.isInteger) || !eligible.has(node.blockType)) continue;
    const k = key(node); if (seen.has(k)) continue; seen.add(k); out.push(node);
  }
  return out;
}

function components(nodes) {
  const occupied = new Map(nodes.map(n => [key(n), n]));
  const component = new Map(), sizes = [];
  let id = 0;
  for (const start of nodes) {
    const startKey = key(start); if (component.has(startKey)) continue;
    const queue = [start]; component.set(startKey, id); let size = 0;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]; size++;
      for (const [dx, dz] of CARDINAL) {
        const nk = `${node.x + dx},${node.y},${node.z + dz}`;
        if (!occupied.has(nk) || component.has(nk)) continue;
        component.set(nk, id); queue.push(occupied.get(nk));
      }
    }
    sizes[id] = size; id++;
  }
  return { component, sizes };
}

function largestConnectedRatio(nodes) {
  if (!nodes.length) return 0;
  const { sizes } = components(nodes);
  return Math.max(...sizes, 0) / nodes.length;
}

function deterministicJitter(runId, x, y, z) {
  let h = 2166136261;
  for (const ch of `${runId}:${x}:${y}:${z}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

function blockedByPlayer(candidate, player) {
  if (!player) return false;
  const px = Number(player.x), py = Number(player.y), pz = Number(player.z);
  if (![px, py, pz].every(Number.isFinite)) return false;
  return Math.abs(candidate.x + 0.5 - px) < 0.8 &&
    Math.abs(candidate.z + 0.5 - pz) < 0.8 &&
    candidate.y + 1 > py && candidate.y < py + 1.9;
}

function normalizeEmptyCells(cells) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(cells) ? cells : []) {
    const cell = { x: Number(raw.x), y: Number(raw.y), z: Number(raw.z) };
    if (![cell.x, cell.y, cell.z].every(Number.isInteger)) continue;
    const k = key(cell); if (seen.has(k)) continue; seen.add(k); out.push(cell);
  }
  return out;
}

function scienceResult(contract, phase, nodes, effects, beforeLcc, afterLcc = beforeLcc) {
  const domainSignals = phase === 'regrow'
    ? ['playerDestruction', 'visualDestruction', 'recoveryAnimation']
    : ['playerDestruction', 'visualDestruction'];
  return {
    runId: contract.runId, phase, domainSignals, effects,
    navigator: { audienceAge: 5, text: phase === 'damage' ? contract.navigator.damage : contract.navigator.regrow, scienceNote: contract.navigator.scienceNote },
    metrics: { localNodes: nodes.length, beforeLcc, afterLcc, cycleClosures: effects.length },
    telemetry: { event: contract.telemetry.event, runId: contract.runId, phase, effectCount: effects.length, localNodes: nodes.length, beforeLcc, afterLcc, cycleClosures: effects.length }
  };
}

function proposeCycleClosure(contract, context) {
  if (context?.event !== contract.mechanic.event) return null;
  const eligible = new Set(contract.mechanic.eligibleBlockTypes || []);
  const previousBlockType = Number(context.previousBlockType);
  if (!eligible.has(previousBlockType)) return null;
  const nodes = normalizeNodes(context.nodes, eligible);
  if (nodes.length < Number(contract.mechanic.minNetworkNodes || 4)) return null;
  const beforeLcc = largestConnectedRatio(nodes);
  const emptyCells = normalizeEmptyCells(context.emptyCells);
  if (!emptyCells.length) return scienceResult(contract, 'damage', nodes, [], beforeLcc);

  const occupied = new Map(nodes.map(n => [key(n), n]));
  const { component } = components(nodes);
  const removedKey = context.removed ? key(context.removed) : '';
  const candidates = [];
  for (const candidate of emptyCells) {
    const ck = key(candidate);
    if (ck === removedKey || occupied.has(ck) || blockedByPlayer(candidate, context.playerPosition)) continue;
    const neighborKeys = CARDINAL
      .map(([dx, dz]) => `${candidate.x + dx},${candidate.y},${candidate.z + dz}`)
      .filter(nk => occupied.has(nk));
    if (neighborKeys.length < Number(contract.mechanic.minCycleClosingNeighbors || 2)) continue;
    const counts = new Map();
    for (const nk of neighborKeys) {
      const cid = component.get(nk);
      counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    if (![...counts.values()].some(count => count >= 2)) continue;
    const distance = context.removed
      ? Math.hypot(candidate.x - context.removed.x, candidate.z - context.removed.z)
      : 0;
    const score = redundantCandidateScore({
      neighborCount: neighborKeys.length,
      radiusGrid: distance,
      random01: deterministicJitter(contract.runId, candidate.x, candidate.y, candidate.z)
    });
    candidates.push({ ...candidate, neighborCount: neighborKeys.length, score });
  }

  const maxEffects = Math.max(0, Math.min(4, Number(contract.mechanic.maxEffectsPerEvent || 1)));
  const selected = candidates.sort((a, b) => b.score - a.score).slice(0, maxEffects);
  if (!selected.length) return scienceResult(contract, 'damage', nodes, [], beforeLcc);
  const blockType = eligible.has(previousBlockType) ? previousBlockType : Number(contract.mechanic.fallbackBlockType || 10);
  const effects = selected.map(c => ({
    type: 'set_block', x: c.x, y: c.y, z: c.z,
    blockType, reason: 'cycle_closure', neighborCount: c.neighborCount
  }));
  const afterNodes = nodes.concat(effects.map(e => ({ ...e, blockType: e.blockType })));
  const afterLcc = largestConnectedRatio(afterNodes);
  return scienceResult(contract, 'regrow', nodes, effects, beforeLcc, afterLcc);
}

registerMechanicHandler('redundant_cycle_closure', proposeCycleClosure);

function handleEvent(runId, context) {
  const contract = getActiveContract(runId);
  if (!contract) return null;
  const handler = mechanicHandlers.get(contract.mechanic.type);
  return handler ? handler(contract, context) : null;
}

function clearCaches() {
  contractCache.clear();
  evidenceCache.clear();
}

module.exports = {
  REQUIRED_GATES,
  SCIENCE_DOMAINS,
  DOMAIN_STAGES,
  DOMAIN_GATES,
  normalizeRunId,
  validateAge5Navigator,
  validateDomains,
  domainRuntimeEnabled,
  validateContract,
  loadContract,
  listContractIds,
  listPublicRuns,
  getActiveContract,
  getActiveContractsForEvent,
  registerMechanicHandler,
  isVerified,
  largestConnectedRatio,
  handleEvent,
  _private: { normalizeNodes, normalizeEmptyCells, components, deterministicJitter, proposeCycleClosure, blockedByPlayer, clearCaches }
};
