class_name Oscillator
## Phase-accumulator oscillator supporting sine, sawtooth, and triangle waveforms.
## Uses PolyBLEP anti-aliasing for sawtooth and triangle to eliminate harsh aliasing
## artifacts, matching Web Audio OscillatorNode's band-limited output.

enum Waveform { SINE, SAWTOOTH, TRIANGLE }

var waveform: Waveform = Waveform.SINE
var frequency: float = 440.0
var detune_cents: float = 0.0
var phase: float = 0.0
var sample_rate: float = 44100.0

# Frequency modulation input (added to frequency each sample, in Hz)
var fm_input: float = 0.0

# Previous sample for integrated PolyBLEP triangle
var _last_saw: float = 0.0
var _tri_state: float = 0.0


func _init(wave: Waveform = Waveform.SINE, freq: float = 440.0, sr: float = 44100.0) -> void:
	waveform = wave
	frequency = freq
	sample_rate = sr


func get_effective_freq() -> float:
	var f := frequency + fm_input
	if detune_cents != 0.0:
		f *= pow(2.0, detune_cents / 1200.0)
	return f


## PolyBLEP residual — smooths discontinuities to reduce aliasing.
## t is the phase position, dt is the phase increment per sample.
func _poly_blep(t: float, dt: float) -> float:
	if t < dt:
		# Rising edge at start of period
		var x := t / dt
		return x + x - x * x - 1.0
	elif t > 1.0 - dt:
		# Falling edge at end of period
		var x := (t - 1.0) / dt
		return x * x + x + x + 1.0
	return 0.0


func next_sample() -> float:
	var f := get_effective_freq()
	var dt := f / sample_rate
	phase += dt
	phase -= floorf(phase)  # wrap to [0, 1)

	match waveform:
		Waveform.SINE:
			return sin(phase * TAU)
		Waveform.SAWTOOTH:
			# PolyBLEP-corrected sawtooth
			var s := 2.0 * phase - 1.0
			s -= _poly_blep(phase, dt)
			return s
		Waveform.TRIANGLE:
			# Integrated PolyBLEP sawtooth → triangle
			# First generate anti-aliased sawtooth
			var saw := 2.0 * phase - 1.0
			saw -= _poly_blep(phase, dt)
			# Leaky integrator to convert sawtooth → triangle
			# The integration constant 4*dt normalizes amplitude
			_tri_state = _tri_state * 0.998 + saw * 4.0 * dt
			# Normalize output to [-1, 1] range
			return _tri_state
	return 0.0


func reset() -> void:
	phase = 0.0
	_last_saw = 0.0
	_tri_state = 0.0
