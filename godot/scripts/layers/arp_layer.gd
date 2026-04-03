class_name ArpLayer
## Plucked concertina/cello arpeggio layer.
## Uses additive sine synthesis with per-harmonic decay and inharmonicity
## for a natural, acoustic timbre. No sawtooth aliasing possible.

var vibrato_osc: Oscillator
var vibrato_env: Envelope  # gate for delayed vibrato onset
var body_lpf: BiquadFilter  # body resonance filter
var gain_env: Envelope
var bow_noise_env: Envelope
var bow_noise_bp: BiquadFilter  # bandpass filter for bow noise
var sample_rate: float

# Config from preset
var attack_sec: float = 0.015
var decay_tau_mul: float = 0.85
var lfo_hz: float = 4.8
var vibrato_depth: float = 4.0
var bow_noise_mix: float = 0.10
var portamento_sec: float = 0.025

# Additive partials definition
# Each: [harmonic_ratio, amplitude, decay_multiplier, inharmonicity_cents]
# Models a bowed/plucked string with natural harmonic rolloff
const PARTIALS := [
	[1.0,   1.00, 1.0,   0.0],   # fundamental
	[2.0,   0.45, 1.3,   1.2],   # 2nd harmonic
	[3.0,   0.28, 1.7,   -0.8],  # 3rd
	[4.0,   0.15, 2.2,   1.5],   # 4th
	[5.0,   0.08, 2.8,   -1.0],  # 5th
	[6.0,   0.04, 3.5,   0.7],   # 6th (subtle shimmer)
]

# Per-partial phase accumulators
var _phases: PackedFloat32Array
# Per-partial random detune offsets (set per note for variation)
var _partial_detune: PackedFloat32Array

# State
var _target_freq: float = 110.0
var _current_freq: float = 110.0
var _portamento_rate: float = 0.999
var _filter_cutoff_hz: float = 1500.0

# Noise state for bow noise (simple LFSR)
var _noise_state: int = 48271

# Dynamic filter envelope state
var _filter_env: float = 0.0
var _filter_env_target: float = 0.0
var _filter_env_rate: float = 0.999


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	vibrato_osc = Oscillator.new(Oscillator.Waveform.SINE, lfo_hz, sr)
	vibrato_env = Envelope.new(sr)
	body_lpf = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 1500.0, 0.6, sr)
	gain_env = Envelope.new(sr)
	bow_noise_env = Envelope.new(sr)
	bow_noise_bp = BiquadFilter.new(BiquadFilter.Mode.BANDPASS, 2500.0, 1.5, sr)

	_phases = PackedFloat32Array()
	_phases.resize(PARTIALS.size())
	_partial_detune = PackedFloat32Array()
	_partial_detune.resize(PARTIALS.size())
	for i in range(PARTIALS.size()):
		_phases[i] = 0.0
		_partial_detune[i] = (randf() - 0.5) * 3.0  # +-1.5 cents


func apply_config(config: Dictionary) -> void:
	attack_sec = config.get("attackSec", 0.015)
	decay_tau_mul = config.get("decayTauMul", 0.85)
	lfo_hz = config.get("lfoHz", 4.8)
	vibrato_depth = 4.0
	bow_noise_mix = config.get("bowNoiseMix", 0.10)
	portamento_sec = config.get("portamentoSec", 0.025)
	vibrato_osc.frequency = lfo_hz


func set_filter_cutoff(hz: float) -> void:
	_filter_cutoff_hz = hz


func trigger_note(freq: float, velocity: float, gain_level: float, s16_dur: float) -> void:
	if freq <= 0.0:
		return  # hold/rest

	_target_freq = freq
	_portamento_rate = exp(-1.0 / (portamento_sec * sample_rate))

	# Humanize
	var h_vel := velocity * (0.9 + randf() * 0.2)
	var h_attack := attack_sec * (0.7 + randf() * 0.6)
	var h_decay_tau := s16_dur * decay_tau_mul * (0.85 + randf() * 0.3)

	# Per-note partial detune variation (each note sounds slightly different)
	for i in range(PARTIALS.size()):
		_partial_detune[i] = (randf() - 0.5) * 3.0 + float(PARTIALS[i][3])

	# Envelope: quick ramp up, exponential decay
	gain_env.snap(0.0)
	gain_env.linear_ramp(gain_level * h_vel * 0.30, h_attack)
	_pending_decay_target = gain_level * h_vel * 0.08
	_pending_decay_tau = h_decay_tau
	_attack_samples_remaining = int(h_attack * sample_rate)

	# Dynamic filter: open bright on attack, settle to resting cutoff
	# This simulates the natural brightness of a bow/pluck attack
	_filter_env = _filter_cutoff_hz * 1.8  # overshoot on attack
	_filter_env_target = _filter_cutoff_hz
	_filter_env_rate = exp(-1.0 / (h_decay_tau * 0.4 * sample_rate))

	# Bow noise burst
	bow_noise_env.snap(0.0)
	bow_noise_env.linear_ramp(gain_level * h_vel * bow_noise_mix, 0.002)
	_bow_decay_samples = int(0.002 * sample_rate)
	_bow_decay_tau = s16_dur * 0.3

	# Vibrato: delayed onset
	vibrato_env.snap(0.0)
	var vib_delay := 0.08 + randf() * 0.07
	var vib_depth_scale := 0.6 + h_vel * 0.4
	vibrato_env.linear_ramp(vib_depth_scale, vib_delay)

var _pending_decay_target: float = 0.0
var _pending_decay_tau: float = 0.1
var _attack_samples_remaining: int = 0
var _bow_decay_samples: int = 0
var _bow_decay_tau: float = 0.1


func _noise() -> float:
	_noise_state = (_noise_state * 16807) % 2147483647
	return float(_noise_state) / 1073741823.5 - 1.0


func next_sample() -> float:
	# Portamento: glide current freq toward target
	_current_freq = _target_freq + (_current_freq - _target_freq) * _portamento_rate

	# Vibrato modulation
	var vib_sample := vibrato_osc.next_sample()
	var vib_amount := vibrato_env.next_sample() * vibrato_depth
	var mod_freq := _current_freq + vib_sample * vib_amount

	# Additive synthesis: sum sine partials with individual characteristics
	var s := 0.0
	for i in range(PARTIALS.size()):
		var partial: Array = PARTIALS[i]
		var h_ratio: float = float(partial[0])
		var h_amp: float = float(partial[1])

		# Per-partial frequency with inharmonicity
		var detune_factor := pow(2.0, _partial_detune[i] / 1200.0)
		var partial_freq := mod_freq * h_ratio * detune_factor

		# Skip partials above Nyquist
		if partial_freq > sample_rate * 0.45:
			continue

		# Phase accumulator
		_phases[i] += partial_freq / sample_rate
		_phases[i] -= floorf(_phases[i])

		s += sin(_phases[i] * TAU) * h_amp

	# Normalize amplitude (sum of partial amps ≈ 2.0, scale to ~1.0)
	s *= 0.5

	# Attack -> decay transition
	if _attack_samples_remaining > 0:
		_attack_samples_remaining -= 1
		if _attack_samples_remaining == 0:
			gain_env.set_target(_pending_decay_target, _pending_decay_tau)

	# Bow noise transition
	if _bow_decay_samples > 0:
		_bow_decay_samples -= 1
		if _bow_decay_samples == 0:
			bow_noise_env.set_target(0.0, _bow_decay_tau)

	# Dynamic filter: sweep from bright attack to resting cutoff
	_filter_env = _filter_env_target + (_filter_env - _filter_env_target) * _filter_env_rate
	body_lpf.set_cutoff(_filter_env)

	var env_val := gain_env.next_sample()
	var bow_val := bow_noise_env.next_sample() * bow_noise_bp.process_sample(_noise())

	s = (s * env_val + bow_val)
	return body_lpf.process_sample(s)
