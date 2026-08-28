# WORLD_SERVER_PIXEL_PANORAMA_360_V4

## Назначение
V4 добавляет в `World_server` связную фабрику **пиксельных анимированных 360° панорам** с CPU-first обработкой и переиспользованием существующей AI3D durable queue.

## Что нового относительно V3
- реальный multires tiled streaming: low-res кадр показывается сразу, затем подгружаются видимые high-res tiles;
- LRU cache tiles и prefetch следующего кадра;
- pinch zoom, mouse/touch look, gyro;
- встроенный Factory UI: файл → existing AI3D worker → durable job → готовый ZIP/manifest;
- новый worker mode `pixel_panorama_360`;
- worker принимает ZIP/APNG/GIF/PNG/WebP/MP4/WebM;
- CPU auto-animation из одной 2:1 картинки;
- temporal consistency/seam/pole validation;
- `sharp`/libvips fast path + ImageMagick fallback;
- Supabase Storage publisher + metadata upsert;
- tour/hotspot editor;
- candidate → certification gate;
- release gate + local/preview/production verifier;
- desktop + mobile-webkit + visual candidate tests.

## Главная инструкция
Открой `DESKTOP_AI_INSTALL_VERIFY_FIX.md`.

## Готовность
- Patch code readiness: **98%**
- Local package/integration validation: **PASS**
- Real production verification: выполняется Desktop AI после установки на живой repo/worker/Supabase/Vercel.
