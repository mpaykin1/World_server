-- Roblox does not expose arbitrary shader compilation timing. This collector records
-- frame/asset-prewarm hitches without falsely labeling them as shader compilation.
local M = {}
function M.new(emit, hitchMs)
    local self = {frame=0, emit=emit or function() end, hitchMs=hitchMs or 8}
    function self:recordFrame(frameMs)
        self.frame += 1
        if frameMs >= self.hitchMs then self.emit({frame=self.frame, timestamp=os.clock(), variant="unknown", compileMs=0, frameSpikeMs=frameMs, source="roblox-frame-spike-unattributed"}) end
    end
    function self:recordAssetPrewarm(name, ms)
        self.emit({frame=self.frame, timestamp=os.clock(), variant=name, compileMs=0, frameSpikeMs=ms, source="roblox-asset-prewarm"})
    end
    return self
end
return M
