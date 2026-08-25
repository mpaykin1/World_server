local Collector = {}
Collector.__index = Collector

function Collector.new(estimatedTextureVramMB)
    return setmetatable({frameMs = {}, estimatedTextureVramMB = estimatedTextureVramMB}, Collector)
end

function Collector:RecordFrame(delta)
    if delta and delta > 0 then table.insert(self.frameMs, delta * 1000) end
end

function Collector:Report()
    table.sort(self.frameMs)
    local total = 0
    for _, v in ipairs(self.frameMs) do total += v end
    local mean = #self.frameMs > 0 and total / #self.frameMs or nil
    local idx = #self.frameMs > 0 and math.clamp(math.floor(#self.frameMs * 0.95), 1, #self.frameMs) or nil
    return {
        platform = "roblox",
        fps = mean and 1000 / mean or nil,
        p95FrameMs = idx and self.frameMs[idx] or nil,
        textureVramMB = self.estimatedTextureVramMB,
        textureVramSource = self.estimatedTextureVramMB and "STATIC_RUNTIME_PLAN_ESTIMATE" or "UNAVAILABLE_NO_GENERIC_ROBLOX_VRAM_API",
        visualDelta = nil,
        visualDeltaSource = "REQUIRES_BEFORE_AFTER_CAPTURE",
        frames = #self.frameMs,
    }
end

return Collector
