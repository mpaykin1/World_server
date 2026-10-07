# KRIEGER WASM runtime proof

This gate takes native authoring past binary validity and into the real pinned Krieger runtime.

It generates a semantic Cube + Bevel scene, serializes it into `kkrieger3383.kx`, attaches the authored scene to game root 2 through the existing Scene/Viewport/Demo contract, replaces the donor data file, builds the upstream headless Emscripten player with AddressSanitizer, and drives the game until root 2 executes for hundreds of frames.

PASS requires native `.kx` lossless reparse, authored graph reachability, a successful upstream headless WASM build, completed procedural generation, entry into game root 2, level-frame execution, and no ASan/runtime/FATAL markers.

This is runtime execution evidence. Browser/WebGL visual proof remains a separate gate.
