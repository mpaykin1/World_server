from __future__ import annotations

from pathlib import Path
from typing import Callable
import json
import math

import numpy as np
from PIL import Image


class VoxelCityEngine:
    """CPU image -> colored voxel city world. No GLB heightfield."""
    SCHEMA = "ai3d-voxel-city-v2"

    def available(self) -> bool:
        return True

    @staticmethod
    def _edge_map(rgb: np.ndarray) -> np.ndarray:
        lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255.0
        gx = np.zeros_like(lum, dtype=np.float32)
        gy = np.zeros_like(lum, dtype=np.float32)
        gx[:, 1:-1] = np.abs(lum[:, 2:] - lum[:, :-2])
        gy[1:-1, :] = np.abs(lum[2:, :] - lum[:-2, :])
        return np.clip((gx + gy) * 1.7, 0.0, 1.0).astype(np.float32)

    @staticmethod
    def _skyline(rgb: np.ndarray, edge: np.ndarray) -> np.ndarray:
        """Dynamic-programming skyline: prefers strong/dark structures with support below."""
        h, w, _ = rgb.shape
        lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]) / 255.0
        dark = 1.0 - lum
        support = np.zeros_like(lum, dtype=np.float32)
        for y in range(h):
            y2 = min(h, y + max(8, h // 6))
            support[y] = np.mean(0.55 * dark[y:y2] + 0.9 * edge[y:y2], axis=0)
        yy = np.arange(h, dtype=np.float32)[:, None] / max(1, h - 1)
        score = 1.5 * edge + 0.9 * dark + 1.5 * support + 0.18 * (1.0 - yy)
        min_y = max(2, int(h * 0.035))
        max_y = min(h - 2, int(h * 0.78))
        cand = score[min_y:max_y + 1].astype(np.float32)
        hh = cand.shape[0]
        dp = np.full((hh, w), -1e9, dtype=np.float32)
        prev = np.full((hh, w), -1, dtype=np.int16)
        dp[:, 0] = cand[:, 0]
        max_jump = max(4, h // 12)
        smooth_penalty = 0.10
        for x in range(1, w):
            for yi in range(hh):
                lo = max(0, yi - max_jump)
                hi = min(hh, yi + max_jump + 1)
                inds = np.arange(lo, hi)
                vals = dp[lo:hi, x - 1] - smooth_penalty * np.abs(inds - yi)
                j = int(np.argmax(vals))
                dp[yi, x] = cand[yi, x] + vals[j]
                prev[yi, x] = int(inds[j])
        path = np.zeros(w, dtype=np.int16)
        path[-1] = int(np.argmax(dp[:, -1]))
        for x in range(w - 1, 0, -1):
            path[x - 1] = prev[path[x], x]
        return path.astype(np.int32) + min_y

    @staticmethod
    def _adaptive_palette(image: Image.Image, colors: int):
        colors = max(8, min(int(colors), 96))
        pal = image.convert("P", palette=Image.Palette.ADAPTIVE, colors=colors)
        idx = np.array(pal, dtype=np.uint8)
        raw = (pal.getpalette() or [])[: colors * 3]
        actual = max(1, min(colors, len(raw) // 3))
        palette = []
        for i in range(actual):
            r, g, b = raw[i * 3 : i * 3 + 3]
            palette.append((int(r) << 16) | (int(g) << 8) | int(b))
        if not palette:
            palette = [0]
        idx = np.minimum(idx, len(palette) - 1).astype(np.uint8)
        return idx, palette

    def run(self, image_path: Path, output_path: Path, params: dict, progress: Callable | None = None):
        if progress:
            progress(5, "Voxel City: reading reference image")
        src = Image.open(image_path).convert("RGB")
        src_w, src_h = src.size
        grid_w = max(48, min(int(params.get("voxelGridWidth", 128)), 192))
        grid_h = max(32, round(grid_w * src_h / max(1, src_w)))
        if grid_h > 160:
            scale = 160 / grid_h
            grid_h = 160
            grid_w = max(48, round(grid_w * scale))
        small = src.resize((grid_w, grid_h), Image.Resampling.LANCZOS)
        rgb = np.array(small, dtype=np.uint8)
        edge = self._edge_map(rgb)
        skyline = self._skyline(rgb, edge)
        sky = np.zeros((grid_h, grid_w), dtype=np.bool_)
        for x, sy in enumerate(skyline):
            sky[: int(sy), x] = True
        if progress:
            progress(21, f"Voxel City: skyline solved {grid_w}x{grid_h}")

        palette_idx, palette = self._adaptive_palette(small, int(params.get("paletteColors", 64)))
        max_depth = max(6, min(int(params.get("maxDepth", 32)), 64))
        max_thickness = max(1, min(int(params.get("maxThickness", 6)), 10))
        voxel_size = max(0.1, min(float(params.get("voxelSize", 1.0)), 4.0))
        structure_cell = max(2, min(int(params.get("structureCell", 4)), 12))
        depth_layers = max(3, min(int(params.get("depthLayers", 8)), 16))
        foundation = bool(params.get("foundation", True))

        lum = (0.299 * rgb[..., 0].astype(np.float32) + 0.587 * rgb[..., 1].astype(np.float32) + 0.114 * rgb[..., 2].astype(np.float32)) / 255.0
        dark = 1.0 - lum

        # Optional real monocular depth from the existing Depth Anything engine.
        # We never silently replace it with grayscale. If unavailable, the method stays explicitly heuristic.
        depth_source = "heuristic_perspective"
        depth_map = None
        depth_path_raw = str(params.get("_depthPath") or "").strip()
        if depth_path_raw:
            dp = Path(depth_path_raw)
            if dp.is_file():
                dm = Image.open(dp).convert("L").resize((grid_w, grid_h), Image.Resampling.BILINEAR)
                depth_map = np.array(dm, dtype=np.float32) / 255.0
                valid = ~sky
                if np.any(valid):
                    yy_full = np.repeat(np.arange(grid_h, dtype=np.float32)[:, None], grid_w, axis=1) / max(1, grid_h - 1)
                    dvals = depth_map[valid]
                    yvals = yy_full[valid]
                    if float(dvals.std()) > 1e-5 and float(yvals.std()) > 1e-5:
                        corr = float(np.corrcoef(dvals, yvals)[0, 1])
                        # For an urban image, lower pixels are usually nearer. Orient relative depth accordingly.
                        if math.isfinite(corr) and corr < 0:
                            depth_map = 1.0 - depth_map
                depth_source = "depth_anything_v2_small"

        # Piecewise-constant structural depth per small image cell. This avoids a continuous mountain-like heightfield.
        tile_z = {}
        tile_t = {}
        for ty in range(0, grid_h, structure_cell):
            for tx in range(0, grid_w, structure_cell):
                y2, x2 = min(grid_h, ty + structure_cell), min(grid_w, tx + structure_cell)
                valid = ~sky[ty:y2, tx:x2]
                if not np.any(valid):
                    continue
                yc = (ty + y2 - 1) * 0.5
                yn = yc / max(1, grid_h - 1)
                avg_edge = float(edge[ty:y2, tx:x2][valid].mean())
                avg_dark = float(dark[ty:y2, tx:x2][valid].mean())
                perspective_depth = yn ** 1.55
                if depth_map is not None:
                    dm = depth_map[ty:y2, tx:x2][valid]
                    monocular_depth = float(dm.mean()) if dm.size else perspective_depth
                    depth_value = 0.68 * monocular_depth + 0.32 * perspective_depth
                else:
                    depth_value = perspective_depth
                layer = int(round(depth_value * (depth_layers - 1)))
                layer = max(0, min(depth_layers - 1, layer))
                base_z = int(round(layer * max_depth / max(1, depth_layers - 1)))
                local = int(round(avg_edge * 1.2 + avg_dark * 0.7))
                tile_z[(tx // structure_cell, ty // structure_cell)] = min(max_depth, base_z + local)
                thickness = 1 + int(round(yn * (max_thickness - 1) * 0.7 + avg_edge * 1.2))
                tile_t[(tx // structure_cell, ty // structure_cell)] = max(1, min(max_thickness, thickness))

        if progress:
            progress(38, "Voxel City: constructing cubical architectural masses")

        voxels = []
        visible_cells = 0
        front_depths = set()
        for iy in range(grid_h):
            world_y = grid_h - 1 - iy
            for ix in range(grid_w):
                if sky[iy, ix]:
                    continue
                visible_cells += 1
                key = (ix // structure_cell, iy // structure_cell)
                front_z = int(tile_z.get(key, 0))
                thickness = int(tile_t.get(key, 1))
                front_depths.add(front_z)
                color_index = int(palette_idx[iy, ix])
                for dz in range(thickness):
                    voxels.append([ix, world_y, front_z - dz, color_index])

        # Walkable foundation below the image-derived city. It does not affect the front silhouette.
        foundation_voxels = 0
        if foundation:
            bottom = rgb[max(0, grid_h - max(2, grid_h // 12)) :, :, :].reshape(-1, 3)
            med = np.median(bottom, axis=0).astype(np.uint8)
            # Pick closest palette entry.
            pal_rgb = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255] for c in palette], dtype=np.float32)
            pidx = int(np.argmin(np.sum((pal_rgb - med.astype(np.float32)) ** 2, axis=1)))
            for x in range(grid_w):
                for z in range(-max_thickness, max_depth + 1):
                    voxels.append([x, -1, z, pidx])
                    foundation_voxels += 1

        if progress:
            progress(70, f"Voxel City: {len(voxels):,} cubes")

        preview = Image.new("RGBA", (grid_w, grid_h), (0, 0, 0, 0))
        px = preview.load()
        for iy in range(grid_h):
            for ix in range(grid_w):
                if sky[iy, ix]:
                    continue
                c = palette[int(palette_idx[iy, ix])]
                px[ix, iy] = ((c >> 16) & 255, (c >> 8) & 255, c & 255, 255)
        preview_path = output_path.with_name("voxel-front-preview.png")
        preview.resize((grid_w * 4, grid_h * 4), Image.Resampling.NEAREST).save(preview_path)

        # Keep the non-city sky as a separate backplate, not as voxel geometry.
        sky_backplate = Image.new("RGBA", (grid_w, grid_h), (0, 0, 0, 0))
        sky_px = sky_backplate.load()
        for iy in range(grid_h):
            for ix in range(grid_w):
                if not sky[iy, ix]:
                    continue
                rr, gg, bb = [int(v) for v in rgb[iy, ix]]
                sky_px[ix, iy] = (rr, gg, bb, 255)
        sky_path = output_path.with_name("voxel-sky-backplate.png")
        sky_backplate.resize((grid_w * 4, grid_h * 4), Image.Resampling.NEAREST).save(sky_path)

        # Diagnostic skyline and front-depth images.
        silhouette = Image.fromarray((~sky * 255).astype(np.uint8), mode="L")
        silhouette_path = output_path.with_name("voxel-silhouette.png")
        silhouette.resize((grid_w * 4, grid_h * 4), Image.Resampling.NEAREST).save(silhouette_path)
        depth_img = np.zeros((grid_h, grid_w), dtype=np.uint8)
        for iy in range(grid_h):
            for ix in range(grid_w):
                if sky[iy, ix]:
                    continue
                z = tile_z.get((ix // structure_cell, iy // structure_cell), 0)
                depth_img[iy, ix] = int(round(255 * z / max(1, max_depth)))
        depth_path = output_path.with_name("voxel-depth-preview.png")
        Image.fromarray(depth_img, mode="L").resize((grid_w * 4, grid_h * 4), Image.Resampling.NEAREST).save(depth_path)

        # Background colors (game sky stays non-voxel).
        top = np.median(rgb[: max(1, grid_h // 10)].reshape(-1, 3), axis=0).astype(int)
        horizon_y = max(0, min(grid_h - 1, int(np.median(skyline))))
        horizon = np.median(rgb[max(0, horizon_y - 2): min(grid_h, horizon_y + 3)].reshape(-1, 3), axis=0).astype(int)

        center_x = (grid_w - 1) / 2
        center_y = (grid_h - 1) / 2
        world = {
            "schema": self.SCHEMA,
            "generator": "AI3D Voxel City CPU v2",
            "source": {"width": src_w, "height": src_h, "gridWidth": grid_w, "gridHeight": grid_h},
            "voxelSize": voxel_size,
            "palette": palette,
            "voxels": voxels,
            "performance": {
                "chunkSize": 16,
                "logicalRepresentation": "cubes",
                "browserMeshing": "chunked_greedy_surface",
                "internalFaceCulling": True,
                "bakedLighting": "static_face_vertex_colors",
                "dynamicShadows": False,
                "farLod": "chunk_aabb_hlod",
                "streaming": "camera_or_player_centered",
                "adaptiveResolution": True,
                "farWorldHaze": True,
            },
            "camera": {
                "target": [center_x, center_y, max_depth * 0.45],
                "frontOrtho": {"width": grid_w + 4, "height": grid_h + 4, "z": max_depth + max(grid_w, grid_h)},
                "perspectiveFov": 42,
            },
            "background": {"top": [int(v) for v in top], "horizon": [int(v) for v in horizon], "skyBackplate": sky_path.name, "type": "reference_sky_backplate"},
            "claims": {
                "frontVoxelShellDerivedFromReference": True,
                "depthIsHeuristic": depth_source != "depth_anything_v2_small",
                "depthSource": depth_source,
                "image3dCorrespondence": "UNTESTED",
                "note": "Front x/y/color shell follows the reference. Unseen geometry remains inferred even when monocular depth is available.",
            },
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

        stats_path = output_path.with_name("voxel-city-stats.json")
        stats_path.write_text(json.dumps({
            "schema": self.SCHEMA,
            "voxelCount": len(voxels),
            "foundationVoxels": foundation_voxels,
            "visibleReferenceCells": visible_cells,
            "skyCells": int(sky.sum()),
            "gridWidth": grid_w,
            "gridHeight": grid_h,
            "paletteColors": len(palette),
            "maxDepth": max_depth,
            "maxThickness": max_thickness,
            "structureCell": structure_cell,
            "depthLayersConfigured": depth_layers,
            "frontDepthLayersUsed": len(front_depths),
            "depthSource": depth_source,
            "algorithm": "skyline_dp_reference_shell_piecewise_voxel_depth_cpu",
            "runtimePerformancePlan": {
                "chunkSize": 16,
                "meshing": "chunked_greedy",
                "internalFaces": "culled",
                "lighting": "baked_vertex_colors",
                "shadows": "disabled_dynamic",
                "lod": "detail_plus_far_chunk_hlod",
                "streaming": "render_distance",
                "adaptiveResolution": True,
                "fogHaze": True,
            },
            "visual3DQuality": "UNTESTED",
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        if progress:
            progress(92, "Voxel City: world + previews ready")
        return output_path, stats_path, preview_path, sky_path, silhouette_path, depth_path
