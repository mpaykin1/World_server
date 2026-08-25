extends Node
func apply_plan(plan: Dictionary, targets: Dictionary) -> void:
    var actions: Dictionary = plan.get("actions", {})
    for key in actions.keys():
        var target = targets.get(key)
        if target != null and target.has_method("apply_quality_action"):
            target.call("apply_quality_action", actions[key])
