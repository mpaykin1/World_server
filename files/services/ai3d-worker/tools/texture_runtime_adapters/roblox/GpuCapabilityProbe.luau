local Probe = {}
function Probe.Run()
    local UserInputService = game:GetService("UserInputService")
    return {
        platform = "roblox",
        touchEnabled = UserInputService.TouchEnabled,
        keyboardEnabled = UserInputService.KeyboardEnabled,
        measuredFromRuntime = true,
        explicitGpuCompressionSupportAvailable = false,
        explicitTextureVramMetricAvailable = false,
        note = "Use uploaded asset tiers and measured frame performance; do not claim BC/ASTC control from Luau."
    }
end
return Probe
