extends VBoxContainer
## Wires the НАВИГАТОР panel's input box + tool buttons - the same
## interactive controls the browser version already has
## (shared/navigator-dialog.mjs), which the static Godot panel was
## missing. No world-generation backend exists in this standalone scene
## yet, so Create just acknowledges the input rather than building
## anything - Undo/Redo are placeholders for the same reason. Eye-mode
## is real: it calls the Eye's own cycle_mode().

## Absolute NodePaths in this project need the /root/ prefix to resolve
## from a nested caller - see error-prevention-registry.json's
## "godot-nodepath-absolute-unresolvable".
@export var eye_path: NodePath = ^"/root/Main/Eye"

var _eye: Node = null
var _mode_names := {"user": "ручной", "beacon": "огонёк", "idle": "живой"}

func _ready() -> void:
	if eye_path != NodePath(""):
		_eye = get_node_or_null(eye_path)
	var create_btn := get_node_or_null("InputRow/CreateButton")
	var input := get_node_or_null("InputRow/NavigatorInput")
	var undo_btn := get_node_or_null("ToolsRow/UndoButton")
	var redo_btn := get_node_or_null("ToolsRow/RedoButton")
	var eye_btn := get_node_or_null("ToolsRow/EyeModeButton")
	if create_btn:
		create_btn.pressed.connect(_on_create_pressed)
	if input:
		input.text_submitted.connect(func(_t): _on_create_pressed())
	if undo_btn:
		undo_btn.pressed.connect(func(): _set_status("нечего отменять"))
	if redo_btn:
		redo_btn.pressed.connect(func(): _set_status("нечего вернуть"))
	if eye_btn:
		eye_btn.pressed.connect(_on_eye_mode_pressed)

func _on_create_pressed() -> void:
	var input := get_node_or_null("InputRow/NavigatorInput")
	if not input:
		return
	var text: String = String(input.text).strip_edges()
	if text == "":
		return
	input.text = ""
	_set_status("навигатор думает…")
	await get_tree().create_timer(0.5).timeout
	_set_status("услышал: \"%s\"" % text)

func _on_eye_mode_pressed() -> void:
	if not _eye or not _eye.has_method("cycle_mode"):
		return
	var mode: String = _eye.cycle_mode()
	var eye_btn := get_node_or_null("ToolsRow/EyeModeButton")
	if eye_btn:
		eye_btn.text = "Глаз: %s" % String(_mode_names.get(mode, mode))

func _set_status(text: String) -> void:
	var status := get_node_or_null("ToolsRow/StatusLabel")
	if status:
		status.text = text
