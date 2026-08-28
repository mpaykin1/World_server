# GS360 — next high-value reinforcements after V6

## P0
1. **Hold-out render validator** — render camera views from the trained splat and compare against untouched source views (PSNR/SSIM + perceptual metric where license/runtime permits).
2. **Panorama-aware depth seam solver** — depth continuity across 0°/360° and better pole handling.
3. **Confidence-aware z-buffer reprojection** — disocclusion masks and automatic rejection of low-confidence synthetic pixels.
4. **COLMAP panorama-group model** — explicitly distinguish same-center rotations from genuinely translated camera centers.
5. **Real trainer checkpoint scheduler** — time-budgeted training slices so CPU jobs can stop/resume predictably.

## P1
6. **Dynamic object masks** for people/cars before reconstruction; OpenSplat already supports image masks, so reuse that interface.
7. **Automatic floater/outlier cleanup with before/after validation + rollback**.
8. **SOG streamed LOD integration** with server asset registry and runtime distance budgets.
9. **Golden-scene regression benchmark** so reconstruction quality cannot silently regress between patch versions.
10. **Uncertainty heatmap capture coach** that recommends exact next camera positions from weak regions.

## P2
11. **World-server Control Plane routing** between 2.5D, depth-mesh, approximate GS and true 3DGS based on quality/time/hardware target.
12. **Energy/RAM/disk budgeter** that selects iterations, views and compression against an explicit machine budget.
13. **Visual browser test harness** for generated HTML/SOG/SPZ viewers.
14. **Asset Registry + Dependency Graph registration** for source panoramas → depth → views → poses → trained master → optimized delivery variants.
