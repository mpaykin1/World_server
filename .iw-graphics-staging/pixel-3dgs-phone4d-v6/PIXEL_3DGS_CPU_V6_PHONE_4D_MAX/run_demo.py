from pathlib import Path
from pixel3dgs.pipeline import BuildConfig, build_scene

BASE = Path(__file__).resolve().parent
cfg = BuildConfig(
    input_dir=BASE / "examples" / "neon_city",
    output_dir=BASE / "output" / "demo_build",
    camera_spacing_m=1.8,
    sample_width=180,
    sample_height=90,
    palette_size=24,
    voxel_size=None,
    chunk_size_m=12.0,
    hole_fill_ratio=0.08,
    use_colmap_if_available=True,
)
print(build_scene(cfg))
