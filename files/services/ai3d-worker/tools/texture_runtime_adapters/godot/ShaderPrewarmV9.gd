extends RefCounted
class_name ShaderPrewarmV9

func prewarm(materials: Array, max_variants: int = 64) -> Dictionary:
    var touched := 0
    for material in materials.slice(0, max_variants):
        if material is ShaderMaterial:
            # Touching the shader/material in a warmup scene lets the renderer compile it before interaction.
            var _shader = material.shader
            touched += 1
    return {"touched": touched, "runtimeVerified": false}
