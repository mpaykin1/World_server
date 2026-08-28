local M = {}
function M.apply(plan, targets)
    local actions = plan.actions or {}
    local applied = {}
    for _, key in ipairs({"textures","meshes","lighting","shadows","particles","animation"}) do
        local target = targets and targets[key]
        if target and type(target.setQualityAction) == "function" then
            local ok = pcall(target.setQualityAction, target, actions[key] or "keep")
            if ok then table.insert(applied, key) end
        end
    end
    return {applied = applied, protectedCriticalSets = plan.protectedCriticalSets or {}}
end
return M
