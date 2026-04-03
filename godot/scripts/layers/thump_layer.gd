class_name ThumpLayer
## Bodhran/fist drum strike via pre-rendered buffer.
## Multi-layer physical model: knuckle crack, flesh slap, wood ring,
## fundamental thud, second mode, sub weight, finger rattle.

var sample_rate: float
var _buffer: PackedFloat32Array
var _buffer_valid: bool = false
var _playhead: int = -1
var _play_gain: float = 0.0

# Config
var duration_sec: float = 0.55
var start_hz: float = 100.0
var end_hz: float = 42.0
var pitch_decay: float = 5.0
var amp_decay: float = 4.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_config(config: Dictionary) -> void:
	duration_sec = config.get("durationSec", 0.55)
	start_hz = config.get("startHz", 100.0)
	end_hz = config.get("endHz", 42.0)
	pitch_decay = config.get("pitchDecay", 5.0)
	amp_decay = config.get("ampDecay", 4.0)
	_buffer_valid = false


func _ensure_buffer() -> void:
	if _buffer_valid:
		return
	_render_buffer()
	_buffer_valid = true


func _render_buffer() -> void:
	var sr := sample_rate
	var len := int(sr * duration_sec)
	_buffer = PackedFloat32Array()
	_buffer.resize(len)

	# Seeded PRNG for deterministic noise
	var seed_val := 48271
	var noise_fn := func() -> float:
		seed_val = (seed_val * 16807) % 2147483647
		return float(seed_val) / 1073741823.5 - 1.0

	# Layer 1: Knuckle crack (wide-band noise, 300-1200Hz)
	var knuckle := PackedFloat32Array()
	knuckle.resize(len)
	var kn_lp := 0.0
	var kn_bp := 0.0
	var kn_fc := 750.0 / sr
	var kn_q := 0.7
	var kn_w0 := TAU * kn_fc
	for i in range(len):
		var t := float(i) / sr
		var raw: float = noise_fn.call() if i < int(sr * 0.018) else 0.0
		# State variable filter approximation
		kn_lp += kn_w0 * kn_bp
		kn_bp += kn_w0 * (raw - kn_lp - kn_q * kn_bp)
		var env := exp(-t * 55.0) * 0.7
		knuckle[i] = kn_bp * env

	# Layer 2: Flesh slap (mid-high noise, 1.2-3.5kHz)
	var slap := PackedFloat32Array()
	slap.resize(len)
	var sl_lp := 0.0
	var sl_bp := 0.0
	var sl_fc := 2200.0 / sr
	var sl_w0 := TAU * sl_fc
	var slap_delay := int(sr * 0.001)
	for i in range(len):
		var t := float(i) / sr
		var raw: float = noise_fn.call() if (i >= slap_delay and i < slap_delay + int(sr * 0.012)) else 0.0
		sl_lp += sl_w0 * sl_bp
		sl_bp += sl_w0 * (raw - sl_lp - 0.6 * sl_bp)
		var env := exp(-t * 80.0) * 0.45
		slap[i] = sl_bp * env

	# Layer 3: Wood ring (asymmetric sine at 480Hz)
	var ring := PackedFloat32Array()
	ring.resize(len)
	for i in range(len):
		var t := float(i) / sr
		if i < int(sr * 0.015):
			var env := exp(-t * 45.0) * 0.38
			ring[i] = sin(TAU * 480.0 * t) * env * (1.0 + 0.5 * sin(TAU * 960.0 * t))
		else:
			ring[i] = 0.0

	# Layer 4: Fundamental thud (pitch-swept sine)
	var thud := PackedFloat32Array()
	thud.resize(len)
	var thud_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := end_hz + (start_hz - end_hz) * exp(-t * pitch_decay)
		thud_phase += freq / sr
		thud_phase -= floorf(thud_phase)
		var env := exp(-t * amp_decay) * 0.85
		thud[i] = sin(thud_phase * TAU) * env

	# Layer 5: Second mode (1.6x fundamental)
	var mode2 := PackedFloat32Array()
	mode2.resize(len)
	var m2_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := (end_hz + (start_hz - end_hz) * exp(-t * pitch_decay)) * 1.6
		m2_phase += freq / sr
		m2_phase -= floorf(m2_phase)
		var env := exp(-t * (amp_decay * 1.8)) * 0.35
		mode2[i] = sin(m2_phase * TAU) * env

	# Layer 6: Sub thud (35-50Hz, very fast decay)
	var sub := PackedFloat32Array()
	sub.resize(len)
	var sub_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := 35.0 + 15.0 * exp(-t * 12.0)
		sub_phase += freq / sr
		sub_phase -= floorf(sub_phase)
		var env := exp(-t * 14.0) * 0.5
		sub[i] = sin(sub_phase * TAU) * env

	# Layer 7: Finger rattle (high-freq noise burst)
	var rattle := PackedFloat32Array()
	rattle.resize(len)
	for i in range(len):
		var t := float(i) / sr
		if i < int(sr * 0.003):
			rattle[i] = noise_fn.call() * exp(-t * 300.0) * 0.15
		else:
			rattle[i] = 0.0

	# Sum all layers and normalize
	var peak := 0.0001
	for i in range(len):
		_buffer[i] = knuckle[i] + slap[i] + ring[i] + thud[i] + mode2[i] + sub[i] + rattle[i]
		peak = maxf(peak, absf(_buffer[i]))

	var norm := 0.9 / peak
	for i in range(len):
		_buffer[i] *= norm


func trigger(velocity: float, gain_level: float) -> void:
	_ensure_buffer()
	_playhead = 0
	_play_gain = velocity * gain_level * (0.9 + randf() * 0.2)


func next_sample() -> float:
	if _playhead < 0 or _playhead >= _buffer.size():
		return 0.0
	var s := _buffer[_playhead] * _play_gain
	_playhead += 1
	return s
