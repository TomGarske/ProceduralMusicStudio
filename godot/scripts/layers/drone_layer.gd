class_name DroneLayer
## Arco support drone — additive sine synthesis for root + fifth, filtered.
## Three voice groups: warm root, rich root (detuned), pure fifth.

var sample_rate: float
var vibrato_osc: Oscillator
var hpf: BiquadFilter
var lpf_filter: BiquadFilter
var artic_env: Envelope  # articulation envelope for per-trigger swell
var support_mix: float = 0.55

# Config
var lpf_hz: float = 240.0
var hpf_hz: float = 65.0
var vibrato_hz: float = 2.1
var vibrato_depth: float = 0.0

# Root voice 1 (triangle character): odd harmonics
const PARTIALS_ROOT1 := [
	[1.0, 1.00], [3.0, 0.11], [5.0, 0.04],
]
# Root voice 2 (detuned -5 cents): fundamental + octave only
const PARTIALS_ROOT2 := [
	[1.0, 0.80], [2.0, 0.20],
]
# Fifth voice (pure sine, detuned +4 cents)
# Just fundamental — the fifth should be clean

var _root1_phases: PackedFloat32Array
var _root2_phases: PackedFloat32Array
var _fifth_phase: float = 0.0

var _root_freq: float = 73.42
var _fifth_freq: float = 110.0
var _root2_detune: float = 1.0  # pow(2, -5/1200)
var _fifth_detune: float = 1.0  # pow(2, +4/1200)


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	vibrato_osc = Oscillator.new(Oscillator.Waveform.SINE, 2.1, sr)
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 65.0, 0.7, sr)
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 240.0, 0.8, sr)
	artic_env = Envelope.new(sr)

	_root1_phases = PackedFloat32Array()
	_root1_phases.resize(PARTIALS_ROOT1.size())
	_root2_phases = PackedFloat32Array()
	_root2_phases.resize(PARTIALS_ROOT2.size())

	_root2_detune = pow(2.0, -5.0 / 1200.0)
	_fifth_detune = pow(2.0, 4.0 / 1200.0)


func apply_config(config: Dictionary) -> void:
	lpf_hz = config.get("lpfHz", 240.0)
	hpf_hz = config.get("hpfHz", 40.0)
	vibrato_hz = config.get("vibratoHz", 2.1)
	vibrato_depth = config.get("vibratoDepth", 0.7)
	support_mix = config.get("supportMix", 0.55)
	lpf_filter.set_cutoff(lpf_hz)
	hpf.set_cutoff(hpf_hz)
	vibrato_osc.frequency = vibrato_hz


func set_voicing(main_freq: float, support_freq: float) -> void:
	_root_freq = main_freq
	_fifth_freq = support_freq


func trigger_artic(gain_level: float) -> void:
	artic_env.set_target(gain_level, 0.15)


func release_artic() -> void:
	artic_env.set_target(0.0, 0.18)


func next_sample() -> float:
	var vib := vibrato_osc.next_sample() * vibrato_depth

	# Root voice 1 (triangle character) with vibrato
	var s := 0.0
	var root1_base := _root_freq + vib
	for p in range(PARTIALS_ROOT1.size()):
		var p_freq := root1_base * float(PARTIALS_ROOT1[p][0])
		if p_freq > sample_rate * 0.45:
			continue
		_root1_phases[p] += p_freq / sample_rate
		_root1_phases[p] -= floorf(_root1_phases[p])
		s += sin(_root1_phases[p] * TAU) * float(PARTIALS_ROOT1[p][1])

	# Root voice 2 (sawtooth character, detuned) with vibrato
	var root2_base := (_root_freq + vib) * _root2_detune
	for p in range(PARTIALS_ROOT2.size()):
		var p_freq := root2_base * float(PARTIALS_ROOT2[p][0])
		if p_freq > sample_rate * 0.45:
			continue
		_root2_phases[p] += p_freq / sample_rate
		_root2_phases[p] -= floorf(_root2_phases[p])
		s += sin(_root2_phases[p] * TAU) * float(PARTIALS_ROOT2[p][1])

	# Fifth voice (pure sine, detuned +4 cents)
	var fifth_freq := _fifth_freq * _fifth_detune
	_fifth_phase += fifth_freq / sample_rate
	_fifth_phase -= floorf(_fifth_phase)
	s += sin(_fifth_phase * TAU) * support_mix

	s = hpf.process_sample(s)
	s = lpf_filter.process_sample(s)
	s *= artic_env.next_sample()
	return s
