# KX Runtime Root Attachment

This layer makes an authored native Scene reachable while preserving the original game-root composition.

For the pinned `kkrieger3383.kx`, root slot 2 is the game root and points at the original final `Demo 0x0d` operator. The attachment algorithm:

1. finds the existing reachable `IPP Viewport 0xf0` under that root and requires it to be a direct root input;
2. creates `Scene_Add 0xc1` combining the existing game Scene with the authored Scene;
3. clones the original Viewport byte contract, replacing only its first Scene input with that combined Scene;
4. clones the original game-root operator with the same class, links, packed parameters, animation/blob payload and input order, replacing only the original Viewport input with the cloned Viewport;
5. switches only root slot 2 to the cloned root;
6. reparses the entire compact KX byte-for-byte.

This avoids drawing a second Viewport after the complete game root, which can cover HUD/weapon layers even when both scene graphs are technically reachable.

A green structural gate proves **runtime reachability**, not visual acceptance. Browser/WASM rendering remains a separate evidence layer and the result records `browserRenderProven:false` until that is observed.