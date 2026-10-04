'use strict';

const DEFAULT_LIMITS = Object.freeze({ nodes: 256, links: 1024, steps: 512 });

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,96}$/.test(value)) {
    throw new Error(`${label} must be a stable id`);
  }
  return value;
}

function normalizePortMap(value = {}) {
  const out = {};
  for (const [name, kind] of Object.entries(value)) {
    assertId(name, 'port');
    if (kind !== 'value' && kind !== 'event') throw new Error(`Unsupported port kind: ${kind}`);
    out[name] = kind;
  }
  return out;
}

function defineNode(type, definition = {}) {
  assertId(type, 'node type');
  return Object.freeze({
    type,
    inputs: Object.freeze(normalizePortMap(definition.inputs)),
    outputs: Object.freeze(normalizePortMap(definition.outputs)),
    evaluate: typeof definition.evaluate === 'function' ? definition.evaluate : null,
    onEvent: typeof definition.onEvent === 'function' ? definition.onEvent : null
  });
}

function compareValues(a, op, b) {
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (op === '>') return Number(a) > Number(b);
  if (op === '>=') return Number(a) >= Number(b);
  if (op === '<') return Number(a) < Number(b);
  if (op === '<=') return Number(a) <= Number(b);
  throw new Error(`Unsupported compare operator: ${op}`);
}

function getPath(target, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let value = target;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

function setPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) throw new Error('world/set requires props.path');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = clone(value);
}

function eventAndValueDefinitions() {
  return [
    defineNode('event:start', { outputs: { out: 'event' } }),
    defineNode('event:tick', { outputs: { out: 'event' } }),
    defineNode('value:constant', {
      outputs: { value: 'value' },
      evaluate: ({ node }) => ({ value: clone(node.props?.value) })
    })
  ];
}

function logicDefinitions() {
  return [
    defineNode('logic:not', {
      inputs: { value: 'value' }, outputs: { value: 'value' },
      evaluate: ({ inputs }) => ({ value: !inputs.value })
    }),
    defineNode('logic:and', {
      inputs: { a: 'value', b: 'value' }, outputs: { value: 'value' },
      evaluate: ({ inputs }) => ({ value: Boolean(inputs.a && inputs.b) })
    }),
    defineNode('logic:or', {
      inputs: { a: 'value', b: 'value' }, outputs: { value: 'value' },
      evaluate: ({ inputs }) => ({ value: Boolean(inputs.a || inputs.b) })
    }),
    defineNode('logic:compare', {
      inputs: { a: 'value', b: 'value' }, outputs: { value: 'value' },
      evaluate: ({ node, inputs }) => ({
        value: compareValues(inputs.a, node.props?.operator || '==', inputs.b)
      })
    })
  ];
}

function flowDefinitions() {
  return [
    defineNode('flow:branch', {
      inputs: { in: 'event', condition: 'value' },
      outputs: { true: 'event', false: 'event' },
      onEvent: ({ inputs, emit, event }) => emit(inputs.condition ? 'true' : 'false', event.payload)
    }),
    defineNode('flow:sequence', {
      inputs: { in: 'event' }, outputs: { first: 'event', second: 'event' },
      onEvent: ({ emit, event }) => {
        emit('first', event.payload);
        emit('second', event.payload);
      }
    })
  ];
}

function worldDefinitions() {
  return [
    defineNode('world:get', {
      outputs: { value: 'value' },
      evaluate: ({ node, state }) => ({ value: clone(getPath(state, node.props?.path)) })
    }),
    defineNode('world:set', {
      inputs: { in: 'event', value: 'value' }, outputs: { out: 'event' },
      onEvent: ({ node, inputs, state, emit, event }) => {
        setPath(state, node.props?.path, inputs.value);
        emit('out', event.payload);
      }
    }),
    defineNode('world:action', {
      inputs: { in: 'event', payload: 'value' }, outputs: { out: 'event' },
      onEvent: ({ node, inputs, state, adapter, emit, event, effects }) => {
        const name = String(node.props?.action || '');
        const action = adapter?.actions?.[name];
        if (typeof action !== 'function') throw new Error(`Unknown world action: ${name}`);
        const result = action({ state, payload: clone(inputs.payload), event: clone(event.payload), node: clone(node) });
        if (result?.state && typeof result.state === 'object') Object.assign(state, clone(result.state));
        effects.push({ nodeId: node.id, action: name, result: clone(result?.effect ?? result ?? null) });
        emit('out', result?.payload ?? event.payload);
      }
    })
  ];
}

function builtinDefinitions() {
  return [
    ...eventAndValueDefinitions(),
    ...logicDefinitions(),
    ...flowDefinitions(),
    ...worldDefinitions()
  ];
}

function createRegistry(extraDefinitions = []) {
  const registry = new Map();
  for (const definition of [...builtinDefinitions(), ...extraDefinitions]) {
    if (!definition?.type) throw new Error('Invalid node definition');
    if (registry.has(definition.type)) throw new Error(`Duplicate node type: ${definition.type}`);
    registry.set(definition.type, definition);
  }
  return registry;
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid node');
  return {
    id: assertId(raw.id, 'node id'),
    type: assertId(raw.type, 'node type'),
    props: raw.props && typeof raw.props === 'object' ? clone(raw.props) : {},
    editor: raw.editor && typeof raw.editor === 'object' ? clone(raw.editor) : undefined
  };
}

function normalizeEndpoint(raw, label) {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid ${label} endpoint`);
  return {
    node: assertId(raw.node, `${label}.node`),
    port: assertId(raw.port, `${label}.port`)
  };
}

function normalizeLink(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid link');
  const kind = raw.kind || 'value';
  if (kind !== 'value' && kind !== 'event') throw new Error(`Unsupported link kind: ${kind}`);
  return {
    id: assertId(raw.id, 'link id'),
    kind,
    from: normalizeEndpoint(raw.from, 'from'),
    to: normalizeEndpoint(raw.to, 'to')
  };
}

function validateLinkPorts(link, nodes, registry) {
  const fromNode = nodes.get(link.from.node);
  const toNode = nodes.get(link.to.node);
  if (!fromNode || !toNode) throw new Error(`Dangling link: ${link.id}`);
  const fromDef = registry.get(fromNode.type);
  const toDef = registry.get(toNode.type);
  if (!fromDef || !toDef) throw new Error(`Unknown node type on link: ${link.id}`);
  if (fromDef.outputs[link.from.port] !== link.kind) throw new Error(`Invalid output port on ${link.id}`);
  if (toDef.inputs[link.to.port] !== link.kind) throw new Error(`Invalid input port on ${link.id}`);
}

function normalizeGraph(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('Logic graph must be an object');
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const registry = options.registry || createRegistry();
  const nodesArray = Array.isArray(input.nodes) ? input.nodes.map(normalizeNode) : [];
  const links = Array.isArray(input.links) ? input.links.map(normalizeLink) : [];
  if (nodesArray.length > limits.nodes || links.length > limits.links) throw new Error('Logic graph exceeds safety limits');
  const nodes = new Map(nodesArray.map(node => [node.id, node]));
  if (nodes.size !== nodesArray.length) throw new Error('Duplicate node id');
  if (new Set(links.map(link => link.id)).size !== links.length) throw new Error('Duplicate link id');
  for (const node of nodesArray) if (!registry.has(node.type)) throw new Error(`Unknown node type: ${node.type}`);
  for (const link of links) validateLinkPorts(link, nodes, registry);
  return { schemaVersion: '1.0.0', id: String(input.id || 'logic-graph'), nodes: nodesArray, links };
}

function indexGraph(graph) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const link of graph.links) {
    const inKey = `${link.to.node}:${link.to.port}`;
    const outKey = `${link.from.node}:${link.from.port}`;
    if (!incoming.has(inKey)) incoming.set(inKey, []);
    if (!outgoing.has(outKey)) outgoing.set(outKey, []);
    incoming.get(inKey).push(link);
    outgoing.get(outKey).push(link);
  }
  return { incoming, outgoing };
}

function initialEvents(graph, eventName, payload) {
  const type = eventName === 'tick' ? 'event:tick' : 'event:start';
  return graph.nodes
    .filter(node => node.type === type)
    .map(node => ({ nodeId: node.id, port: '$source', payload: clone(payload) }));
}

function executeLogicGraph(input, options = {}) {
  const registry = options.registry || createRegistry(options.extraDefinitions);
  const graph = normalizeGraph(input, { registry, limits: options.limits });
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const index = indexGraph(graph);
  const state = clone(options.state || {});
  const effects = [];
  const queue = initialEvents(graph, options.event || 'start', options.payload);
  const memo = new Map();
  const evaluating = new Set();
  const maxSteps = options.limits?.steps || DEFAULT_LIMITS.steps;

  const evaluate = (nodeId, port) => {
    const key = `${nodeId}:${port}`;
    if (memo.has(key)) return memo.get(key);
    if (evaluating.has(key)) throw new Error(`Value cycle detected at ${key}`);
    evaluating.add(key);
    const node = nodes.get(nodeId);
    const def = registry.get(node.type);
    if (!def.evaluate) throw new Error(`Node ${nodeId} has no value evaluator`);
    const inputs = readInputs(node, def, index.incoming, evaluate);
    const outputs = def.evaluate({ node, inputs, state, adapter: options.adapter }) || {};
    for (const [name, value] of Object.entries(outputs)) memo.set(`${nodeId}:${name}`, clone(value));
    evaluating.delete(key);
    return memo.get(key);
  };

  let steps = 0;
  while (queue.length) {
    if (++steps > maxSteps) throw new Error('Logic graph exceeded execution step limit');
    const event = queue.shift();
    const node = nodes.get(event.nodeId);
    const def = registry.get(node.type);
    if (event.port === '$source') {
      emitFrom(node, def, 'out', event.payload, index.outgoing, queue);
      continue;
    }
    if (!def.onEvent) continue;
    const inputs = readInputs(node, def, index.incoming, evaluate);
    const emit = (port, payload) => emitFrom(node, def, port, payload, index.outgoing, queue);
    def.onEvent({ node, inputs, state, adapter: options.adapter || {}, emit, event, effects });
    memo.clear();
  }

  return { graph, state, effects, steps };
}

function readInputs(node, def, incoming, evaluate) {
  const values = {};
  for (const [port, kind] of Object.entries(def.inputs)) {
    if (kind !== 'value') continue;
    const links = incoming.get(`${node.id}:${port}`) || [];
    if (links.length > 1) throw new Error(`Multiple value links into ${node.id}:${port}`);
    if (links.length === 1) values[port] = evaluate(links[0].from.node, links[0].from.port);
    else if (Object.prototype.hasOwnProperty.call(node.props || {}, port)) values[port] = clone(node.props[port]);
    else values[port] = undefined;
  }
  return values;
}

function emitFrom(node, def, port, payload, outgoing, queue) {
  if (def.outputs[port] !== 'event') throw new Error(`Invalid event output ${node.id}:${port}`);
  const links = outgoing.get(`${node.id}:${port}`) || [];
  for (const link of links) queue.push({ nodeId: link.to.node, port: link.to.port, payload: clone(payload) });
}

module.exports = {
  DEFAULT_LIMITS,
  defineNode,
  createRegistry,
  normalizeGraph,
  executeLogicGraph,
  getPath,
  setPath
};
