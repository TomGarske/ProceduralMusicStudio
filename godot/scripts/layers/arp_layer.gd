class_name ArpLayer
## Plucked concertina/cello arpeggio layer.
## Additive sine synthesis with per-harmonic rolloff. Clean, simple.

var vibrato_osc: Oscillator
var vibrato_env: Envelope
var body_lpf: BiquadFilter
var gain_env: Envelope
var sample_rate: float

# Config from preset
var attack_sec: float = 0.015
var decay_tau_mul: float = 0.85
var lfo_hz: float = 4.8
var vibrato_depth: float = 0.0
var portamento_sec: float = 0.025

# Additive partials: [harmonic_ratio, amplitude]
const PARTIALS := [
	[1.0, 1.00],
	[2.0, 0.45],
	[3.0, 0.28],
	[4.0, 0.15],
	[5.0, 0.08],
	[6.0, 0.04],
]

var _phases: PackedFloat32Array

# State
var _target_freq: float = 110.0
var _current_freq: float = 110.0
var _portamento_rate: float = 0.999

var _pending_decay_target: float = 0.0
var _pending_decay_tau: float = 0.1
var _attack_samples_remaining: int = 0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	vibrato_osc = Oscillator.new(Oscillator.Waveform.SINE, lfo_hz, sr)
	vibrato_env = Envelope.new(sr)
	body_lpf = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 1500.0, 0.5, sr)
	gain_env = Envelope.new(sr)
	_phases = PackedFloat32Array()
	_phases.resize(PARTIALS.size())


func apply_config(config: Dictionary) -> void:
	attack_sec = config.get("attackSec", 0.015)
	decay_tau_mul = config.get("decayTauMul", 0.85)
	lfo_hz = config.get("lfoHz", 4.8)
	vibrato_depth = 0.0
	portamento_sec = config.get("portamentoSec", 0.025)
	vibrato_osc.frequency = lfo_hz


func set_filter_cutoff(hz: float) -> void:
	body_lpf.set_cutoff(hz)


func trigger_note(freq: float, velocity: float, gain_level: float, s16_dur: float) -> void:
	if freq <= 0.0:
		return

	_target_freq = freq
	_portamento_rate = exp(-1.0 / (portamento_sec * sample_rate))

	var h_vel := velocity * (0.9 + randf() * 0.2)
	var h_attack := attack_sec * (0.7 + randf() * 0.6)
	var h_decay_tau := s16_dur * decay_tau_mul * (0.85 + randf() * 0.3)

	gain_env.snap(0.0)
	gain_env.linear_ramp(gain_level * h_vel * 0.80, h_attack)
	_pending_decay_target = gain_level * h_vel * 0.20
	_pending_decay_tau = h_decay_tau
	_attack_samples_remaining = int(h_attack * sample_rate)

	# Subtle vibrato: delayed onset
	vibrato_env.snap(0.0)
	vibrato_env.linear_ramp(0.6 + h_vel * 0.4, 0.08 + randf() * 0.07)


func next_sample() -> float:
	_current_freq = _target_freq + (_current_freq - _target_freq) * _portamento_rate

	var vib_sample := vibrato_osc.next_sample()
	var vib_amount := vibrato_env.next_sample() * vibrato_depth
	var mod_freq := _current_freq + vib_sample * vib_amount

	var s := 0.0
	for i in range(PARTIALS.size()):
		var h_ratio: float = float(PARTIALS[i][0])
		var h_amp: float = float(PARTIALS[i][1])
		var partial_freq := mod_freq * h_ratio
		if partial_freq > sample_rate * 0.45:
			continue
		_phases[i] += partial_freq / sample_rate
		_phases[i] -= floorf(_phases[i])
		s += sin(_phases[i] * TAU) * h_amp

	s *= 0.5

	if _attack_samples_remaining > 0:
		_attack_samples_remaining -= 1
		if _attack_samples_remaining == 0:
			gain_env.set_target(_pending_decay_target, _pending_decay_tau)

	s *= gain_env.next_sample()
	return body_lpf.process_sample(s)
