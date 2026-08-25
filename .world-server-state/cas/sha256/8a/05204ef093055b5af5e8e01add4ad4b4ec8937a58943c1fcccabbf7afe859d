from __future__ import annotations

import json
from pathlib import Path

from .material_profiles import all_profiles


def build_quality_preset() -> dict:
    return {
        "schemaVersion": 7,
        "principle": "preserve source composition/silhouette, transfer HQ detail into cheaper representations, and reject regressions before publishing",
        "materials": all_profiles(),
        "geometry": {
            "lodPolicy": {"lod0": "hero/near", "lod1": "near-mid", "lod2": "mid-far", "lod3": "far", "hlod": "very-far", "impostor": "horizon"},
            "semanticProtection": ["face", "hands", "eyes", "weapons", "shield", "ornament", "architecture trim", "rig-critical bones"],
            "instancing": {"exactMeshDeduplication": True, "exactMaterialDeduplication": True},
            "collision": {"separateFromVisualMesh": True, "preferConvexOrPrimitive": True},
        },
        "detailTransfer": {
            "reversibleBakeUV": "AUTO_BAKE_UV",
            "hqToLodNormal": True,
            "ambientOcclusion": True,
            "curvature": "derived from baked tangent normals",
            "height": "Poisson reconstruction from baked tangent normals",
            "preserveExistingAuthoredUV": True,
        },
        "rendering": {
            "ambientOcclusion": {"enabled": True, "strength": 0.72, "radiusPolicy": "scale-relative"},
            "globalIllumination": {"enabled": True, "mode": "engine-best-available", "fallback": "IBL+ambient/baked GI"},
            "sun": {"enabled": True, "physicalDirectional": True, "softness": 0.34},
            "fill": {"enabled": True, "mode": "sky_or_environment"},
            "shadows": {"enabled": True, "contact": True, "soft": True, "biasPolicy": "scale-aware"},
            "toneMapping": {"enabled": True, "operator": "filmic_or_aces"},
            "textureFiltering": {"anisotropic": True, "mipmaps": True},
        },
        "surface": {
            "microdetail": True,
            "roughnessVariation": True,
            "weathering": True,
            "localizedWetness": True,
            "wetnessAttribute": "AUTO_WETNESS",
            "weatheringAttribute": "AUTO_WEATHERING",
            "colorVariation": True,
            "preserveExistingAuthoredPBR": True,
            "lowResolutionTextureRestoration": "Real-ESRGAN when explicitly provisioned, otherwise channel-aware non-AI fallback with backend reported",
        },
        "materialFamilies": {
            "dielectric": ["albedo", "roughness", "normal", "ao"],
            "metal": ["albedo", "roughness", "normal", "ao", "metallic"],
            "emissive": ["albedo", "roughness", "normal", "ao", "emission", "emission_strength"],
            "transmissive": ["albedo", "roughness", "normal", "ao", "alpha", "transmission"],
        },
        "adaptiveRuntime": {"hardwareTiers": ["low", "medium", "high", "ultra"], "portalRoomOcclusionHints": True, "lodTransitionQA": True, "runtimePvsLearning": "additive-only", "deviceHistory": True},
        "qualityGates": {
            "fidelity": "multi-view HQ vs LOD0",
            "enhancement": "silhouette + detail-energy bounds",
            "animation": "sampled-frame HQ vs LOD0 deformation render comparison",
            "performance": "triangle/material/draw-call/collision static budget gate",
            "materialMultiLight": "sun + side + soft-light PBR response regression gate",
            "atlas": "material-family atlas candidate is used only after multi-light QA + UV/PBR channel audit passes",
            "lodTransition": "adjacent LOD renders are compared to detect visible popping",
            "compression": "use compressed target only if GLB extension is verified",
            "semanticProjection": "ONNX mask may influence decimation only after camera-aligned projection and coverage validation",
            "temporal": "same camera motion HQ vs optimized anti-shimmer gate",
            "nativeGpuTiming": "production verification requires real engine-native GPU timing when policy requires it",
        },
        "targets": {
            "godot": {
                "preferred": ["Forward+", "SDFGI_or_equivalent", "SSAO", "SSIL", "contact_shadows", "anisotropic_texture_filtering", "visibility_ranges", "HLOD", "MultiMesh", "occlusion_culling"],
                "materialBinding": {"normal": "detail normal map", "height": "detail height map when shader budget allows", "wetness": "AUTO_WETNESS vertex attribute", "weathering": "AUTO_WEATHERING vertex attribute"},
                "mobileFallback": ["environment_IBL", "baked_GI", "SSAO_if_budget_allows", "LOD", "HLOD", "impostor", "occlusion_culling"],
            },
            "web": {
                "preferred": ["HDR_environment_IBL", "PBR_materials", "filtered_shadows", "SSAO_or_GTAO", "anisotropic_filtering", "mipmaps", "distance_LOD", "HLOD", "impostor"],
                "compression": {"preferred": "verified EXT_meshopt_compression + KHR_texture_basisu", "fallback": "verified Draco or canonical GLB"},
                "materialBinding": {"normal": "detail normal map", "height": "parallax/displacement only at close LOD", "wetness": "AUTO_WETNESS when vertex colors are retained"},
            },
            "roblox": {
                "preferred": ["SurfaceAppearance_PBR", "high_quality_lighting_profile", "StreamingEnabled", "RenderFidelity_Automatic", "separate_simple_collision", "LOD/HLOD authored assets"],
                "materialBinding": {"normal": "SurfaceAppearance.NormalMap after asset upload", "roughness/metallic": "supported SurfaceAppearance maps", "wetness/weathering": "bake into supported texture maps/material variants"},
                "constraint": "Roblox does not expose arbitrary custom material shaders; generated procedural masks must be baked or represented by engine-native variants.",
            },
        },
    }


def write_quality_preset(path: Path) -> Path:
    path.write_text(json.dumps(build_quality_preset(), ensure_ascii=False, indent=2), encoding="utf-8")
    return path
