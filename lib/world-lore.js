'use strict';

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function humanizeWorldId(id) {
  return String(id || 'world')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function validateLoreStory(key, story, loreBible) {
  if (!story || typeof story !== 'object') return story;
  const required = Array.isArray(loreBible?.requiredElements) ? loreBible.requiredElements : [];
  const present = new Set(Array.isArray(story.elements) ? story.elements : []);
  const missing = required.filter((element) => !present.has(element));
  if (missing.length) {
    throw new Error(`World lore ${key} missing required elements: ${missing.join(', ')}`);
  }
  return story;
}

function chooseAnchor(id, loreBible) {
  const candidates = Object.keys(loreBible?.worlds || {})
    .filter((candidate) => candidate !== id && WORLD_ID.test(candidate))
    .sort();
  if (!candidates.length) return null;
  let hash = 2166136261;
  for (const char of String(id || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return candidates[hash % candidates.length];
}

function generatedLore(id, baseWorldMenu, loreBible) {
  const required = Array.isArray(loreBible?.requiredElements) ? [...loreBible.requiredElements] : [];
  const title = humanizeWorldId(id);
  const anchor = chooseAnchor(id, loreBible);
  const connections = anchor ? [{
    targetId: anchor,
    story: `${title} shares a newly discovered canon thread with ${humanizeWorldId(anchor)}.`
  }] : [];
  return {
    headline: `${title}: a new chapter in the shared World_server canon`,
    lore: `${title} enters the shared universe with a mystery, a goal, a danger, a choice and an unresolved question. Its discoveries can become durable history and connect to other worlds instead of remaining an isolated scene.`,
    history: `${title} was registered automatically by the World_server lore pipeline so every playable world begins with a coherent place in the wider canon.`,
    elements: required,
    connections,
    loreGenerated: true,
    loreGenerator: 'world-server-deterministic-v1',
    ...(baseWorldMenu || {})
  };
}

function worldMenuWithLore(id, baseWorldMenu, loreBible) {
  const base = baseWorldMenu || null;
  const directKey = loreBible?.worlds?.[id] ? id : null;
  const familyKey = base?.familyId && loreBible?.worlds?.[base.familyId] ? base.familyId : null;
  const key = directKey || familyKey;
  const story = key ? loreBible.worlds[key] : null;
  if (story) {
    validateLoreStory(key, story, loreBible);
    return { ...(base || {}), ...story, loreGenerated: false };
  }
  if (!WORLD_ID.test(String(id || ''))) return base;
  return generatedLore(id, base, loreBible);
}

function buildUniversalLoreGraph(worlds, loreBible) {
  const byId = new Map();
  for (const item of Array.isArray(worlds) ? worlds : []) {
    const id = String(item?.id || '').trim();
    if (!WORLD_ID.test(id) || byId.has(id)) continue;
    byId.set(id, {
      id,
      title: String(item?.title || item?.name || humanizeWorldId(id)).trim() || humanizeWorldId(id),
      worldMenu: item?.worldMenu || null
    });
  }

  const ids = [...byId.keys()].sort();
  const idSet = new Set(ids);
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const nodes = [];
  const edges = [];
  const edgeKeys = new Set();
  for (const id of ids) {
    const item = byId.get(id);
    const menu = worldMenuWithLore(id, item.worldMenu, loreBible) || {};
    nodes.push({
      id,
      title: item.title,
      headline: typeof menu.headline === 'string' ? menu.headline : item.title,
      generatedLore: menu.loreGenerated === true
    });
    for (const connection of Array.isArray(menu.connections) ? menu.connections : []) {
      const targetId = String(connection?.targetId || '').trim();
      if (!idSet.has(targetId) || targetId === id) continue;
      const key = `${id}->${targetId}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        from: id,
        to: targetId,
        relation: 'canon',
        story: typeof connection.story === 'string' ? connection.story : '',
        generated: false
      });
      union(id, targetId);
    }
  }

  // Connect otherwise isolated lore components deterministically. This keeps every
  // published/inventory world inside one weakly-connected canon without inventing
  // hidden public URLs or changing release visibility.
  const representativeByRoot = new Map();
  for (const id of ids) {
    const root = find(id);
    const current = representativeByRoot.get(root);
    if (!current || id.localeCompare(current) < 0) representativeByRoot.set(root, id);
  }
  const representatives = [...representativeByRoot.values()].sort();
  for (let i = 1; i < representatives.length; i += 1) {
    const from = representatives[i - 1];
    const to = representatives[i];
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      from,
      to,
      relation: 'canon-bridge',
      story: `${humanizeWorldId(from)} and ${humanizeWorldId(to)} share an automatically discovered canon bridge.`,
      generated: true
    });
    union(from, to);
  }

  const roots = new Set(ids.map((id) => find(id)));
  return {
    schemaVersion: '1.0.0',
    type: 'UniversalLoreGraph',
    connected: ids.length <= 1 || roots.size === 1,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges
  };
}

module.exports = {
  worldMenuWithLore,
  buildUniversalLoreGraph,
  validateLoreStory,
  humanizeWorldId
};
