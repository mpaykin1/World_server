# Cinematic Voxel Quality Guard V3

Этот слой не создаёт второй параллельный autopilot. Он подключается к уже существующим в World_server:
- `shared/world-quality-autopilot.js`
- `shared/golden-performance-autotuner.js`
- `shared/quality-telemetry.js`
- `data/visual-baselines.json`
- `scripts/visual-regression.js`

## Реализовано
1. Hard quality floor: ранний прототип не может считаться готовым.
2. Golden-frame/reference diff на реальном референсе.
3. Cinematic shot grammar: eye + fire, 3 depth planes, meaningful darkness, warm/cold split.
4. Adaptive quality ceiling: поднимать качество до тех пор, пока есть FPS headroom.
5. Protected hero quality: глаз, огонь, UI и near geometry деградируют последними.
6. Voxel density amplifier через adapter API.
7. Material layering contract (>=3 слоя качества).
8. Volumetric atmosphere budget contract.
9. UI style presence lock.
10. Cross-platform capture: desktop + mobile.
11. Quality telemetry memory: события сохраняются локально и уходят в существующий `/api/quality-telemetry`.
12. CI evidence workflow.
13. Godot adapter для локальной/native сцены.
14. Regression tests на сам quality policy.

## Почему это сильнее V1
V1 в основном проверял структурные признаки. V2 связывает reference pixels + runtime scene contract + FPS feedback + CI evidence в один цикл.

## V3 extension
V3 additionally requires evidence-locked readiness, depth-structure regression, optional semantic/perceptual scoring, multi-angle captures, temporal p95 quality control, visibility/instance-clustering hooks, asset optimization audit and Godot export blocking for marked cinematic scenes.
