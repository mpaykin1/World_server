# Technology references — Integration V6

- Cosign security advisory GHSA-fx35-mq7g-6g98: Cosign <=3.1.2 affected; v3.1.3 patched.
- cosign-installer v4.1.2 supports `cosign-release`; V6 explicitly pins Cosign v3.1.3 instead of its vulnerable older default.
- TLA+ stable v1.7.4 includes a liveness-checking soundness fix; V6 pins the official jar by SHA-256.
- TypeScript 6.0.3: stable compiler API used by the native AST/dataflow adapter.
- Wasmtime 48.0.0: August 2026 LTS channel; local install remains optional/fail-closed.
- Appium 3.6.0: free cross-platform automation server used by the physical-device executor.
- WIT / WASI Component Model remains the typed adapter boundary.

V6 never claims optional native/network/device coverage without machine-readable evidence.

## V7.5 current references (2026-08-24)
- OpenTelemetry Collector agent-to-gateway pattern: https://opentelemetry.io/docs/collector/deploy/other/agent-to-gateway/
- OpenTelemetry eBPF Instrumentation (OBI) 2026 roadmap: https://opentelemetry.io/blog/2026/obi-goals/ — binary presence is not treated as production proof.
- Appium official drivers: UiAutomator2 for Android and XCUITest for iOS: https://appium.io/docs/en/latest/ecosystem/drivers/
