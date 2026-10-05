# KRIEGER Browser/WebGL proof

This is the product-path execution gate. It deliberately follows the pinned upstream Pages toolchain: Emscripten 6.0.9, release `wasm/build.sh`, WebGL2 and Chromium/SwiftShader through the upstream `wasm/cdp.js` driver.

The gate runs the untouched `kkrieger3383.kx` baseline and then the authored/attached KX in the same browser setup. Both must reach `CurrentRoot=2` and produce screenshots. The pinned upstream headless browser has one known pointer-lock `WrongDocumentError`; that baseline-equivalent exception is tolerated, but any additional browser exception fails the gate. The authored screenshot must retain at least 60% of the baseline visible-pixel coverage so a near-black/occluded frame cannot be reported as browser proof. In addition, the proof finds the largest high-contrast 4-connected change in the central gameplay region and computes a user-noticeability score from its screen area (70%) and local RGB contrast (30%). The browser gate requires that score to be at least 85/100. This prevents tiny animation/timing deltas from being mistaken for an authored object.

The authored KX is produced from a semantic Cube + Bevel recipe, serialized as native operators, bridged to a reachable native Krieger material, attached through `Scene_Add -> Viewport -> Demo`, and then embedded by the official upstream build.

The screenshot delta is recorded as technical evidence only. Human/owner PASS is still required before any `CONTROL_PROVEN` promotion or success-memory commit.