class_name ArpLayer
## Plucked concertina/cello arpeggio layer.
## Two detuned sawtooth oscillators with LPF, vibrato, and bow noise.

var osc1: Oscillator
var osc2: Oscillator
var vibrato_osc: Oscillator
var vibrato_env: Envelope  # gate for delayed vibrato onset
var lpf: BiquadFilter
var gain_env: Envelope
var bow_noise_env: Envelope
var sample_rate: float

# Config from preset
var attack_sec: float = 0.015
var decay_tau_mul: float = 0.85
var lfo_hz: float = 4.8
var vibrato_depth: float = 4.0
var bow_noise_mix: float = 0.10
var portamento_sec: float = 0.025

# State
var _target_freq: float = 110.0
var _current_freq: float = 110.0
var _portamento_rate: float = 0.999

# Noise state for bow noise (simple LFSR)
var _noise_state: int = 48271


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	osc1 = Oscillator.new(Oscillator.Waveform.SAWTOOTH, 110.0, sr)
	osc2 = Oscillator.new(Oscillator.Waveform.SAWTOOTH, 110.0, sr)
	osc2.detune_cents = 14.0
	vibrato_osc = Oscillator.new(Oscillator.Waveform.SINE, lfo_hz, sr)
	vibrato_env = Envelope.new(sr)
	lpf = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 420.0, 1.2, sr)
	gain_env = Envelope.new(sr)
	bow_noise_env = Envelope.new(sr)


func apply_config(config: Dictionary) -> void:
	attack_sec = config.get("attackSec", 0.015)
	decay_tau_mul = config.get("decayTauMul", 0.85)
	lfo_hz = config.get("lfoHz", 4.8)
	vibrato_depth = 4.0
	bow_noise_mix = config.get("bowNoiseMix", 0.10)
	portamento_sec = config.get("portamentoSec", 0.025)
	vibrato_osc.frequency = lfo_hz


func set_filter_cutoff(hz: float) -> void:
	lpf.set_cutoff(hz)


func trigger_note(freq: float, velocity: float, gain_level: float, s16_dur: float) -> void:
	if freq <= 0.0:
		return  # hold/rest

	_target_freq = freq
	_portamento_rate = exp(-1.0 / (portamento_sec * sample_rate))

	# Humanize
	var h_vel := velocity * (0.9 + randf() * 0.2)
	var h_attack := attack_sec * (0.7 + randf() * 0.6)
	var h_decay_tau := s16_dur * decay_tau_mul * (0.85 + randf() * 0.3)

	# Envelope: quick ramp up, exponential decay
	gain_env.snap(0.0)
	gain_env.linear_ramp(gain_level * h_vel * 0.30, h_attack)
	# After attack completes, we'll switch to exponential decay in process
	# Store decay target for post-attack
	_pending_decay_target = gain_level * h_vel * 0.08
	_pending_decay_tau = h_decay_tau
	_attack_samples_remaining = int(h_attack * sample_rate)

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

	# Detune humanization
	osc2.detune_cents = 10.0 + randf() * 8.0
	osc1.detune_cents = (randf() - 0.5) * 5.0

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

	osc1.frequency = mod_freq
	osc2.frequency = mod_freq

	var s := osc1.next_sample() + osc2.next_sample()

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

	var env_val := gain_env.next_sample()
	var bow_val := bow_noise_env.next_sample() * _noise()

	s = (s * env_val + bow_val)
	return lpf.process_sample(s)
