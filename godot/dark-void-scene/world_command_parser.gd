class_name WorldCommandParser
extends RefCounted
## GDScript port of shared/world-command-parser.mjs - deterministic
## keyword parsing, no network/LLM call. Kept alias-table-for-alias-table
## identical to the JS original so both engines understand the same
## vocabulary; see world-manifestation-engine's docstring for why this
## exists in two languages instead of one.

const TYPE_ALIASES := [
	["eye", "(глаз|око|\\beye\\b|\\beyeball\\b)"],
	["beacon", "(огон[её]к|свеч[ауи]|маяк|пламя|\\bfire\\b|\\bflame\\b|\\bbeacon\\b|\\bcandle\\b)"],
	["tower", "(башн[яюи]|\\btower\\b|\\bspire\\b)"],
	["tree", "(дерев[оаья]|\\btree\\b)"],
	["bridge", "(мост|\\bbridge\\b)"],
	["stairs", "(лестниц[ауые]|ступен|\\bstairs\\b|\\bstaircase\\b)"],
	["house", "(дом|хижин[ау]|\\bhouse\\b|\\bhome\\b|\\bhut\\b)"],
	["portal", "(портал|\\bportal\\b|\\bgate\\b)"],
	["wall", "(стен[ауые]|\\bwall\\b)"],
	["sphere", "(сфер[ау]|шар|\\borb\\b|\\bsphere\\b|\\bball\\b)"],
	["monolith", "(монолит|стел[ау]|\\bobelisk\\b|\\bmonolith\\b)"],
]
const SIZE_ALIASES := [
	["tiny", "(крошечн|очень маленьк|\\btiny\\b|\\bmini\\b)\\w*", 0.62],
	["small", "(маленьк|небольш|\\bsmall\\b)\\w*", 0.8],
	["huge", "(огромн|гигант|колосс|\\bhuge\\b|\\bgiant\\b|\\bmassive\\b)\\w*", 1.75],
	["large", "(больш|крупн|\\blarge\\b|\\bbig\\b)\\w*", 1.3],
]
const COLOR_ALIASES := [
	["white", "(бел|white)\\w*"], ["black", "(ч[её]рн|black)\\w*"], ["red", "(красн|red)\\w*"],
	["orange", "(оранж|orange|amber|янтар)\\w*"], ["blue", "(син|голуб|blue)\\w*"], ["green", "(зел[её]н|green)\\w*"],
	["gold", "(золот|gold)\\w*"], ["gray", "(сер|gray|grey)\\w*"],
]

static func hash_text32(text: String) -> int:
	var h: int = 2166136261
	for i in text.length():
		h = h ^ text.unicode_at(i)
		h = (h * 16777619) & 0xFFFFFFFF
	return h & 0xFFFFFFFF

static func sanitize_world_command(input: String) -> String:
	var ctrl := RegEx.new()
	ctrl.compile("[\\x00-\\x1f\\x7f]")
	var s := ctrl.sub(input, " ", true)
	var ws := RegEx.new()
	ws.compile("\\s+")
	s = ws.sub(s, " ", true)
	s = s.strip_edges()
	if s.length() > 320:
		s = s.substr(0, 320)
	return s

## Returns a Dictionary: {"error": String} on empty input, or
## {"action": "undo"|"redo", "text", "seed"}, or
## {"action": "create", "type", "size", "scale", "color", "text", "seed"}.
static func parse_world_command(input: String) -> Dictionary:
	var text := sanitize_world_command(input)
	if text == "":
		return {"error": "Напиши, что должно появиться в мире."}
	var lower := text.to_lower()
	if lower == "отмени" or lower == "undo" or lower == "назад":
		return {"action": "undo", "text": text, "seed": hash_text32(text)}
	if lower == "повтори" or lower == "redo" or lower == "верни":
		return {"action": "redo", "text": text, "seed": hash_text32(text)}

	var type := "wish-sculpture"
	for pair in TYPE_ALIASES:
		var re := RegEx.new()
		re.compile(pair[1])
		if re.search(lower):
			type = pair[0]
			break

	var size := "medium"
	var scale := 1.0
	for trip in SIZE_ALIASES:
		var re2 := RegEx.new()
		re2.compile(trip[1])
		if re2.search(lower):
			size = trip[0]
			scale = trip[2]
			break

	var color = null
	for pair2 in COLOR_ALIASES:
		var re3 := RegEx.new()
		re3.compile(pair2[1])
		if re3.search(lower):
			color = pair2[0]
			break

	return {
		"action": "create", "type": type, "size": size, "scale": scale, "color": color,
		"text": text, "seed": hash_text32(text),
	}
