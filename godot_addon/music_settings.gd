## music_settings.gd
## Procedural Music Studio — in-editor or in-game settings panel.
##
## Attach to music_settings.tscn root node.
## Requires MusicManager autoload (music_manager.gd) in the same project.
##
## Provides sliders for:
##   Intensity  — 0.2–2.0   (overall energy: affects layer gains)
##   Speed      — 0.2–3.0   (arp rate, independent of groove)
##   Volume     — 0.0–1.0
##   Reverb     — 0.0–0.60  (web only; desktop ignores)
## Phase seek buttons for all 7 song sections.
## Live display of current phase and chord.

extends Control

# ── Node references (assign in scene or autodetect) ─────────────────────────

@onready var _btn_play:       Button    = $VBox/Transport/BtnPlay
@onready var _lbl_phase:      Label     = $VBox/InfoRow/LblPhase
@onready var _lbl_chord:      Label     = $VBox/InfoRow/LblChord

@onready var _sl_intensity:   HSlider   = $VBox/Sliders/IntensityRow/Slider
@onready var _val_intensity:  Label     = $VBox/Sliders/IntensityRow/Value
@onready var _sl_speed:       HSlider   = $VBox/Sliders/SpeedRow/Slider
@onready var _val_speed:      Label     = $VBox/Sliders/SpeedRow/Value
@onready var _sl_volume:      HSlider   = $VBox/Sliders/VolumeRow/Slider
@onready var _val_volume:     Label     = $VBox/Sliders/VolumeRow/Value
@onready var _sl_reverb:      HSlider   = $VBox/Sliders/ReverbRow/Slider
@onready var _val_reverb:     Label     = $VBox/Sliders/ReverbRow/Value

@onready var _phase_buttons: HFlowContainer = $VBox/PhaseButtons

const PHASE_IDS    = ["intro","build1","verse1","chorus1","break","chorus2","outro"]
const PHASE_LABELS = ["Intro","Build 1","Verse","Chorus 1","Break","Chorus 2","Outro"]

var _playing := false

func _ready() -> void:
	# Default slider values
	_sl_intensity.min_value = 0.2;  _sl_intensity.max_value = 2.0;  _sl_intensity.step = 0.05; _sl_intensity.value = 1.0
	_sl_speed.min_value     = 0.2;  _sl_speed.max_value     = 3.0;  _sl_speed.step     = 0.05; _sl_speed.value     = 1.0
	_sl_volume.min_value    = 0.0;  _sl_volume.max_value    = 1.0;  _sl_volume.step    = 0.01; _sl_volume.value    = 0.6
	_sl_reverb.min_value    = 0.0;  _sl_reverb.max_value    = 0.60; _sl_reverb.step    = 0.01; _sl_reverb.value    = 0.16

	_update_value_labels()

	# Connect sliders
	_sl_intensity.value_changed.connect(_on_intensity_changed)
	_sl_speed.value_changed.connect(_on_speed_changed)
	_sl_volume.value_changed.connect(_on_volume_changed)
	_sl_reverb.value_changed.connect(_on_reverb_changed)
	_btn_play.pressed.connect(_on_play_pressed)

	# Build phase buttons
	for i in PHASE_IDS.size():
		var btn := Button.new()
		btn.text = PHASE_LABELS[i]
		btn.name = "Phase_" + PHASE_IDS[i]
		btn.toggle_mode = false
		btn.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		var pid := PHASE_IDS[i]   # capture
		btn.pressed.connect(func(): _on_phase_btn(pid))
		_phase_buttons.add_child(btn)

	# Wire MusicManager signals (if available)
	if Engine.has_singleton("MusicManager"):
		var mm = Engine.get_singleton("MusicManager")
		mm.phase_changed.connect(_on_phase_changed)
		mm.chord_changed.connect(_on_chord_changed)
	elif get_node_or_null("/root/MusicManager"):
		var mm = get_node("/root/MusicManager")
		mm.phase_changed.connect(_on_phase_changed)
		mm.chord_changed.connect(_on_chord_changed)

# ── Helpers ───────────────────────────────────────────────────────────────

func _get_music_manager() -> Node:
	if Engine.has_singleton("MusicManager"):
		return Engine.get_singleton("MusicManager")
	return get_node_or_null("/root/MusicManager")

func _update_value_labels() -> void:
	_val_intensity.text = "%.2f" % _sl_intensity.value
	_val_speed.text     = "%.2f" % _sl_speed.value
	_val_volume.text    = "%d%%" % int(_sl_volume.value * 100)
	_val_reverb.text    = "%d%%" % int(_sl_reverb.value * 100)

func _push_profile() -> void:
	var mm = _get_music_manager()
	if mm:
		mm.set_profile(_sl_intensity.value, _sl_speed.value, 1.0)

# ── Slider callbacks ──────────────────────────────────────────────────────

func _on_intensity_changed(_v: float) -> void:
	_val_intensity.text = "%.2f" % _sl_intensity.value
	_push_profile()

func _on_speed_changed(_v: float) -> void:
	_val_speed.text = "%.2f" % _sl_speed.value
	_push_profile()

func _on_volume_changed(v: float) -> void:
	_val_volume.text = "%d%%" % int(v * 100)
	var mm = _get_music_manager()
	if mm:
		mm.set_volume(v)

func _on_reverb_changed(v: float) -> void:
	_val_reverb.text = "%d%%" % int(v * 100)
	# Web-only: set_reverb is not exposed in music_manager's GDScript API
	# but can be passed via JavaScriptBridge if you extend it.
	var mm = _get_music_manager()
	if mm and mm.has_method("set_reverb"):
		mm.set_reverb(v)

# ── Button callbacks ──────────────────────────────────────────────────────

func _on_play_pressed() -> void:
	var mm = _get_music_manager()
	if not mm:
		return
	_playing = !_playing
	if _playing:
		mm.play()
		_btn_play.text = "■  Stop"
	else:
		mm.stop()
		_btn_play.text = "▶  Play"

func _on_phase_btn(phase_id: String) -> void:
	var mm = _get_music_manager()
	if not mm:
		return
	if not _playing:
		mm.play()
		_playing = true
		_btn_play.text = "■  Stop"
	mm.seek_to_phase(phase_id)

# ── MusicManager signal handlers ──────────────────────────────────────────

func _on_phase_changed(phase_id: String, label: String) -> void:
	_lbl_phase.text = label
	# Highlight active phase button
	for child in _phase_buttons.get_children():
		if child is Button:
			var is_active := child.name == "Phase_" + phase_id
			child.add_theme_color_override(
				"font_color",
				Color(0.0, 0.83, 1.0) if is_active else Color(0.6, 0.6, 0.6)
			)

func _on_chord_changed(chord_name: String) -> void:
	_lbl_chord.text = chord_name if chord_name != "" else "—"
