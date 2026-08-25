# V10 CPU-FIRST OPTIMIZATION

V10 усиливает V9 без серверной GPU и без потери качества рядом с персонажем.

Внедрено:
- threaded exact CPU import/BVH worker pool с точным fallback;
- mmap/windowed bounded-memory обработка огромных файлов;
- semantic conservative PVS: unknown/near = visible;
- incremental GI cell reuse только при exact input hash;
- content-defined chunking для лучшего CDN/cache reuse с byte-exact reconstruction;
- lossless derived-cache transport: Brotli preferred, Zstd optional, gzip fallback;
- Service Worker offline cache с version isolation;
- Shared Worker multi-tab SHA cache;
- exact binary delta для derived artifacts;
- automatic CPU flamegraph evidence;
- deterministic multi-seed network/physics replay farm;
- fail-closed dependency graph `code → asset → derived bake → game`;
- всё подключено к Protection Pack, Quality Ratchet и pipeline.

Следующий уровень без платной GPU:
1. memory-pressure controller с реальным RSS/heap watermark и автоматическим backpressure;
2. resumable range downloads + integrity tree (Merkle) для огромных миров;
3. SQLite/LMDB local build cache для миллионов derived keys;
4. incremental navmesh tiles с dependency hash;
5. CPU SIMD broadphase/narrowphase batches;
6. deterministic job scheduler, чтобы многопоточность давала воспроизводимые результаты;
7. asset semantic index для автоматического определения дверей/лестниц/проходов/укрытий;
8. multi-project build graph scheduler, чтобы один общий bake/hash переиспользовался между играми;
9. crash/minidump symbolization и автоматическая кластеризация новых fingerprints;
10. property-based генератор world mutations, который ищет неизвестные регрессии до production.
