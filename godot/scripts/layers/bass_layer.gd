class_name BassLayer
## Plucked bass with triangle + sine oscillators through LP/HP filter chain.

var sample_rate: float
var osc1: Oscillator  # triangle
var osc2: Oscillator  # sine, detuned
var lpf_filter: BiquadFilter
var hpf: BiquadFilter
var gain_env: Envelope

# Config
var lpf_hz: float = 300.0
var hpf_hz: float = 38.0
var detune_cents: float = -8.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	osc1 = Oscillator.new(Oscillator.Waveform.TRIANGLE, 73.42, sr)
	osc2 = Oscillator.new(Oscillator.Waveform.SINE, 73.42, sr)
	osc2.detune_cents = -8.0
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 300.0, 0.7, sr)
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 38.0, 0.7, sr)
	gain_env = Envelope.new(sr)


func apply_config(config: Dictionary) -> void:
	lpf_hz = config.get("lpfHz", 300.0)
	hpf_hz = config.get("hpfHz", 38.0)
	detune_cents = config.get("detuneCents", -8.0)
	osc2.detune_cents = detune_cents
	lpf_filter.set_cutoff(lpf_hz)
	hpf.set_cutoff(hpf_hz)


func trigger_note(freq: float, velocity: float) -> void:
	osc1.frequency = freq
	osc2.frequency = freq
	# Pluck envelope: fast attack, medium decay
	gain_env.snap(0.0)
	gain_env.linear_ramp(velocity * 0.7, 0.008)
	_attack_samples = int(0.008 * sample_rate)
	_decay_target = velocity * 0.05
	_decay_tau = 0.4

var _attack_samples: int = 0
var _decay_target: float = 0.0
var _decay_tau: float = 0.4


func next_sample() -> float:
	if _attack_samples > 0:
		_attack_samples -= 1
		if _attack_samples == 0:
			gain_env.set_target(_decay_target, _decay_tau)

	var s := osc1.next_sample() + osc2.next_sample()
	var env_val := gain_env.next_sample()
	s *= env_val
	s = lpf_filter.process_sample(s)
	s = hpf.process_sample(s)
	return s
