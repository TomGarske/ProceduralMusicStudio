extends Control
## Simple demo UI for testing the procedural music engine.

@onready var music: AudioStreamPlayer = $"../ProceduralMusic"
@onready var play_btn: Button = $VBoxContainer/PlayButton
@onready var bpm_slider: HSlider = $VBoxContainer/BPMContainer/BPMSlider
@onready var bpm_label: Label = $VBoxContainer/BPMContainer/BPMLabel
@onready var vol_slider: HSlider = $VBoxContainer/VolumeContainer/VolumeSlider
@onready var phase_label: Label = $VBoxContainer/PhaseLabel
@onready var preset_option: OptionButton = $VBoxContainer/PresetOption

var _is_playing := false

const PRESETS := [
	"blow-the-man-down",
	"drunken-sailor",
	"haul-away-joe",
	"south-australia",
	"spanish-ladies",
	"wellerman",
]


func _ready() -> void:
	play_btn.pressed.connect(_on_play_pressed)
	bpm_slider.value_changed.connect(_on_bpm_changed)
	vol_slider.value_changed.connect(_on_volume_changed)
	preset_option.item_selected.connect(_on_preset_selected)

	bpm_slider.min_value = 90
	bpm_slider.max_value = 130
	bpm_slider.value = 115
	bpm_label.text = "115 BPM"

	vol_slider.min_value = 0
	vol_slider.max_value = 100
	vol_slider.value = 100

	for p: String in PRESETS:
		preset_option.add_item(p.replace("-", " ").capitalize())

	# Load the first preset so it matches the dropdown
	music.apply_preset("res://presets/%s.json" % PRESETS[0])

	music.phase_changed.connect(_on_phase_changed)


func _on_play_pressed() -> void:
	if _is_playing:
		music.stop_music()
		play_btn.text = "Play"
	else:
		music.play_music()
		play_btn.text = "Stop"
	_is_playing = not _is_playing


func _on_bpm_changed(value: float) -> void:
	bpm_label.text = "%d BPM" % int(value)
	music.set_bpm(value)


func _on_volume_changed(value: float) -> void:
	music.set_volume(value / 100.0)


func _on_preset_selected(idx: int) -> void:
	var was_playing := _is_playing
	if was_playing:
		music.stop_music()
	music.apply_preset("res://presets/%s.json" % PRESETS[idx])
	if was_playing:
		music.play_music()


func _on_phase_changed(_id: String, label: String) -> void:
	phase_label.text = label


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_SPACE:
		_on_play_pressed()
		get_viewport().set_input_as_handled()
