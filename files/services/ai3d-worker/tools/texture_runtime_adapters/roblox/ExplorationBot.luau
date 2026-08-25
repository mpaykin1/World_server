-- Candidate Studio/test exploration runner. Do not use to teleport live players through gameplay geometry.
local ExplorationBot = {}
ExplorationBot.__index = ExplorationBot

function ExplorationBot.new(camera, sampleFn)
    return setmetatable({ camera = camera, sampleFn = sampleFn, aborted = false }, ExplorationBot)
end

function ExplorationBot:Abort()
    self.aborted = true
end

function ExplorationBot:Run(mission)
    local samples = {}
    for _, waypoint in ipairs(mission.waypoints or {}) do
        if self.aborted then break end
        local p, look = waypoint.position, waypoint.lookAt
        if p and look and #p >= 3 and #look >= 3 then
            local pos = Vector3.new(p[1], p[2], p[3])
            local target = Vector3.new(look[1], look[2], look[3])
            self.camera.CFrame = CFrame.lookAt(pos, target)
            task.wait(math.max(0.05, waypoint.dwellSeconds or 0.5))
            if self.sampleFn then
                table.insert(samples, self.sampleFn(waypoint))
            end
        end
    end
    return samples
end

return ExplorationBot
