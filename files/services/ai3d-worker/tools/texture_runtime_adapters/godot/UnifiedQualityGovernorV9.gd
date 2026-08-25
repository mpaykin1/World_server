extends RefCounted
class_name UnifiedQualityGovernorV9

func apply_plan(plan: Dictionary, targets: Dictionary) -> Dictionary:
    var applied: Array[String] = []
    var actions: Dictionary = plan.get("actions", {})
    for key in ["textures", "meshes", "lighting", "shadows", "particles", "animation"]:
        var target = targets.get(key)
        if target != null and target.has_method("set_quality_action"):
            target.call("set_quality_action", actions.get(key, "keep"))
            applied.append(key)
    return {"applied": applied, "protectedCriticalSets": plan.get("protectedCriticalSets", [])}
