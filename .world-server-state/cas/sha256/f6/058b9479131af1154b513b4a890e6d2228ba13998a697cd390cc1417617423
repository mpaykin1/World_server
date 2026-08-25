-- Texture Quality V7 Roblox adapter.
-- Roblox does not expose generic texture VRAM/OOM telemetry. Feed only measured app-level signals.
local Governor = {}

function Governor.computeTier(deviceClass, memoryWarning, thermalHint, saliency)
    local score = tonumber(saliency) or 0.55
    local tier = "high"
    if deviceClass == "mobile-low" then tier = "medium" end
    if memoryWarning == true or thermalHint == "serious" or thermalHint == "critical" then
        if score >= 0.88 then
            tier = "medium"
        else
            tier = "low"
        end
    end
    return tier
end

function Governor.applyManifest(textureRecords, manifest)
    local result = {}
    for _, record in ipairs(textureRecords) do
        local nextRecord = table.clone(record)
        nextRecord.qualityTier = Governor.computeTier(
            record.deviceClass,
            record.memoryWarning,
            record.thermalHint,
            record.saliencyScore
        )
        table.insert(result, nextRecord)
    end
    return result
end

return Governor
