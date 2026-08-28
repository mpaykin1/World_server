# Следующие high-impact системы после V10

1. **Model-predictive scene governor (MPC)** — прогнозировать качество/FPS/VRAM на несколько секунд вперёд и менять параметры плавно, без oscillation между quality levels.
2. **Offline replay benchmark corpus** — автоматически проигрывать записанные реальные маршруты/камеры на каждом candidate и сравнивать одинаковые сцены кадр-в-кадр.
3. **Perceptual importance from gameplay events** — учитывать не только экранную площадь, но и взаимодействия, квестовые объекты, врагов, pickup/aim targets и частоту внимания игроков.
4. **Texture/material observability via OpenTelemetry** — единые traces от CDN fetch -> decode -> upload -> residency -> draw -> frame spike с correlation IDs.
5. **HTTP/3 / region-aware delivery experiment layer** — сравнивать CDN transport/region/chunk size только через canary и реальные RTT/cache metrics.
6. **Canonical material confidence transfer** — переносить проверенные решения между мирами только при достаточной semantic/UV/engine similarity и автоматически снижать confidence при drift.
7. **Automatic material anomaly detector** — находить внезапно слишком яркие/тёмные, неверный color-space, flipped normal Y, alpha fringe, seam, UV scale и compression artifacts на новых assets до runtime.
8. **Policy shadow mode** — новая quality policy сначала считает действия параллельно production, но не применяет их; promotion только если shadow evidence лучше текущей policy.
9. **Deterministic toolchain lock + SBOM/SLSA-style provenance** — фиксировать версии encoders/Blender/Godot/Python и получать воспроизводимые artifact chains на CI worker.
10. **Multi-region failure simulation** — проверять потерю CDN region/queue worker/object store и автоматическое graceful degradation без удаления hero textures.
11. **Adaptive controller stability detector** — находить quality oscillation/ping-pong даже если средний FPS хороший.
12. **Cross-system regression graph** — связывать один фикс с тестами texture/mesh/light/animation и автоматически запускать только затронутые проверки плюс полный nightly suite.
