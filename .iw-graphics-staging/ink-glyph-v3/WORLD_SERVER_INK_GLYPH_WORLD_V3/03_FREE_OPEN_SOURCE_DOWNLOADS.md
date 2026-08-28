# FREE / OPEN-SOURCE SOURCES

## Required brush fonts — SIL OFL
- Liu Jian Mao Cao: https://github.com/google/fonts/tree/main/ofl/liujianmaocao
- Ma Shan Zheng: https://github.com/google/fonts/tree/main/ofl/mashanzheng
- Zhi Mang Xing: https://github.com/google/fonts/tree/main/ofl/zhimangxing
- Long Cang: https://github.com/google/fonts/tree/main/ofl/longcang

## V3 required / automated
- opentype.js 2.0.0: https://github.com/opentypejs/opentype.js
- Hanzi Writer Data 2.0.1: https://github.com/chanind/hanzi-writer-data
- Hanzi Writer Data npm: https://www.npmjs.com/package/hanzi-writer-data
- FontTools: https://github.com/fonttools/fonttools
- meshoptimizer / gltfpack upstream: https://github.com/zeux/meshoptimizer
- gltfpack 1.2.0: https://www.npmjs.com/package/gltfpack
- meshoptimizer 1.2.0: https://www.npmjs.com/package/meshoptimizer

## Recommended next
- recast-navigation-js: https://github.com/isaac-mason/recast-navigation-js
- @recast-navigation/three: https://www.npmjs.com/package/@recast-navigation/three
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh

## License rules
- Google brush fonts: retain their SIL OFL files.
- opentype.js / meshoptimizer / gltfpack: retain MIT license/provenance.
- Hanzi Writer Data: **Arphic Public License**, not MIT; retain `ARPHICPL.TXT` unchanged.
- Do not download fonts/assets from unofficial mirrors when an upstream source is available.

## Candidate next navigation/collision stack (verified 2026-08-26)
- navcat 0.4.1 (MIT, pure JS): https://www.npmjs.com/package/navcat
- recast-navigation 0.43.1 (MIT, WASM): https://www.npmjs.com/package/recast-navigation
- @recast-navigation/three 0.43.1 (MIT): https://www.npmjs.com/package/@recast-navigation/three
- three-mesh-bvh 0.9.14 (MIT): https://www.npmjs.com/package/three-mesh-bvh
Do not add all backends blindly. Benchmark navcat vs Recast on representative desktop/mobile worlds, select one primary backend, and keep V3 CPU A* as fallback.
