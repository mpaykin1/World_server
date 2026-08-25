local Governor = {}
function Governor.apply(plan, adapters)
    local actions = plan.actions or {}
    for name, action in pairs(actions) do
        local adapter = adapters[name]
        if adapter and adapter.applyQualityAction then adapter:applyQualityAction(action) end
    end
    return actions
end
return Governor
