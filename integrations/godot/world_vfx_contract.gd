class_name WorldVfxContract
extends RefCounted
const CONTRACT_VERSION := 3
const TYPES := {"pulse":true,"sparks":true,"beam":true,"ribbon":true,"decal":true}
static func canonicalize(input: Dictionary) -> Dictionary:
	if int(input.get("contractVersion", CONTRACT_VERSION)) != CONTRACT_VERSION:
		push_error("Unsupported World VFX contractVersion")
		return {}
	var t := str(input.get("type", "pulse")); if not TYPES.has(t): t = "pulse"
	var p := input.get("position", [0.0,0.0,0.0]); var params := input.get("params", {})
	return {"contractVersion":CONTRACT_VERSION,"id":str(input.get("id","")),"type":t,"position":[float(p[0]),float(p[1]),float(p[2])],"target":input.get("target",null),"seed":int(input.get("seed",0)),"priority":int(input.get("priority",0)),"semantic":str(input.get("semantic","")),"params":{"duration":float(params.get("duration",1.0)),"intensity":float(params.get("intensity",1.0)),"radius":float(params.get("radius",1.0)),"particleCount":int(params.get("particleCount",128)),"width":float(params.get("width",0.24))}}
static func effect_seed(event: Dictionary) -> int: return int(event.get("seed",0)) & 0x7fffffff
