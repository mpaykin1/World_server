local Streamer = {}
Streamer.__index = Streamer
function Streamer.new()
    return setmetatable({sets = {}, active = {}}, Streamer)
end
function Streamer:Register(setKey, variants)
    self.sets[setKey] = variants -- pre-uploaded asset IDs: hero/high/medium/low
end
function Streamer:Select(setKey, priority)
    local variants = self.sets[setKey]
    if not variants then return nil end
    local order = priority == "critical" and {"hero","high","medium","low"} or priority == "high" and {"high","hero","medium","low"} or priority == "medium" and {"medium","high","low","hero"} or {"low","medium","high","hero"}
    for _, tier in ipairs(order) do
        if variants[tier] then self.active[setKey] = {tier=tier, assetId=variants[tier]}; return variants[tier] end
    end
    return nil
end
function Streamer:Stats()
    local n=0; for _ in pairs(self.active) do n+=1 end
    return {activeSets=n, genericVirtualTexturingClaimed=false}
end
return Streamer
