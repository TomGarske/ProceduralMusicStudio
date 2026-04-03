class_name BiquadFilter
## Direct Form II biquad filter. Replaces Web Audio BiquadFilterNode.
## Supports lowpass, highpass, and bandpass modes.

enum Mode { LOWPASS, HIGHPASS, BANDPASS }

var mode: Mode = Mode.LOWPASS
var cutoff: float = 1000.0
var q: float = 0.707
var sample_rate: float = 44100.0

# Filter state (Direct Form II Transposed)
var _z1: float = 0.0
var _z2: float = 0.0
# Coefficients
var _a1: float = 0.0
var _a2: float = 0.0
var _b0: float = 1.0
var _b1: float = 0.0
var _b2: float = 0.0
var _dirty: bool = true


func _init(m: Mode = Mode.LOWPASS, freq: float = 1000.0, q_val: float = 0.707, sr: float = 44100.0) -> void:
	mode = m
	cutoff = freq
	q = q_val
	sample_rate = sr
	_dirty = true


func set_cutoff(freq: float) -> void:
	if not is_equal_approx(cutoff, freq):
		cutoff = freq
		_dirty = true


func set_q(q_val: float) -> void:
	if not is_equal_approx(q, q_val):
		q = q_val
		_dirty = true


func _update_coefficients() -> void:
	_dirty = false
	var f := clampf(cutoff, 10.0, sample_rate * 0.49)
	var w0 := TAU * f / sample_rate
	var cos_w0 := cos(w0)
	var sin_w0 := sin(w0)
	var alpha := sin_w0 / (2.0 * maxf(q, 0.001))

	var b0: float
	var b1: float
	var b2: float
	var a0: float
	var a1: float
	var a2: float

	match mode:
		Mode.LOWPASS:
			b0 = (1.0 - cos_w0) / 2.0
			b1 = 1.0 - cos_w0
			b2 = (1.0 - cos_w0) / 2.0
			a0 = 1.0 + alpha
			a1 = -2.0 * cos_w0
			a2 = 1.0 - alpha
		Mode.HIGHPASS:
			b0 = (1.0 + cos_w0) / 2.0
			b1 = -(1.0 + cos_w0)
			b2 = (1.0 + cos_w0) / 2.0
			a0 = 1.0 + alpha
			a1 = -2.0 * cos_w0
			a2 = 1.0 - alpha
		Mode.BANDPASS:
			b0 = alpha
			b1 = 0.0
			b2 = -alpha
			a0 = 1.0 + alpha
			a1 = -2.0 * cos_w0
			a2 = 1.0 - alpha

	var inv_a0 := 1.0 / a0
	_b0 = b0 * inv_a0
	_b1 = b1 * inv_a0
	_b2 = b2 * inv_a0
	_a1 = a1 * inv_a0
	_a2 = a2 * inv_a0


func process_sample(x: float) -> float:
	if _dirty:
		_update_coefficients()

	# Direct Form II Transposed
	var y := _b0 * x + _z1
	_z1 = _b1 * x - _a1 * y + _z2
	_z2 = _b2 * x - _a2 * y
	return y


func reset() -> void:
	_z1 = 0.0
	_z2 = 0.0
