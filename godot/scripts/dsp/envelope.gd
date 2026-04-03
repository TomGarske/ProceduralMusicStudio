class_name Envelope
## Exponential envelope generator with target-based ramping.
## Replaces Web Audio's setTargetAtTime / linearRampToValueAtTime pattern.

var value: float = 0.0
var _target: float = 0.0
var _rate: float = 0.0  # per-sample coefficient (0 = instant, approaching 1 = slow)
var _linear_start: float = 0.0
var _linear_end: float = 0.0
var _linear_samples_total: float = 0.0
var _linear_samples_done: float = 0.0
var _use_linear: bool = false
var sample_rate: float = 44100.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


## Exponential ramp toward target with time constant tau (seconds).
## Equivalent to Web Audio setTargetAtTime.
func set_target(target: float, tau: float = 0.01) -> void:
	_use_linear = false
	_target = target
	if tau <= 0.0:
		value = target
		_rate = 0.0
	else:
		# rate = exp(-1 / (tau * sample_rate))
		_rate = exp(-1.0 / (tau * sample_rate))


## Linear ramp to target over duration_sec seconds.
## Equivalent to Web Audio linearRampToValueAtTime.
func linear_ramp(target: float, duration_sec: float) -> void:
	if duration_sec <= 0.0:
		value = target
		_use_linear = false
		return
	_use_linear = true
	_linear_start = value
	_linear_end = target
	_linear_samples_total = duration_sec * sample_rate
	_linear_samples_done = 0.0


## Snap immediately to value.
func snap(val: float) -> void:
	value = val
	_target = val
	_use_linear = false


func next_sample() -> float:
	if _use_linear:
		_linear_samples_done += 1.0
		if _linear_samples_done >= _linear_samples_total:
			value = _linear_end
			_use_linear = false
		else:
			var t := _linear_samples_done / _linear_samples_total
			value = _linear_start + (_linear_end - _linear_start) * t
	else:
		if _rate > 0.0:
			value = _target + (value - _target) * _rate
		# else: already at target
	return value


func is_silent(threshold: float = 0.0001) -> bool:
	return absf(value) < threshold and absf(_target) < threshold and not _use_linear
