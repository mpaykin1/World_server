'use strict';

const fs = require('fs');
const path = require('path');
const { redundantCandidateScore } = require('./science-h2-redundant-rule');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_DIR = path.join(ROOT, 'science', 'gameplay');
const REQUIRED_GATES = [
  'scienceEvidence',
  'productionRuntime',
  'visibleEffect',
  'playerInteraction',
  'navigatorAge5',
  'telemetry',
  'regressionTests'
];
const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const contractCache = new Map();
const evidenceCache = new Map();
const mechanicHandlers = new Map();

function normalizeRunId(value) {
  const match = String(value || '').toUpperCase().match(/^RUN[_-]?(\d{3})$/);
  if (!match) throw new Error('Invalid science run id.');
  return `RUN_${match[1]}`;
}

function key(node) { return `${node.x},${node.y},${node.z}`; }
function validateAge5Navigator(navigator) {
  if (!navigator || navigator.audienceAge !== 5) throw new Error('Navigator audienceAge must be 5.');
  const texts = [navigator.intro, navigator.regrow, navigator.scienceNote].filter(Boolean);
  if (texts.length < 3) throw new Error('Navigator needs intro, regrow and scienceNote.');
  const jargon = [/\bLCC\b/i, /cycle\s*rank/i, /крупнейш\S*\s+связн\S*\s+компонент/i, /избыточн\S*\s+связност/i];
  for (const text of texts) {
    for (const sentence of String(text).split(/[.!?]+/).map(s => s.trim()).filter(Boolean)) {
      if (sentence.split(/\s+/).length > 18) throw new Error('Navigator sentence is too long for age-5 mode.');
    }
    if (jargon.some(rx => rx.test(text))) throw new Error('Navigator contains unexplained scientific jargon.');
  }
  return true;
}

function validateContract(contract) {
  const runId = normalizeRunId(contract?.runId);
  if (contract.runId !== runId) throw new Error(`Contract runId must be ${runId}.`);
  if (!/^[A-Z0-9_.-]+\.json$/.test(String(contract.sourceEvidence || ''))) throw new Error('Invalid sourceEvidence.');
  const mechanicType = String(contract.mechanic?.type || '');
  if (!/^[a-z0-9_]{3,64}$/.test(mechanicType)) throw new Error(`Invalid mechanic type for ${runId}.`);
  if (contract.enabled && !mechanicHandlers.has(mechanicType)) throw new Error(`Unsupported mechanic for ${runId}: ${mechanicType}.`);
  validateAge5Navigator(contract.navigator);
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
      regrow: contract.navigator.regrow,
      scienceNote: contract.navigator.scienceNote
    },
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

function proposeCycleClosure(contract, context) {
  if (context?.event !== contract.mechanic.event) return null;
  const eligible = new Set(contract.mechanic.eligibleBlockTypes || []);
  const previousBlockType = Number(context.previousBlockType);
  if (!eligible.has(previousBlockType)) return null;
  const nodes = normalizeNodes(context.nodes, eligible);
  if (nodes.length < Number(contract.mechanic.minNetworkNodes || 4)) return null;
  const emptyCells = normalizeEmptyCells(context.emptyCells);
  if (!emptyCells.length) return null;

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
  if (!selected.length) return null;
  const blockType = eligible.has(previousBlockType) ? previousBlockType : Number(contract.mechanic.fallbackBlockType || 10);
  const effects = selected.map(c => ({
    type: 'set_block', x: c.x, y: c.y, z: c.z,
    blockType, reason: 'cycle_closure', neighborCount: c.neighborCount
  }));
  const afterNodes = nodes.concat(effects.map(e => ({ ...e, blockType: e.blockType })));
  const beforeLcc = largestConnectedRatio(nodes);
  const afterLcc = largestConnectedRatio(afterNodes);
  return {
    runId: contract.runId,
    phase: 'regrow',
    effects,
    navigator: {
      audienceAge: 5,
      text: contract.navigator.regrow,
      scienceNote: contract.navigator.scienceNote
    },
    metrics: { localNodes: nodes.length, beforeLcc, afterLcc, cycleClosures: effects.length },
    telemetry: {
      event: contract.telemetry.event,
      runId: contract.runId,
      phase: 'regrow',
      effectCount: effects.length,
      localNodes: nodes.length,
      beforeLcc,
      afterLcc,
      cycleClosures: effects.length
    }
  };
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
  normalizeRunId,
  validateAge5Navigator,
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
