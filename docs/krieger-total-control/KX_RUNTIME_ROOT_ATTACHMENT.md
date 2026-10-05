# KX Runtime Root Attachment

This layer makes an authored native Scene reachable without rewriting the original game graph.

For the pinned `kkrieger3383.kx`, root slot 2 is the game root and points at the original final `Demo 0x0d` operator. The attachment algorithm:

1. finds an existing reachable `IPP Viewport 0xf0` under that root;
2. clones its exact target-specific packed parameters, animation payload and optional secondary input contract;
3. creates a new Viewport whose first input is the authored Scene;
4. creates a new variadic `Demo 0x0d` with inputs `[oldGameRoot, authoredViewport]`;
5. switches only root slot 2 to that new Demo;
6. reparses the entire compact KX byte-for-byte.

This preserves the old game root as an input instead of editing 5,174 original operators.

A green structural gate proves **runtime reachability**, not visual acceptance. Browser/WASM rendering remains a separate evidence layer and the result records `browserRenderProven:false` until that is observed.
