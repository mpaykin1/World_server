--!strict
local GameMotionDriver={}
local function clamp01(v:number):number return math.clamp(v,0,1) end
function GameMotionDriver.smoothstep(v:number):number local t=clamp01(v);return t*t*(3-2*t) end
function GameMotionDriver.progressToFrame(progress:number,frameCount:number):number
	if frameCount<=1 then return 1 end
	return math.clamp(math.floor(clamp01(progress)*(frameCount-1)+0.5)+1,1,frameCount)
end
function GameMotionDriver.newLocomotionClock(strideLength:number?)
	local phase=0;local stride=math.max(.05,strideLength or 1)
	return {
		step=function(speed:number,dt:number):number phase=(phase+math.max(0,speed)*math.max(0,dt)/stride)%1;return phase end,
		getPhase=function():number return phase end
	}
end
function GameMotionDriver.captureRest(parts:{BasePart}):{[BasePart]:CFrame}
	local rest={};for _,part in ipairs(parts)do rest[part]=part.CFrame end;return rest
end
function GameMotionDriver.explode(parts:{BasePart},rest:{[BasePart]:CFrame},progress:number,distance:number?)
	local p=GameMotionDriver.smoothstep(progress);local dist=distance or 4
	for _,part in ipairs(parts)do local base=rest[part];if base then
		local direction=base.Position.Magnitude>.001 and base.Position.Unit or Vector3.new(0,1,0)
		part.CFrame=base+direction*dist*p
	end end
end
-- Character locomotion should be driven through Animator/Motor6D/Bones and synchronized to real movement speed.
-- Cosmetic ambient motion must not move authoritative HumanoidRootPart/collision roots.
return GameMotionDriver
