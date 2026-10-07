# Meta6 — техническая архитектура living-relations

Этот документ объясняет **как устроен Meta6 MVP**, какие части можно переиспользовать и какие границы нельзя нарушать.

Живая версия:
https://mpaykin1.github.io/meta6/

Сохранённый World Server source:
`apps/chain-reaction-meta6-living-relations/index.html`

## 1. High-level flow

    input
    -> selected glyph action
    -> world-space coordinate
    -> live AI prediction
    -> NO / YES
    -> object creation
    -> relation discovery
    -> relation effects
    -> relation renderer
    -> population/resource updates
    -> local report
    -> successor action replacement

Это один vertical slice. Не разрывать его на несвязанные подсистемы без необходимости.

## 2. State

Ключевые группы state:

### World

- turn
- population
- food
- energy
- water
- ecology
- hope
- objects[]
- relations[]
- history[]

### Camera

- x
- y
- zoom

### Action UI

- deck[5]
- selected action
- pending action
- pending button
- offer cursor
- used history

### IDs

- nextObjectId
- nextRelationId

### AI

- lastAI provider/prediction/timestamp

## 3. Coordinate model

Все объекты и жители должны жить в **world-space**.

Камера хранит отдельный центр и zoom.

Forward transform:

    screen.x = (world.x - camera.x) * zoom + viewportCenter.x
    screen.y = (world.y - camera.y) * zoom + viewportCenter.y

Inverse transform:

    world.x = (screen.x - viewportCenter.x) / zoom + camera.x
    world.y = (screen.y - viewportCenter.y) / zoom + camera.y

Любая новая spatial feature должна использовать эти функции, а не invent local offsets.

## 4. Input model

Meta6 сохраняет:

- pointer events;
- pointer capture;
- one-finger pan;
- two-pointer pinch;
- tap-vs-drag threshold;
- fixed browser viewport;
- world coordinate from tap;
- buttons activated through pointer interaction.

Card selection и canvas placement — разные стадии.

Не создавать объект в момент нажатия карточки.

## 5. Action lifecycle

    card selected
    -> selected = kind
    -> tap world
    -> pending { kind, x, y }
    -> livePredict()
    -> modal
    -> NO => pending cleared
    -> YES => apply(kind,x,y)

Important:

- до YES никаких world mutations;
- AI не вызывает `apply()`;
- retry AI не расходует action;
- NO не заменяет slot.

## 6. AI request

Endpoint:

`/api/chain-ai`

Mode:

`predict_action`

Input conceptually:

    {
      action: {
        kind,
        name,
        glyph,
        location
      },
      worldContext: {
        turn,
        population,
        power,
        water,
        food,
        eco,
        budget,
        visible
      }
    }

Response:

    {
      ok: true,
      provider,
      prediction,
      executed: false
    }

Client renders summary/immediate/later/risks/surprise.

## 7. Object model

Object minimal contract:

    {
      id,
      k,        // kind
      x,
      y,
      s,        // scale
      born
    }

Objects are authoritative spatial anchors for:

- render;
- interaction;
- migration;
- relation discovery;
- report.

## 8. Relation model

Relation minimal contract:

    {
      id,
      a,        // object id
      b,        // object id
      type,
      label,
      born
    }

Relation is persistent world state.

Do not derive every frame from proximity alone after creation.

### Why persistent relations matter

A persistent relation can later accumulate:

- intensity;
- health;
- capacity;
- flow rate;
- cooldown;
- history;
- delayed events;
- spawned secondary objects;
- path references.

That is the intended growth path.

## 9. Relation discovery

Current MVP:

1. new object created;
2. iterate existing objects;
3. build normalized kind-pair key;
4. look up `interactionSpecs`;
5. check distance <= `RELATION_RANGE`;
6. ensure pair relation does not already exist;
7. create relation;
8. apply one-time relation effect;
9. render relation persistently.

Current relation range is deliberately generous for MVP visibility.

Future versions may replace simple distance with:
- path distance;
- terrain reachability;
- watershed;
- power network;
- road network;
- line-of-sight;
- influence radius.

But do not delete relation persistence.

## 10. Interaction registry

Concept:

    normalizedPair -> {
        type,
        label,
        effect
    }

Advantages:
- declarative;
- inspectable;
- easy tests;
- easy future AI-assisted recipe generation;
- no giant nested conditionals.

Long-term this should become data-driven.

## 11. Visual relation layer

`drawRelations()` runs before object drawing.

Reusable primitives:

- solid line;
- dashed line;
- moving dots;
- glow;
- smoke;
- branches;
- labels.

Each relation renderer maps relation semantics to visible motion.

Example:

### forest-city
- pathway;
- moving flow dots;
- label: people + wood.

### volcano-city
- hazard dash;
- ash flow;
- red city glow;
- evacuation label.

### energy-city
- bright power line;
- fast pulses.

### river-farm
- blue irrigation link;
- channel branches.

### road-city
- road connector;
- transport dots.

### fire-forest
- sparks;
- glow;
- smoke.

This is the beginning of a visual causal language.

## 12. Simulation effects

Current relation effects are mostly one-time.

That is acceptable for MVP, but next architecture should split:

### onCreate relation effect
one-time transition.

### continuous relation effect
per tick / per interval.

### threshold event
when intensity/resource/health crosses limit.

Example future:

    river-farm:
      onCreate: irrigation enabled
      continuous: +food if water available
      threshold: flood if water > X

Do not fake this as animation-only once persistent simulation is added.

## 13. Population

People are world-space agents with:

- x/y;
- vx/vy;
- target object id.

Attractors and repulsors influence movement.

Relation system should eventually modify routing priorities.

Examples:
- road relation lowers travel cost;
- volcano relation increases evacuation priority;
- bridge relation creates new reachable path;
- market relation creates logistics trip demand.

## 14. Action deck architecture

Meta6 changed the deck from batch to slot replacement.

Initial:

    slots[0..4]

After action:
- consumed slot is remembered;
- `chooseSuccessor(consumedKind)`;
- only that slot is replaced.

Four untouched choices stay stable.

This is an important UX invariant.

## 15. Successor selection

Current selector uses deterministic preference map.

It prioritizes semantically related developments.

Future hierarchy:

1. hard safety/availability filters;
2. local context;
3. current deficits;
4. prior action;
5. relation opportunities;
6. AI ranking as optional advisory layer;
7. deterministic fallback.

AI must not be required for deck continuity.

## 16. Report

Report is viewport-local.

It includes:
- people visible;
- moving people;
- visible objects;
- visible living relations;
- current global resources;
- recent local events;
- camera state.

Do not silently turn it into a global report.

## 17. Debug API

Meta6 exposes a debug surface for testing.

Expected capabilities include:
- state;
- camera;
- people;
- world/screen transforms;
- visible objects/counts;
- report;
- relation state;
- select action;
- open forecast;
- apply action;
- successor chooser;
- relation discovery;
- AI URL.

Keep a debug API or equivalent test seam in future versions.

## 18. Separation of concerns

Recommended extraction if Meta6 grows:

- `camera-controller.js`
- `input-controller.js`
- `action-deck.js`
- `ai-prediction-client.js`
- `world-state.js`
- `object-renderers.js`
- `relation-registry.js`
- `relation-system.js`
- `relation-renderers.js`
- `population-system.js`
- `report-system.js`

But extraction must preserve behavior. Do not refactor first and re-create bugs.

## 19. Known technical debt

- single-file HTML is large;
- interaction registry embedded client-side;
- relation range is coarse;
- effects mostly one-time;
- no authoritative persistent server state for Meta6;
- no graph-based routing;
- visual cargo is proxy, not entity;
- no physical propagation fields;
- no automatic relation cleanup;
- no relation priority/z-order system;
- no interaction performance budget yet.

## 20. Safe next technical step

The safest progression is:

    current persistent relation
    -> add relation intensity/capacity
    -> add timed tick
    -> add visible flow entities
    -> add path/network
    -> add delayed consequences
    -> add spawned secondary object
    -> authoritative persistence

Do not jump directly to a giant simulation rewrite.
