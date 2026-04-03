class_name BassLayer
## Plucked bass using additive sine synthesis through LP/HP filter chain.
## Models a warm plucked string with natural harmonic content.

var sample_rate: float
var lpf_filter: BiquadFilter
var hpf: BiquadFilter
var gain_env: Envelope

# Config
var lpf_hz: float = 300.0
var hpf_hz: float = 60.0
var detune_cents: float = -8.0

# Two oscillator groups: main (triangle-like) + detuned (sine)
# Main: odd harmonics for warmth (approximates triangle character)
const PARTIALS_MAIN := [
	[1.0, 1.00], [3.0, 0.11], [5.0, 0.04],
]
# Detuned: pure fundamental + octave for thickness
const PARTIALS_DET := [
	[1.0, 0.80], [2.0, 0.15],
]

var _main_phases: PackedFloat32Array
var _det_phases: PackedFloat32Array
var _freq: float = 73.42
var _detune_factor: float = 1.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 300.0, 0.7, sr)
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 60.0, 0.7, sr)
	gain_env = Envelope.new(sr)
	_main_phases = PackedFloat32Array()
	_main_phases.resize(PARTIALS_MAIN.size())
	_det_phases = PackedFloat32Array()
	_det_phases.resize(PARTIALS_DET.size())
	_detune_factor = pow(2.0, detune_cents / 1200.0)


func apply_config(config: Dictionary) -> void:
	lpf_hz = config.get("lpfHz", 300.0)
	hpf_hz = config.get("hpfHz", 38.0)
	detune_cents = config.get("detuneCents", -8.0)
	_detune_factor = pow(2.0, detune_cents / 1200.0)
	lpf_filter.set_cutoff(lpf_hz)
	hpf.set_cutoff(hpf_hz)


func trigger_note(freq: float, velocity: float) -> void:
	_freq = freq
	# Pluck envelope: fast attack, medium decay
	gain_env.snap(0.0)
	gain_env.linear_ramp(velocity * 0.45, 0.010)
	_attack_samples = int(0.010 * sample_rate)
	_decay_target = velocity * 0.03
	_decay_tau = 0.35

var _attack_samples: int = 0
var _decay_target: float = 0.0
var _decay_tau: float = 0.4


func next_sample() -> float:
	if _attack_samples > 0:
		_attack_samples -= 1
		if _attack_samples == 0:
			gain_env.set_target(_decay_target, _decay_tau)

	# Main oscillator group (triangle character)
	var s := 0.0
	for p in range(PARTIALS_MAIN.size()):
		var p_freq := _freq * float(PARTIALS_MAIN[p][0])
		if p_freq > sample_rate * 0.45:
			continue
		_main_phases[p] += p_freq / sample_rate
		_main_phases[p] -= floorf(_main_phases[p])
		s += sin(_main_phases[p] * TAU) * float(PARTIALS_MAIN[p][1])

	# Detuned oscillator group (sine character)
	var det_freq := _freq * _detune_factor
	for p in range(PARTIALS_DET.size()):
		var p_freq := det_freq * float(PARTIALS_DET[p][0])
		if p_freq > sample_rate * 0.45:
			continue
		_det_phases[p] += p_freq / sample_rate
		_det_phases[p] -= floorf(_det_phases[p])
		s += sin(_det_phases[p] * TAU) * float(PARTIALS_DET[p][1])

	var env_val := gain_env.next_sample()
	s *= env_val
	s = lpf_filter.process_sample(s)
	s = hpf.process_sample(s)
	return s
