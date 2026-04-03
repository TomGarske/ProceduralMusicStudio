class_name Oscillator
## Phase-accumulator oscillator supporting sine, sawtooth, and triangle waveforms.
## Replaces Web Audio OscillatorNode.

enum Waveform { SINE, SAWTOOTH, TRIANGLE }

var waveform: Waveform = Waveform.SINE
var frequency: float = 440.0
var detune_cents: float = 0.0
var phase: float = 0.0
var sample_rate: float = 44100.0

# Frequency modulation input (added to frequency each sample, in Hz)
var fm_input: float = 0.0


func _init(wave: Waveform = Waveform.SINE, freq: float = 440.0, sr: float = 44100.0) -> void:
	waveform = wave
	frequency = freq
	sample_rate = sr


func get_effective_freq() -> float:
	var f := frequency + fm_input
	if detune_cents != 0.0:
		f *= pow(2.0, detune_cents / 1200.0)
	return f


func next_sample() -> float:
	var f := get_effective_freq()
	var inc := f / sample_rate
	phase += inc
	phase -= floorf(phase)  # wrap to [0, 1)

	match waveform:
		Waveform.SINE:
			return sin(phase * TAU)
		Waveform.SAWTOOTH:
			# Naive sawtooth: 1 at phase=0, -1 at phase=1
			return 2.0 * phase - 1.0
		Waveform.TRIANGLE:
			# Triangle: rises 0->1 in first half, falls 1->0 in second half
			if phase < 0.5:
				return 4.0 * phase - 1.0
			else:
				return 3.0 - 4.0 * phase
	return 0.0


func reset() -> void:
	phase = 0.0
