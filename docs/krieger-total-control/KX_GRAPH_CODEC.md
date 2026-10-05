# KX Graph Codec — byte-identical round trip

Before World Server writes new Krieger operator instances, it must prove that it can parse every compact document section and serialize it without drift.

The codec follows the pinned current-player `KDoc::Init` dialect:

`header/class table -> operator types+connections -> links -> class-sorted packed params -> animation bytecode -> events -> splines -> blobs`.

It parses graph connectivity and keeps exact raw payloads for lossless reconstruction. Its acceptance gate is strict: all pinned real donor `.kx` files must serialize **byte-for-byte identical** to their source.

This deliberately precedes mutation. New operator insertion remains disabled until this round-trip gate stays green.


## 2004 beta boundary

`data/kkrieger_beta.kx` is intentionally not treated as a current-format document. The pinned upstream labels it the raw 2004 player-data dialect and ships `wasm/tools/kxconv.py` to convert it. The active WASM build embeds `kkrieger_beta_conv.kx`, not the raw beta file.

CI therefore proves both paths:

1. byte-identical round-trip for `debris_chaos.kx`, `intro.kx`, `kkrieger3383.kx`, and `kkrieger_beta_conv.kx`;
2. deterministic upstream conversion `kkrieger_beta.kx -> kkrieger_beta_conv.kx` followed by the same byte-identical codec gate.
