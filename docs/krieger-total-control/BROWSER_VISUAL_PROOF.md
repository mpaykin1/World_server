# KRIEGER Browser/WebGL proof

This is the product-path execution gate. It deliberately follows the pinned upstream Pages toolchain: Emscripten 6.0.9, release `wasm/build.sh`, WebGL2 and Chromium/SwiftShader through the upstream `wasm/cdp.js` driver.

The gate runs the untouched `kkrieger3383.kx` baseline and then the authored/attached KX in the same browser setup. Both must reach `CurrentRoot=2`, produce a non-empty screenshot and pixel samples, and have no page exceptions.

The authored KX is produced from a semantic Cube + Bevel recipe, serialized as native operators, attached through `Scene_Add -> Viewport -> Demo`, and then embedded by the official upstream build.

The screenshot delta is recorded as technical evidence only. Human/owner PASS is still required before any `CONTROL_PROVEN` promotion or success-memory commit.
