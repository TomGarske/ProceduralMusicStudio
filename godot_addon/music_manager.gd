## music_manager.gd
## Autoload singleton — add to Project > Project Settings > Autoload
## Node name: MusicManager
##
## Usage from anywhere in your game:
##   MusicManager.play()
##   MusicManager.stop()
##   MusicManager.seek_to_phase("chorus1")
##   MusicManager.set_volume(0.8)   # 0.0 – 1.0

extends Node

signal phase_changed(phase_id: String, phase_label: String)
signal chord_changed(chord_name: String)

var _is_web: bool = false
var _desktop_engine: Node = null

func _ready() -> void:
	_is_web = OS.get_name() == "Web"

	if _is_web:
		_setup_web()
	else:
		var DesktopEngine = load("res://addons/procedural_music/desktop_engine.gd")
		_desktop_engine = DesktopEngine.new()
		add_child(_desktop_engine)
		_desktop_engine.phase_changed.connect(_on_phase_changed)
		_desktop_engine.chord_changed.connect(_on_chord_changed)

# ── Public API ────────────────────────────────────────────────────────────────

func play() -> void:
	if _is_web:
		JavaScriptBridge.eval("if(window._music) window._music.play();")
	else:
		if _desktop_engine:
			_desktop_engine.play()

func stop() -> void:
	if _is_web:
		JavaScriptBridge.eval("if(window._music) window._music.stop();")
	else:
		if _desktop_engine:
			_desktop_engine.stop()

func seek_to_phase(phase_id: String) -> void:
	if _is_web:
		JavaScriptBridge.eval("if(window._music) window._music.seekToPhase('%s');" % phase_id)
	else:
		if _desktop_engine:
			_desktop_engine.seek_to_phase(phase_id)

## volume: 0.0 (silent) to 1.0 (full)
func set_volume(volume: float) -> void:
	volume = clampf(volume, 0.0, 1.0)
	if _is_web:
		JavaScriptBridge.eval("if(window._music) window._music.setVolume(%f);" % volume)
	else:
		if _desktop_engine:
			_desktop_engine.set_volume(volume)

## intensity: 0.2-2.0, speed: 0.2-3.0, tone is reserved (kept neutral)
func set_profile(intensity: float, speed: float, tone: float) -> void:
	intensity = clampf(intensity, 0.2, 2.0)
	speed = clampf(speed, 0.2, 3.0)
	tone = 1.0
	if _is_web:
		# Web bridge currently supports play/stop/seek/volume only.
		return
	if _desktop_engine:
		_desktop_engine.set_profile(intensity, speed, tone)

# ── Web setup ─────────────────────────────────────────────────────────────────

func _setup_web() -> void:
	# Load the JS engine from the addon folder and inject it
	var js_path = "res://addons/procedural_music/web/music_engine.js"
	var file = FileAccess.open(js_path, FileAccess.READ)
	if not file:
		push_error("MusicManager: could not open music_engine.js at " + js_path)
		return
	var js_code = file.get_as_text()
	file.close()
	JavaScriptBridge.eval(js_code)
	# Wire JS callbacks back to GDScript signals.
	# Godot 4.6 does not expose set_object_method, so inject the callback object directly.
	var cb = JavaScriptBridge.create_callback(_on_js_event)
	JavaScriptBridge.get_interface("window")._musicGDCallback = cb
	# Slight delay to ensure the eval has settled.
	await get_tree().create_timer(0.1).timeout
	JavaScriptBridge.eval("if(window._music && window._musicGDCallback) window._music.setGDCallback(window._musicGDCallback);")

func _on_js_event(args) -> void:
	if args.size() < 2:
		return
	var event_type: String = str(args[0])
	var payload: String = str(args[1])
	match event_type:
		"phase":
			var parts = payload.split("|")
			if parts.size() >= 2:
				phase_changed.emit(parts[0], parts[1])
		"chord":
			chord_changed.emit(payload)

func _on_phase_changed(phase_id: String, label: String) -> void:
	phase_changed.emit(phase_id, label)

func _on_chord_changed(chord: String) -> void:
	chord_changed.emit(chord)
