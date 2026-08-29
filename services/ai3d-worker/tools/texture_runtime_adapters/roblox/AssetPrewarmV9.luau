local ContentProvider = game:GetService("ContentProvider")
local M = {}
function M.preload(instances)
    local ok, err = pcall(function() ContentProvider:PreloadAsync(instances or {}) end)
    return {ok = ok, error = ok and nil or tostring(err)}
end
return M
