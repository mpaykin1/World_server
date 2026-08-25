local TextureRuntimeAdapter = {}
TextureRuntimeAdapter.__index = TextureRuntimeAdapter

function TextureRuntimeAdapter.new()
    return setmetatable({telemetry = {}, variants = {}}, TextureRuntimeAdapter)
end

function TextureRuntimeAdapter:RegisterVariants(setKey, variants)
    -- variants are pre-uploaded Roblox asset IDs keyed by quality tier.
    self.variants[setKey] = variants
end

function TextureRuntimeAdapter:Observe(setKey, distance, screenCoverage, visible, seconds)
    distance = math.max(0.05, distance or 100)
    screenCoverage = math.clamp(screenCoverage or 0, 0, 1)
    visible = visible ~= false
    seconds = math.max(0, seconds or 1)
    local score = (visible and 1 or 0.15) * seconds * (0.25 + screenCoverage * 3) / math.sqrt(distance)
    local tier = score > 0.9 and "hero" or score > 0.3 and "high" or score > 0.08 and "medium" or "low"
    local event = {setKey=setKey, distance=distance, screenCoverage=screenCoverage, visible=visible, seconds=seconds, recommendedTier=tier, unixTime=os.time()}
    table.insert(self.telemetry, event)
    return event
end

function TextureRuntimeAdapter:GetVariant(setKey, tier)
    local set = self.variants[setKey]
    return set and set[tier] or nil
end

function TextureRuntimeAdapter:DrainTelemetry()
    local out = self.telemetry
    self.telemetry = {}
    return out
end

return TextureRuntimeAdapter
