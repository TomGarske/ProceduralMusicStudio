extends AudioStreamPlayer
## Procedural Music Studio — Godot port of the Web Audio sea shanty engine.
## Attach to an AudioStreamPlayer node. Call play_music() to start.
##
## Public API mirrors the JS engine:
##   play_music() / stop_music()
##   apply_preset(path_or_dict)
##   set_bpm(bpm), set_key(key), set_volume(v), set_layer(name, v)
##   set_phase_loop(id_or_null)

signal phase_changed(id: String, label: String)
signal chord_changed(name: String)
signal beat_fired(step: int, phase_id: String)

const SAMPLE_RATE := 44100.0
const BUFFER_SIZE := 1024  # frames to push per _process

# ── Layers ──
var arp: ArpLayer
var thump: ThumpLayer
var piano_layer: PianoLayer
var pad: PadLayer
var bass: BassLayer
var drone: DroneLayer
var voice_bass: VoiceLayer
var voice_baritone: VoiceLayer
var voice_tenor: VoiceLayer

# ── Preset data ──
var _preset: Dictionary = {}
var _key_offsets: Dictionary = {}
var _base_notes_hz: Dictionary = {}
var _velocities: Array = []
var _arp_pattern: Array = []  # Hz values (0 = hold)
var _chord_voicings: Dictionary = {}
var _drone_voicings: Array = []
var _layer_configs: Dictionary = {}
var _phase_filter_hz: Dictionary = {}


# ── Phase timeline ──
var _phases: Array = []  # processed phase objects with start/end in samples
var _active_phases: Array = []
var _scripted_total_samples: int = 0
var _current_phase: Dictionary = {}
var _phase_loop_id: String = ""
var _last_played_chord: Dictionary = {}

# ── Playback state ──
var _playing: bool = false
var _bpm: float = 120.0
var _key_id: String = "Dm"
var _volume: float = 1.0
var _sample_pos: int = 0  # global sample position in timeline
var _step: int = 0  # 16th note step counter
var _piano_bar_count: int = 0
var _next_tick_sample: int = 0  # sample position of next 16th note

# Per-layer gain multipliers (user override, 0-2)
var _layer_mult: Dictionary = {
	"arp": 1.0, "thump": 1.0, "piano": 1.0, "pad": 1.0,
	"bass": 1.0, "drone": 1.0, "voiceBass": 1.0, "voiceBaritone": 1.0, "voiceTenor": 1.0,
}

# Layer scale factors (loaded from preset layerMix — defaults are neutral)
var _layer_scale: Dictionary = {
	"arp": 1.0, "thump": 1.0, "piano": 1.0, "pad": 1.0,
	"bass": 1.0, "drone": 1.0, "voiceBass": 1.0, "voiceBaritone": 1.0, "voiceTenor": 1.0,
}

var _playback: AudioStreamGeneratorPlayback
var _generator: AudioStreamGenerator

const MIN_AUDIBLE := 0.3


func _ready() -> void:
	_init_layers()
	_load_default_preset()
	_setup_audio_stream()


func _init_layers() -> void:
	arp = ArpLayer.new(SAMPLE_RATE)
	thump = ThumpLayer.new(SAMPLE_RATE)
	piano_layer = PianoLayer.new(SAMPLE_RATE)
	pad = PadLayer.new(SAMPLE_RATE)
	bass = BassLayer.new(SAMPLE_RATE)
	drone = DroneLayer.new(SAMPLE_RATE)

	voice_bass = VoiceLayer.new(SAMPLE_RATE)
	voice_bass.set_part("voiceBass", {
		"min_hz": 65.41, "max_hz": 130.81, "formant_shift": -120.0,
		"gain_mul": 1.08, "vibrato_mul": 0.75, "breath_mul": 0.78,
		"detune_mul": 0.72, "max_voices": 2,
	})

	voice_baritone = VoiceLayer.new(SAMPLE_RATE)
	voice_baritone.set_part("voiceBaritone", {
		"min_hz": 98.0, "max_hz": 196.0, "formant_shift": -60.0,
		"gain_mul": 0.94, "vibrato_mul": 0.88, "breath_mul": 0.9,
		"detune_mul": 0.86, "max_voices": 2,
	})

	voice_tenor = VoiceLayer.new(SAMPLE_RATE)
	voice_tenor.set_part("voiceTenor", {
		"min_hz": 146.83, "max_hz": 293.66, "formant_shift": 15.0,
		"gain_mul": 0.8, "vibrato_mul": 1.0, "breath_mul": 1.0,
		"detune_mul": 1.0, "max_voices": 3,
	})


func _setup_audio_stream() -> void:
	_generator = AudioStreamGenerator.new()
	_generator.mix_rate = SAMPLE_RATE
	_generator.buffer_length = 0.1
	stream = _generator


func _load_default_preset() -> void:
	var path := "res://presets/drunken-sailor.json"
	apply_preset(path)


# ── Preset loading ──

func apply_preset(source) -> bool:
	var data: Dictionary
	if source is String:
		var file := FileAccess.open(source, FileAccess.READ)
		if not file:
			push_error("ProceduralMusic: cannot open preset: %s" % source)
			return false
		var json := JSON.new()
		var err := json.parse(file.get_as_text())
		if err != OK:
			push_error("ProceduralMusic: JSON parse error: %s" % json.get_error_message())
			return false
		data = json.data
	elif source is Dictionary:
		data = source
	else:
		return false

	if data.get("schemaVersion") != 1:
		push_error("ProceduralMusic: unsupported schema version")
		return false

	_preset = data
	_key_offsets = data.get("keyOffsets", {}) as Dictionary
	_base_notes_hz = data.get("baseNotesHz", {}) as Dictionary
	_velocities = data.get("velocities", []) as Array
	_chord_voicings = data.get("chordVoicings", {}) as Dictionary
	_drone_voicings = data.get("droneVoicings", []) as Array
	_phase_filter_hz = data.get("phaseFilterHz", {}) as Dictionary
	_layer_configs = data.get("layerConfigs", {}) as Dictionary

	var defaults: Dictionary = data.get("defaults", {}) as Dictionary
	_bpm = float(defaults.get("bpm", 120.0))
	_key_id = str(defaults.get("key", "Dm"))

	# Layer mix scales
	var mix: Dictionary = data.get("layerMix", {}) as Dictionary
	for k: String in mix:
		if _layer_scale.has(k):
			_layer_scale[k] = float(mix[k])

	# Build arp pattern (convert note names to Hz)
	var raw_arp: Array = data.get("arpPattern", []) as Array
	_arp_pattern = _convert_arp_pattern(raw_arp)

	# Build phase timeline
	_build_phases(data.get("phases", []) as Array)

	# Apply layer configs
	if _layer_configs.has("arp"):
		arp.apply_config(_layer_configs["arp"] as Dictionary)
	if _layer_configs.has("thump"):
		thump.apply_config(_layer_configs["thump"] as Dictionary)
	if _layer_configs.has("piano"):
		piano_layer.apply_config(_layer_configs["piano"] as Dictionary)
	if _layer_configs.has("pad"):
		pad.apply_config(_layer_configs["pad"] as Dictionary)
	if _layer_configs.has("bass"):
		bass.apply_config(_layer_configs["bass"] as Dictionary)
	if _layer_configs.has("drone"):
		drone.apply_config(_layer_configs["drone"] as Dictionary)
	if _layer_configs.has("voices"):
		var vc: Dictionary = _layer_configs["voices"] as Dictionary
		voice_bass.apply_voice_config(vc)
		voice_baritone.apply_voice_config(vc)
		voice_tenor.apply_voice_config(vc)

	# Reset playback
	_sample_pos = 0
	_step = 0
	_piano_bar_count = 0
	_next_tick_sample = 0
	_current_phase = {}
	_last_played_chord = {}

	return true


func _convert_arp_pattern(raw: Array) -> Array:
	var result := []
	for note_name: Variant in raw:
		if str(note_name) == "-":
			result.append(0.0)  # hold
		else:
			var hz: float = _note_hz(str(note_name))
			hz = _fit_freq_to_range(hz, 65.41, 261.63)
			result.append(hz)
	return result


func _note_hz(note_name: String) -> float:
	var base: float = float(_base_notes_hz.get(note_name, 0.0))
	return base * _key_ratio()


func _key_ratio() -> float:
	var semis: float = float(_key_offsets.get(_key_id, 0))
	return pow(2.0, semis / 12.0)


func _fit_freq_to_range(freq: float, min_hz: float, max_hz: float) -> float:
	var out := freq if is_finite(freq) and freq > 0 else min_hz
	while out < min_hz:
		out *= 2.0
	while out > max_hz:
		out *= 0.5
	return out


func _build_phases(raw_phases: Array) -> void:
	var beats_to_sec := 60.0 / _bpm
	var start_sample := 0
	_phases = []
	for p: Variant in raw_phases:
		var pd: Dictionary = p as Dictionary
		var dur_beats: float = pd.get("durationBeats", 32)
		var dur_sec := dur_beats * beats_to_sec
		var dur_samples := int(dur_sec * SAMPLE_RATE)
		var phase := {
			"id": pd.get("id", ""),
			"label": pd.get("label", ""),
			"start": start_sample,
			"end": start_sample + dur_samples,
			"chordSeq": pd.get("chordSeq", []),
			"droneMode": pd.get("droneMode", false),
			"lv": _normalize_levels(pd.get("lv", {})),
		}
		# Per-phase arp pattern
		if pd.has("arpPattern"):
			phase["arpPattern"] = _convert_arp_pattern(pd["arpPattern"])
		_phases.append(phase)
		start_sample += dur_samples

	_active_phases = _phases.duplicate()
	_scripted_total_samples = start_sample


func _normalize_levels(levels: Dictionary) -> Dictionary:
	var out := {}
	for key: String in levels:
		var v: float = float(levels[key])
		if v <= 0:
			out[key] = 0.0
		else:
			out[key] = maxf(MIN_AUDIBLE, v) if v > 0 else 0.0
	return out


# ── Phase lookup ──

func _get_phase_at(sample: int) -> Dictionary:
	if _phase_loop_id != "":
		for pi in range(_active_phases.size()):
			var phase: Dictionary = _active_phases[pi] as Dictionary
			if str(phase["id"]) == _phase_loop_id:
				return phase

	if _scripted_total_samples <= 0:
		return (_active_phases[0] as Dictionary) if _active_phases.size() > 0 else {}

	var t: int = ((sample % _scripted_total_samples) + _scripted_total_samples) % _scripted_total_samples
	for i in range(_active_phases.size() - 1, -1, -1):
		var phase: Dictionary = _active_phases[i] as Dictionary
		if t >= int(phase["start"]):
			return phase
	return (_active_phases[0] as Dictionary) if _active_phases.size() > 0 else {}


# ── Chord resolution ──

func _resolve_chord(chord_name: String) -> Dictionary:
	var voicing: Dictionary = _chord_voicings.get(chord_name, {}) as Dictionary
	if voicing.is_empty():
		return {}
	var notes: Array = voicing.get("notes", []) as Array
	var hz_notes := []
	for n: Variant in notes:
		hz_notes.append(_note_hz(str(n)))
	return {"name": voicing.get("label", chord_name), "notes": hz_notes}


func _get_pad_voicing(chord: Dictionary) -> Array:
	var notes: Array = chord.get("notes", [])
	var n0: float = float(notes[0]) if notes.size() > 0 else 73.42
	var n1: float = float(notes[1]) if notes.size() > 1 else 110.0
	var nlast: float = float(notes[notes.size() - 1]) if notes.size() > 0 else 146.83
	return [
		_fit_freq_to_range(n0, 65.41, 110.0),
		_fit_freq_to_range(n1, 98.0, 164.81),
		_fit_freq_to_range(nlast, 130.81, 246.94),
	]


func _get_bass_voicing(chord: Dictionary) -> Dictionary:
	var notes: Array = chord.get("notes", [])
	var n0: float = float(notes[0]) if notes.size() > 0 else 73.42
	var n1: float = float(notes[1]) if notes.size() > 1 else 110.0
	return {
		"root": _fit_freq_to_range(n0, 41.2, 98.0),
		"fifth": _fit_freq_to_range(n1, 55.0, 146.83),
	}


func _get_drone_voicing(chord: Dictionary, lead_fifth: bool = false) -> Dictionary:
	var notes: Array = chord.get("notes", [])
	var n0: float = float(notes[0]) if notes.size() > 0 else 73.42
	var n1: float = float(notes[1]) if notes.size() > 1 else 110.0
	var root := _fit_freq_to_range(n0, 41.2, 98.0)
	var fifth := _fit_freq_to_range(n1, 55.0, 146.83)
	if lead_fifth:
		return {"main": fifth, "support": _fit_freq_to_range(root, 55.0, 110.0)}
	return {"main": root, "support": fifth}


func _get_crew_voicing(chord: Dictionary) -> Dictionary:
	var notes: Array = chord.get("notes", [])
	var bass_src: float = float(notes[0]) if notes.size() > 0 else 73.42
	var bari_src: float = float(notes[1]) if notes.size() > 1 else bass_src * 1.5
	var tenor_src: float = float(notes[2]) if notes.size() > 2 else bari_src * 1.25

	var bass_hz := _fit_freq_to_range(bass_src, 65.41, 130.81)
	var bari_hz := _fit_freq_to_range(bari_src, 98.0, 196.0)
	while bari_hz <= bass_hz * 1.02:
		bari_hz *= 2.0
	bari_hz = minf(bari_hz, 196.0)
	var tenor_hz := _fit_freq_to_range(tenor_src, 146.83, 293.66)
	while tenor_hz <= bari_hz * 1.02:
		tenor_hz *= 2.0
	tenor_hz = minf(tenor_hz, 293.66)

	return {"voiceBass": bass_hz, "voiceBaritone": bari_hz, "voiceTenor": tenor_hz}


# ── Sixteenth note duration in samples ──

func _s16_samples() -> int:
	return int(60.0 / _bpm / 4.0 * SAMPLE_RATE)


# ── Tick (called every 16th note) ──

func _tick() -> void:
	var ph := _get_phase_at(_sample_pos)
	if ph.is_empty():
		return

	var lv: Dictionary = ph.get("lv", {}) as Dictionary
	var ph_arp: Array = (ph.get("arpPattern", _arp_pattern) as Array) if ph.has("arpPattern") else _arp_pattern
	var idx: int = _step % ph_arp.size() if ph_arp.size() > 0 else 0
	var bar_idx: int = _step % 16

	# Phase change detection
	if str(ph.get("id", "")) != str(_current_phase.get("id", "")):
		var prev := _current_phase
		if not prev.is_empty() and int(ph.get("start", 0)) < int(prev.get("start", 0)):
			_step = 0
			_piano_bar_count = 0
			_last_played_chord = {}
		_current_phase = ph
		# Update arp filter for new phase
		var filter_hz: float = float(_phase_filter_hz.get(str(ph["id"]), 700.0))
		arp.set_filter_cutoff(filter_hz)
		phase_changed.emit(str(ph["id"]), str(ph["label"]))

	beat_fired.emit(bar_idx, str(ph.get("id", "")))

	# ── Arp layer ──
	var freq: float = float(ph_arp[idx]) if idx < ph_arp.size() else 0.0
	var vel: float = float(_velocities[bar_idx % _velocities.size()]) if _velocities.size() > 0 else 0.5
	var av: float = float(lv.get("arp", 0.0)) * float(_layer_mult["arp"]) * float(_layer_scale["arp"])
	if freq > 0.0:
		arp.trigger_note(freq, vel, av, 60.0 / _bpm / 4.0)

	# ── Beat 1 and Beat 3 (bar_idx 0 and 8) ──
	if bar_idx == 0 or bar_idx == 8:
		# Thump
		var thump_gain: float = float(lv.get("thump", 0.0)) * float(_layer_mult["thump"]) * float(_layer_scale["thump"])
		var thump_vel := 1.0 if bar_idx == 0 else 0.82
		if thump_gain > 0.02:
			thump.trigger(thump_vel, thump_gain)

		# Chord resolution
		if bar_idx == 0:
			var seq: Array = ph.get("chordSeq", []) as Array
			if seq.size() > 0:
				var chord_name: String = str(seq[_piano_bar_count % seq.size()])
				_last_played_chord = _resolve_chord(chord_name)
				chord_changed.emit(chord_name)

				# Bass root on beat 1
				if not _last_played_chord.is_empty():
					var bass_voicing := _get_bass_voicing(_last_played_chord)
					bass.trigger_note(float(bass_voicing["root"]), 0.9)

			# Piano chord stab
			var piano_gain: float = float(lv.get("piano", 0.0)) * float(_layer_mult["piano"]) * float(_layer_scale["piano"])
			if not _last_played_chord.is_empty() and piano_gain > 0.02:
				piano_layer.trigger_chord(_last_played_chord["notes"] as Array, piano_gain)

			# Pad voicing update
			var pad_gain: float = float(lv.get("pad", 0.0)) * float(_layer_mult["pad"])
			if not _last_played_chord.is_empty() and pad_gain > 0.02:
				pad.set_voicing(_get_pad_voicing(_last_played_chord))

			_piano_bar_count += 1

		elif bar_idx == 8 and not _last_played_chord.is_empty():
			# Bass fifth on beat 3
			var bass_voicing := _get_bass_voicing(_last_played_chord)
			bass.trigger_note(float(bass_voicing["fifth"]), 0.82)

		# Drone support
		var drone_gain: float = float(lv.get("drone", 0.0)) * float(_layer_mult["drone"]) * float(_layer_scale["drone"])
		if not _last_played_chord.is_empty() and drone_gain > 0.012:
			var dv := _get_drone_voicing(_last_played_chord, bar_idx == 8)
			drone.set_voicing(float(dv["main"]), float(dv["support"]))
			drone.trigger_artic(drone_gain)
		else:
			drone.release_artic()

	# ── Crew voices on trigger steps ──
	var voices_cfg: Dictionary = _layer_configs.get("voices", {}) as Dictionary
	var trigger_steps: Array = voices_cfg.get("triggerSteps", [0, 8]) as Array
	if bar_idx in trigger_steps:
		var vb_gain: float = float(lv.get("voiceBass", 0.0)) * float(_layer_mult["voiceBass"]) * float(_layer_scale["voiceBass"])
		var vbari_gain: float = float(lv.get("voiceBaritone", 0.0)) * float(_layer_mult["voiceBaritone"]) * float(_layer_scale["voiceBaritone"])
		var vt_gain: float = float(lv.get("voiceTenor", 0.0)) * float(_layer_mult["voiceTenor"]) * float(_layer_scale["voiceTenor"])

		if not _last_played_chord.is_empty() and (vb_gain > 0.018 or vbari_gain > 0.018 or vt_gain > 0.018):
			var cv := _get_crew_voicing(_last_played_chord)
			voice_bass.trigger(float(cv["voiceBass"]), vb_gain, 0)
			voice_baritone.trigger(float(cv["voiceBaritone"]), vbari_gain, 1)
			voice_tenor.trigger(float(cv["voiceTenor"]), vt_gain, 2)

	_step += 1


# ── Audio generation ──

func _process(_delta: float) -> void:
	if not _playing or _playback == null:
		return

	var frames_available := _playback.get_frames_available()
	if frames_available <= 0:
		return

	var frames_to_fill := mini(frames_available, BUFFER_SIZE)
	var s16_dur := _s16_samples()

	for _i in range(frames_to_fill):
		# Fire tick at 16th note boundaries
		if _sample_pos >= _next_tick_sample:
			_tick()
			_next_tick_sample = _sample_pos + s16_dur

		# Generate one sample from all layers
		var sample := 0.0
		sample += arp.next_sample()
		sample += thump.next_sample()
		sample += piano_layer.next_sample()
		sample += pad.next_sample() * lv_gain("pad")
		sample += bass.next_sample() * lv_gain("bass")
		sample += drone.next_sample()
		sample += voice_bass.next_sample()
		sample += voice_baritone.next_sample()
		sample += voice_tenor.next_sample()

		# Master gain and compression (soft clip)
		sample *= _volume_to_gain()
		sample = _soft_clip(sample)

		_playback.push_frame(Vector2(sample, sample))
		_sample_pos += 1

		# Wrap around at end of timeline
		if _scripted_total_samples > 0 and _sample_pos >= _scripted_total_samples:
			_sample_pos = 0
			_step = 0
			_piano_bar_count = 0
			_next_tick_sample = 0
			_last_played_chord = {}


func lv_gain(layer_name: String) -> float:
	var ph := _current_phase
	if ph.is_empty():
		return 0.0
	var lv: Dictionary = ph.get("lv", {})
	return float(lv.get(layer_name, 0.0)) * float(_layer_mult.get(layer_name, 1.0)) * float(_layer_scale.get(layer_name, 1.0))


func _volume_to_gain() -> float:
	return _volume * 2.0


func _soft_clip(x: float) -> float:
	# Tanh soft clipper — prevents harsh digital clipping
	if absf(x) < 0.5:
		return x
	return tanh(x)


# ── Public API ──

func play_music() -> void:
	if _playing:
		return
	_playing = true
	_sample_pos = 0
	_step = 0
	_piano_bar_count = 0
	_next_tick_sample = 0
	_current_phase = {}
	_last_played_chord = {}
	play()
	_playback = get_stream_playback() as AudioStreamGeneratorPlayback


func stop_music() -> void:
	_playing = false
	stop()
	_playback = null


func set_bpm(new_bpm: float) -> void:
	_bpm = clampf(new_bpm, 40.0, 200.0)
	_build_phases(_preset.get("phases", []) as Array)


func set_key(key: String) -> void:
	if not _key_offsets.has(key):
		return
	_key_id = key
	# Rebuild arp pattern with new key
	_arp_pattern = _convert_arp_pattern(_preset.get("arpPattern", []))
	# Rebuild phase arp patterns too
	var raw_phases_arr: Array = _preset.get("phases", []) as Array
	for i in range(_phases.size()):
		if i < raw_phases_arr.size():
			var rp: Dictionary = raw_phases_arr[i] as Dictionary
			if rp.has("arpPattern"):
				_phases[i]["arpPattern"] = _convert_arp_pattern(rp["arpPattern"] as Array)
	_active_phases = _phases.duplicate()


func set_volume(v: float) -> void:
	_volume = clampf(v, 0.0, 1.0)


func set_layer(layer_name: String, value: float) -> void:
	if _layer_mult.has(layer_name):
		_layer_mult[layer_name] = clampf(value, 0.0, 2.0)


func set_phase_loop(id: Variant) -> void:
	if id == null:
		_phase_loop_id = ""
	elif id is String:
		_phase_loop_id = id as String


func get_state() -> Dictionary:
	return {
		"playing": _playing,
		"bpm": _bpm,
		"key": _key_id,
		"volume": _volume,
		"phase": _current_phase.get("id", ""),
		"phaseLabel": _current_phase.get("label", ""),
		"layers": _layer_mult.duplicate(),
	}
