# KRIEGER Browser/WebGL proof

This is the product-path execution gate. It deliberately follows the pinned upstream Pages toolchain: Emscripten 6.0.9, release `wasm/build.sh`, WebGL2 and Chromium/SwiftShader through the upstream `wasm/cdp.js` driver.

The gate first builds and runs the untouched `kkrieger3383.kx` as an explicit capability-OFF ablation. It reaches `CurrentRoot=2`, produces a screenshot, and immediately takes a second screenshot in the same CDP session without reload, input, or a scripted delay. This A/A pair measures the residual capture/render noise. The authored/attached KX is then built and captured separately. It too must reach `CurrentRoot=2` and produce a screenshot. The authored-vs-capability-OFF mean RGB signal must exceed both 1 channel level and five times the same-session A/A noise floor. The authored screenshot must retain at least 60% of the capability-OFF visible-pixel coverage. In addition, the proof finds the largest high-contrast 4-connected change in the central gameplay region and computes a user-noticeability score from its screen area (70%) and local RGB contrast (30%); that score must be at least 85/100. Failure of any control or threshold fails the gate.

The A/A pair is captured on consecutive CDP screenshot commands in one session, so it excludes cross-session startup timing and scripted waits. The OFF/ON ablation still requires separate official builds; the noise-floor comparison is a conservative guard, not a claim that every runtime source of nondeterminism is eliminated. Browser output is technical evidence only. Human/owner PASS is still required before `CONTROL_PROVEN` promotion or success-memory commit.

The pinned upstream headless browser has one known pointer-lock `WrongDocumentError`; that baseline-equivalent exception is tolerated, but any additional browser exception fails the gate.

The authored KX is produced from a semantic Cube + Bevel recipe, serialized as native operators, bridged to a reachable native Krieger material, attached through `Scene_Add -> Viewport -> Demo`, and then embedded by the official upstream build.

The authored screenshot must retain at least 60% of capability-OFF visible-pixel coverage. The screenshot delta is technical evidence only; Human/owner PASS is still required before any `CONTROL_PROVEN` promotion or success-memory commit.
