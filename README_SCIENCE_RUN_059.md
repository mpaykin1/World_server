# RUN_059 — H1 dynamic delta reconstruction

Uses existing production `lib/game-rules.js::generateChunk`; no duplicate generator.

Pre-registered before execution:
- edit seed 59059
- 4 independent chunk-window origins
- radii 2,4,8,16
- ~2% sparse depletion history
- exact reconstruction from procedural rules + history
- negative control: same delta values attached to wrong resource IDs
- baseline: Brotli-compressed full resource state

Confirmation: exact all; wrong-ID control mismatch; radius-16 compressed/full descriptor ratio >=8x; edit rate <=3%; median descriptor growth radius8->16 <=4.8x; median compressed explicit growth >=3.2x. Do not lower thresholds after execution.

Desktop AI:
1. Run `node scripts\science-h1-dynamic-delta-reconstruction.cjs > SCIENCE_RUN_059_H1.json`.
2. Run `node --test test\science-h1-dynamic-delta-reconstruction.test.cjs`.
3. Run `node --test test\game-rules.test.js` and `npm run check`.
4. Save JSON/git SHA/control result to existing evidence/knowledge/root-cause/Collective Brain systems.
5. If `generateChunk` changes, rerun; stale evidence must not silently remain PASS.
6. No new dependencies.
