'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeLogicGraph, normalizeGraph } = require('../lib/visual-logic-graph');
const { buildEmergenceState, placeMacroEntity } = require('../lib/world-emergence');

function link(id, kind, fromNode, fromPort, toNode, toPort) {
  return {
    id,
    kind,
    from: { node: fromNode, port: fromPort },
    to: { node: toNode, port: toPort }
  };
}

test('visual logic graph branches event flow using value ports', () => {
  const graph = {
    id: 'branch-demo',
    nodes: [
      { id: 'start', type: 'event:start' },
      { id: 'population', type: 'value:constant', props: { value: 120 } },
      { id: 'limit', type: 'value:constant', props: { value: 100 } },
      { id: 'compare', type: 'logic:compare', props: { operator: '>' } },
      { id: 'branch', type: 'flow:branch' },
      { id: 'danger', type: 'value:constant', props: { value: 'evacuate' } },
      { id: 'set-danger', type: 'world:set', props: { path: 'story.status' } }
    ],
    links: [
      link('l1', 'event', 'start', 'out', 'branch', 'in'),
      link('l2', 'value', 'population', 'value', 'compare', 'a'),
      link('l3', 'value', 'limit', 'value', 'compare', 'b'),
      link('l4', 'value', 'compare', 'value', 'branch', 'condition'),
      link('l5', 'event', 'branch', 'true', 'set-danger', 'in'),
      link('l6', 'value', 'danger', 'value', 'set-danger', 'value')
    ]
  };

  const result = executeLogicGraph(graph, { state: { story: {} } });
  assert.equal(result.state.story.status, 'evacuate');
  assert.equal(result.steps, 3);
});

test('world action adapter connects graph logic to existing emergence state', () => {
  const graph = {
    id: 'macro-place-demo',
    nodes: [
      { id: 'start', type: 'event:start' },
      {
        id: 'forest-payload',
        type: 'value:constant',
        props: { value: { type: 'forest', x: 45, z: 0, ownerId: 'logic-graph' } }
      },
      { id: 'place', type: 'world:action', props: { action: 'macro_place' } }
    ],
    links: [
      link('l1', 'event', 'start', 'out', 'place', 'in'),
      link('l2', 'value', 'forest-payload', 'value', 'place', 'payload')
    ]
  };
  const state = buildEmergenceState({ entities: [{ type: 'city', x: 0, z: 0 }], seed: 7 });
  const result = executeLogicGraph(graph, {
    state,
    adapter: {
      actions: {
        macro_place: ({ state: current, payload }) => ({
          state: placeMacroEntity(current, payload, 7),
          effect: { kind: 'macro_place', type: payload.type }
        })
      }
    }
  });

  assert.equal(result.state.entities.length, 2);
  assert.equal(result.state.relations.length, 1);
  assert.equal(result.effects[0].action, 'macro_place');
  assert.equal(result.effects[0].result.type, 'forest');
});

test('graph validation rejects wrong event/value wiring before execution', () => {
  assert.throws(() => normalizeGraph({
    nodes: [
      { id: 'start', type: 'event:start' },
      { id: 'constant', type: 'value:constant', props: { value: 1 } }
    ],
    links: [
      link('bad', 'event', 'constant', 'value', 'start', 'out')
    ]
  }), /Invalid output port|Invalid input port/);
});

test('value dependency cycles are stopped deterministically', () => {
  const graph = {
    nodes: [
      { id: 'start', type: 'event:start' },
      { id: 'a', type: 'logic:not' },
      { id: 'b', type: 'logic:not' },
      { id: 'branch', type: 'flow:branch' }
    ],
    links: [
      link('e1', 'event', 'start', 'out', 'branch', 'in'),
      link('v1', 'value', 'a', 'value', 'b', 'value'),
      link('v2', 'value', 'b', 'value', 'a', 'value'),
      link('v3', 'value', 'a', 'value', 'branch', 'condition')
    ]
  };
  assert.throws(() => executeLogicGraph(graph), /Value cycle detected/);
});

test('editor coordinates survive normalization without affecting runtime', () => {
  const normalized = normalizeGraph({
    id: 'editor-metadata',
    nodes: [
      { id: 'start', type: 'event:start', editor: { x: 120, y: 60, collapsed: false } }
    ],
    links: []
  });
  assert.deepEqual(normalized.nodes[0].editor, { x: 120, y: 60, collapsed: false });
});
