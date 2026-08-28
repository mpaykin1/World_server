# Pixel Panorama 360 V4

## Architecture
`Browser Factory UI → /api/ai3d session → existing AI3D Worker durable queue → PixelPanorama360Engine → ZIP/manifest/preview → optional Supabase Storage`.

The static local builder is used for repository assets and test fixtures. Heavy user jobs should prefer the worker path.

## Input asset
Best: 2:1 equirectangular pixel-art frame sequence.
Recommended master: 4096x2048 or 8192x4096.

Worker accepts ZIP/APNG/GIF/PNG/JPEG/WebP/MP4/WebM. A single still 2:1 image can be CPU-auto-animated.

## Multires
The local builder creates tiled levels. Viewer renders the low-resolution frame immediately, calculates visible longitude/latitude tile ranges from current yaw/pitch/FOV, then overlays visible high-resolution tiles. Tile cache is LRU-limited and next-frame tiles are prefetched.

## Tour editor
Open `/apps/pixel-panorama-360/editor.html?manifest=...`, place hotspots at the current view and export `hotspots.json`.

## Supabase
`pixel-panorama-360-publish-supabase.cjs` uploads built files to public bucket `panorama360`, rewrites local manifest URLs to remote Storage URLs and upserts metadata.

## CPU auto-animation
`pixel-panorama-360-animate-still.cjs` preserves pixel edges and loops equirectangular rows with wraparound. It is procedural automation, not generative AI; this distinction is intentional.
