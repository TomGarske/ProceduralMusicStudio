class_name ThumpLayer
## Bodhran/fist drum strike via pre-rendered buffer.
## Multi-layer physical model using proper biquad filters for natural,
## warm drum timbre. Layers: knuckle crack, flesh slap, wood ring,
## fundamental thud, second mode, sub weight, finger rattle.

var sample_rate: float
var _buffer: PackedFloat32Array
var _buffer_valid: bool = false
var _playhead: int = -1
var _play_gain: float = 0.0

# Config
var duration_sec: float = 0.55
var start_hz: float = 110.0
var end_hz: float = 48.0
var pitch_decay: float = 12.0
var amp_decay: float = 6.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_config(config: Dictionary) -> void:
	duration_sec = config.get("durationSec", 0.55)
	start_hz = config.get("startHz", 110.0)
	end_hz = config.get("endHz", 48.0)
	pitch_decay = config.get("pitchDecay", 12.0)
	amp_decay = config.get("ampDecay", 6.0)
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

	# Layer 1: Knuckle crack — warm bandpass-filtered noise burst
	var knuckle := PackedFloat32Array()
	knuckle.resize(len)
	var kn_bp := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, 750.0, 0.7, sr)
	var kn_burst := int(sr * 0.018)
	for i in range(len):
		var t := float(i) / sr
		var raw: float = noise_fn.call() if i < kn_burst else 0.0
		var env := exp(-t * 85.0) * 0.7
		knuckle[i] = kn_bp.process_sample(raw) * env

	# Layer 2: Flesh slap — mid-high filtered noise, 1ms delayed
	var slap := PackedFloat32Array()
	slap.resize(len)
	var sl_bp := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, 2200.0, 0.8, sr)
	var slap_delay := int(sr * 0.001)
	var slap_end := slap_delay + int(sr * 0.008)
	for i in range(len):
		var t := float(i) / sr
		var raw: float = noise_fn.call() if (i >= slap_delay and i < slap_end) else 0.0
		var env := exp(-t * 200.0) * 1.0
		slap[i] = sl_bp.process_sample(raw) * env

	# Layer 3: Wood ring — asymmetric half-sine at 480Hz with harmonic color
	var ring := PackedFloat32Array()
	ring.resize(len)
	var ring_dur := int(sr * 0.015)
	for i in range(len):
		var t := float(i) / sr
		if i < ring_dur:
			var env := exp(-t * 55.0) * 0.55
			var raw_sin := sin(TAU * 480.0 * t)
			ring[i] = maxf(0.0, raw_sin) * env
		else:
			ring[i] = 0.0

	# Layer 4: Fundamental thud — pitch-swept sine (the warm body of the hit)
	var thud := PackedFloat32Array()
	thud.resize(len)
	var thud_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := end_hz + (start_hz - end_hz) * exp(-t * pitch_decay)
		thud_phase += freq / sr
		thud_phase -= floorf(thud_phase)
		var env := exp(-t * amp_decay) * 0.65
		thud[i] = sin(thud_phase * TAU) * env

	# Layer 5: Second mode — 2.2x wood overtone with fast decay
	var mode2 := PackedFloat32Array()
	mode2.resize(len)
	var m2_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := (end_hz + (start_hz - end_hz) * exp(-t * pitch_decay)) * 2.2
		m2_phase += freq / sr
		m2_phase -= floorf(m2_phase)
		var env := exp(-t * 15.0) * 0.18
		mode2[i] = sin(m2_phase * TAU) * env

	# Layer 6: Sub thud — deep low-end weight
	var sub := PackedFloat32Array()
	sub.resize(len)
	var sub_phase := 0.0
	for i in range(len):
		var t := float(i) / sr
		var freq := 30.0 + 15.0 * exp(-t * 12.0)
		sub_phase += freq / sr
		sub_phase -= floorf(sub_phase)
		var env := exp(-t * 18.0) * 0.45
		sub[i] = sin(sub_phase * TAU) * env

	# Layer 7: Finger rattle — gentle high-freq bandpass noise, delayed 2ms
	var rattle := PackedFloat32Array()
	rattle.resize(len)
	var rt_bp := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, 4500.0, 1.0, sr)
	var rattle_delay := int(sr * 0.002)
	var rattle_end := rattle_delay + int(sr * 0.003)
	for i in range(len):
		var t := float(i) / sr
		var raw: float = noise_fn.call() if (i >= rattle_delay and i < rattle_end) else 0.0
		var env := exp(-t * 300.0) * 0.25
		rattle[i] = rt_bp.process_sample(raw) * env

	# Sum all layers
	var peak := 0.0001
	for i in range(len):
		_buffer[i] = knuckle[i] + slap[i] + ring[i] + thud[i] + mode2[i] + sub[i] + rattle[i]
		peak = maxf(peak, absf(_buffer[i]))

	# Normalize and apply gentle warmth pass (LPF the whole buffer)
	var norm := 0.9 / peak
	var warmth := BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 3500.0, 0.5, sr)
	for i in range(len):
		_buffer[i] = warmth.process_sample(_buffer[i] * norm)


var _rate: float = 1.0  # playback rate variation

func trigger(velocity: float, gain_level: float) -> void:
	_ensure_buffer()
	_playhead = 0
	_frac_playhead = 0.0
	# Humanize: velocity jitter +-12%, playback rate variation +-1.5%
	_play_gain = velocity * gain_level * (0.88 + randf() * 0.24)
	_rate = 0.985 + randf() * 0.03


var _frac_playhead: float = 0.0  # fractional position for rate variation

func next_sample() -> float:
	if _playhead < 0 or _playhead >= _buffer.size():
		return 0.0
	# Linear interpolation for non-integer playback rates
	var idx := int(_frac_playhead)
	if idx >= _buffer.size() - 1:
		_playhead = _buffer.size()
		return 0.0
	var frac := _frac_playhead - float(idx)
	var s := (_buffer[idx] * (1.0 - frac) + _buffer[idx + 1] * frac) * _play_gain
	_frac_playhead += _rate
	_playhead = int(_frac_playhead)
	return s
