class_name ThumpLayer
## Bodhran/fist strike — direct port of the web engine's getThumpBufferBase().
## Seven layers: knuckle crack, flesh slap, wood ring, finger rattle,
## fundamental thud, second mode, sub weight.

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
	var buf_len := int(sr * duration_sec)
	_buffer = PackedFloat32Array()
	_buffer.resize(buf_len)

	# Seeded PRNG for deterministic noise (matches web)
	var _prng := PackedInt32Array([48271])
	var noise_fn := func() -> float:
		_prng[0] = (_prng[0] * 16807) % 2147483647
		return float(_prng[0]) / 2147483647.0 * 2.0 - 1.0

	var fade_in_n := int(sr * 0.0003)   # 0.3ms
	var fade_out_n := int(sr * 0.006)

	# ── Layer 1: Knuckle crack (750 Hz bandpass noise, 18ms) ──
	var knuckle_len := int(sr * 0.018)
	var knuckle := PackedFloat32Array()
	knuckle.resize(buf_len)
	var kn_lp := 0.0; var kn_bp := 0.0; var kn_hp := 0.0
	var kn_w0 := TAU * 750.0 / sr
	for i in range(buf_len):
		var inp: float = noise_fn.call() if i < knuckle_len else 0.0
		kn_hp = inp - kn_lp - 0.7 * kn_bp
		kn_bp += kn_w0 * kn_hp
		kn_lp += kn_w0 * kn_bp
		var t := float(i) / sr
		var att: float = float(i) / float(maxi(1, int(sr * 0.0004))) if i < int(sr * 0.0004) else 1.0
		var env := exp(-t * 85.0) * att
		knuckle[i] = kn_bp * env * 0.6

	# ── Layer 2: Flesh slap (2200 Hz bandpass noise, 8ms, 1ms delayed) ──
	var slap_delay := int(sr * 0.001)
	var slap_len := int(sr * 0.008)
	var slap := PackedFloat32Array()
	slap.resize(buf_len)
	var sl_lp := 0.0; var sl_bp := 0.0; var sl_hp := 0.0
	var sl_w0 := TAU * 2200.0 / sr
	for i in range(buf_len):
		var si := i - slap_delay
		var inp: float = noise_fn.call() if (si >= 0 and si < slap_len) else 0.0
		sl_hp = inp - sl_lp - 0.8 * sl_bp
		sl_bp += sl_w0 * sl_hp
		sl_lp += sl_w0 * sl_bp
		var t := float(maxi(0, si)) / sr
		var att: float = float(si) / float(maxi(1, int(sr * 0.0003))) if (si >= 0 and si < int(sr * 0.0003)) else 1.0
		var env: float = exp(-t * 200.0) * att if si >= 0 else 0.0
		slap[i] = sl_bp * env * 0.3

	# ── Layer 3: Wood ring (480 Hz asymmetric sine) ──
	var wood_ring := PackedFloat32Array()
	wood_ring.resize(buf_len)
	for i in range(buf_len):
		var t := float(i) / sr
		var raw := sin(TAU * 480.0 * t)
		var asym: float = raw if raw > 0.0 else raw * 0.35
		var env := exp(-t * 55.0)
		wood_ring[i] = asym * env * 0.15

	# ── Layer 4: Finger rattle (4500 Hz bandpass noise, 3ms, 2ms delayed) ──
	var rattle_delay := int(sr * 0.002)
	var rattle_len := int(sr * 0.003)
	var rattle := PackedFloat32Array()
	rattle.resize(buf_len)
	var rt_lp := 0.0; var rt_bp := 0.0; var rt_hp := 0.0
	var rt_w0 := TAU * 4500.0 / sr
	for i in range(buf_len):
		var ri := i - rattle_delay
		var inp: float = noise_fn.call() * 0.6 if (ri >= 0 and ri < rattle_len) else 0.0
		rt_hp = inp - rt_lp - 1.0 * rt_bp
		rt_bp += rt_w0 * rt_hp
		rt_lp += rt_w0 * rt_bp
		var t := float(maxi(0, ri)) / sr
		var env: float = exp(-t * 450.0) if ri >= 0 else 0.0
		rattle[i] = rt_bp * env * 0.08

	# ── Pitched layers (phase accumulators) ──
	var phase1 := 0.0  # fundamental
	var phase2 := 0.0  # second mode
	var phase3 := 0.0  # low mode

	for i in range(buf_len):
		var t := float(i) / sr

		# Layer 5 — Fundamental thud (pitch-swept sine)
		var f1 := start_hz * exp(-t * pitch_decay) + end_hz
		phase1 += f1 / sr
		var fund := sin(phase1 * TAU) * exp(-t * amp_decay) * 1.0

		# Layer 6 — Second mode at 2.2x (wood overtone)
		var f2 := f1 * 2.2
		phase2 += f2 / sr
		var mode2 := sin(phase2 * TAU) * exp(-t * amp_decay * 2.5) * 0.22

		# Layer 7 — Low weight
		var low_hz := end_hz * 0.65
		phase3 += low_hz / sr
		var low_mode := sin(phase3 * TAU) * exp(-t * amp_decay * 3.0) * 0.70

		# Sum all layers
		var sample := knuckle[i] + slap[i] + wood_ring[i] + rattle[i] + fund + mode2 + low_mode

		# Anti-click fade envelope
		if i < fade_in_n:
			sample *= float(i) / float(maxi(1, fade_in_n))
		if i > buf_len - fade_out_n:
			sample *= float(buf_len - i) / float(maxi(1, fade_out_n))

		_buffer[i] = sample

	# Smooth the whole buffer with a LPF to kill remaining harshness
	var smooth := BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 800.0, 0.5, sr)
	for i in range(buf_len):
		_buffer[i] = smooth.process_sample(_buffer[i])

	# Normalize
	var peak := 0.0
	for i in range(buf_len):
		peak = maxf(peak, absf(_buffer[i]))
	if peak > 0.01:
		var scale := 0.92 / peak
		for i in range(buf_len):
			_buffer[i] *= scale


var _rate: float = 1.0
var _frac_playhead: float = 0.0

func trigger(velocity: float, gain_level: float) -> void:
	_ensure_buffer()
	_playhead = 0
	_frac_playhead = 0.0
	# Humanize: velocity jitter +-12%, playback rate +-1.5%
	_play_gain = velocity * gain_level * (0.88 + randf() * 0.24)
	_rate = 0.985 + randf() * 0.03


func next_sample() -> float:
	if _playhead < 0 or _playhead >= _buffer.size():
		return 0.0
	var idx := int(_frac_playhead)
	if idx >= _buffer.size() - 1:
		_playhead = _buffer.size()
		return 0.0
	var frac := _frac_playhead - float(idx)
	var s := (_buffer[idx] * (1.0 - frac) + _buffer[idx + 1] * frac) * _play_gain
	_frac_playhead += _rate
	_playhead = int(_frac_playhead)
	return s
