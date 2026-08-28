# VIDEO2GAME VOXEL V5

Видео → управляемая воксельная 3D-игра.

## V5 добавляет
- CPU depth-fusion / completion + адаптер для внешнего foundation-depth;
- адаптеры SAM2/SMPL-X/remote GPU без изменения runtime-контракта;
- motion retargeting;
- synthesis: idle / walk / run / jump;
- avatar LOD x3;
- foot IK + ground lock;
- voxel interior completion;
- procedural cleanup шумовых кубов;
- frustum culling;
- chunk streaming;
- runtime FPS profiler;
- regression gate.

## Важно
Без внешней модели depth/SAM2/SMPL-X система использует CPU fallback.
Это полноценный рабочий fallback, но он не заявляет точность foundation-моделей.

## Выходные отчёты
- `PIPELINE_REPORT.json`
- `VALIDATION_REPORT.json`
- `QUALITY_GATE.json`
- `REGRESSION_REPORT.json`

## Запуск
Windows: `RUN_WINDOWS.bat`
macOS/Linux: `./RUN_MAC_LINUX.sh input.mp4`
