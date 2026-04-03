class_name DroneLayer
## Arco support drone — triangle + sawtooth + sine (fifth), filtered.

var sample_rate: float
var osc1: Oscillator  # triangle, root
var osc2: Oscillator  # sawtooth, root, detuned
var osc3: Oscillator  # sine, fifth
var vibrato_osc: Oscillator
var hpf: BiquadFilter
var lpf_filter: BiquadFilter
var artic_env: Envelope  # articulation envelope for per-trigger swell
var support_mix: float = 0.55

# Config
var lpf_hz: float = 220.0
var hpf_hz: float = 40.0
var vibrato_hz: float = 2.1
var vibrato_depth: float = 0.7


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	osc1 = Oscillator.new(Oscillator.Waveform.TRIANGLE, 73.42, sr)
	osc2 = Oscillator.new(Oscillator.Waveform.SAWTOOTH, 73.42, sr)
	osc2.detune_cents = -5.0
	osc3 = Oscillator.new(Oscillator.Waveform.SINE, 110.0, sr)
	osc3.detune_cents = 4.0
	vibrato_osc = Oscillator.new(Oscillator.Waveform.SINE, 2.1, sr)
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 40.0, 0.7, sr)
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 220.0, 0.8, sr)
	artic_env = Envelope.new(sr)


func apply_config(config: Dictionary) -> void:
	lpf_hz = config.get("lpfHz", 220.0)
	hpf_hz = config.get("hpfHz", 40.0)
	vibrato_hz = config.get("vibratoHz", 2.1)
	vibrato_depth = config.get("vibratoDepth", 0.7)
	support_mix = config.get("supportMix", 0.55)
	lpf_filter.set_cutoff(lpf_hz)
	hpf.set_cutoff(hpf_hz)
	vibrato_osc.frequency = vibrato_hz


func set_voicing(main_freq: float, support_freq: float) -> void:
	osc1.frequency = main_freq
	osc2.frequency = main_freq
	osc3.frequency = support_freq


func trigger_artic(gain_level: float) -> void:
	artic_env.set_target(gain_level, 0.15)


func release_artic() -> void:
	artic_env.set_target(0.0, 0.18)


func next_sample() -> float:
	var vib := vibrato_osc.next_sample() * vibrato_depth
	osc1.fm_input = vib
	osc2.fm_input = vib

	var s := osc1.next_sample() + osc2.next_sample() + osc3.next_sample() * support_mix
	s = hpf.process_sample(s)
	s = lpf_filter.process_sample(s)
	s *= artic_env.next_sample()
	return s
