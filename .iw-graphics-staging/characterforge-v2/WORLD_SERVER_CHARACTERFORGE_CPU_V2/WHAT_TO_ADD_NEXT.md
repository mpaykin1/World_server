# Следующие усиления CharacterForge

## P0 — нужно добавить после реального V2 runtime PASS

1. **True baked stance-interval Foot IK**
   - сейчас уже есть foot bones + contact markers + voxel-safe keyframes + измерение loop-contact drift;
   - следующий шаг: IK targets → bake transforms → автоматическая проверка sliding distance.

2. **Silhouette Fusion V3**
   - использовать front + side не только для глубины по Z, но и совместно оптимизировать X/Y silhouette error;
   - CPU coordinate-descent / signed-distance fitting без нейросетевого GPU.

3. **Godot automated import test**
   - headless Godot импортирует `characterforge-godot.zip`/GLB;
   - проверяет Skeleton3D, AnimationPlayer, collision, запуск сцены и отсутствие ошибок.

4. **Animation Retarget Library**
   - единый humanoid role map;
   - перенос существующей библиотеки серверных анимаций на все CharacterForge LOD;
   - один набор анимаций вместо дублирования в каждом персонаже.

## P1 — очень полезно

5. **Voxel accessory layers**
   - волосы, броня, оружие, рюкзак отдельными semantic layers;
   - можно менять детализацию предмета независимо от тела.

6. **LOD runtime policy**
   - автоматический выбор 16/24/48/72/96+ vph по расстоянию, устройству, FPS и размеру экрана;
   - связать с существующим world/device quality scheduler.

7. **gltfpack / meshoptimizer stage**
   - optional post-export оптимизация GLB для web/mobile;
   - сравнивать размер/FPS/визуальную ошибку и оставлять оптимизированную версию только при PASS.

8. **Character asset registry adapter**
   - записывать identity hash, LOD, rig schema, animation set, source view hashes, license/source metadata в существующий Asset Registry;
   - dedupe персонажей и переиспользование LOD/анимаций.

9. **Automatic thumbnail / turntable preview**
   - Blender CPU рендерит 8–12 ракурсов;
   - visual regression сравнивает силуэт/палитру между версиями.

10. **Cross-job CPU/RAM Scheduler**
    - per-job RAM governor уже внедрён;
    - следующий шаг — динамически менять concurrency существующей очереди по RAM/CPU load;
    - тяжёлые 96–160 vph jobs не должны запускаться параллельно на слабой машине.

## P2 — хорошо бы

11. **Smooth companion mesh**
    - optional AutoRemesher clean quad mesh рядом с voxel mesh;
    - нужен для проектов, где один identity должен переключаться voxel ↔ smooth.

12. **Roblox packager**
    - scale/bone/triangle validation;
    - экспорт совместимого персонажа и отчёта.

13. **Unreal packager**
    - skeleton naming/scale validation;
    - готовый import preset и animation mapping.

14. **ComfyUI reference-sheet helper**
    - использовать только как preprocessing/UI;
    - автоматически готовить согласованные front/side/back референсы CPU-friendly моделями, если это реально приемлемо по времени.

15. **Learned repair memory**
    - сохранять типовые ошибки CharacterForge, root cause и successful fix в существующую knowledge/regression систему;
    - автоматически применять проверенные fixes к следующим персонажам.

## Что пока НЕ нужно

- TRELLIS.2/SkinTokens как обязательная зависимость: не соответствуют CPU-only требованию.
- Quad Remesher/Tripo платные сервисы: не нужны для ядра.
- отдельная очередь, отдельный AI3D worker или отдельный asset registry: дублирование запрещено.
