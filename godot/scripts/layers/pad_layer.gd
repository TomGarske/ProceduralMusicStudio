class_name PadLayer
## Sustained cello pad — three detuned oscillators with vibrato and filtering.
## Follows chord harmony via set_voicing().

var sample_rate: float

# Three voices (triangle, sawtooth, triangle) like the original
var _voices: Array = []  # Array of dicts: {osc, vib_osc, gain_mul, vib_mul}
var hpf: BiquadFilter
var lpf_filter: BiquadFilter
var gain_env: Envelope

# Config
var vibrato_hz: float = 4.0
var vibrato_depth: float = 1.5
var voice_gain: float = 0.12
var lpf_hz: float = 480.0
var hpf_hz: float = 90.0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 90.0, 0.7, sr)
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 480.0, 0.8, sr)
	gain_env = Envelope.new(sr)

	var voice_defs := [
		{"wave": Oscillator.Waveform.TRIANGLE, "detune": -4.0, "gain_mul": 1.15, "vib_mul": 0.7},
		{"wave": Oscillator.Waveform.SAWTOOTH, "detune": 3.0, "gain_mul": 0.85, "vib_mul": 0.45},
		{"wave": Oscillator.Waveform.TRIANGLE, "detune": 0.0, "gain_mul": 0.95, "vib_mul": 0.58},
	]
	for vd: Variant in voice_defs:
		var vdef: Dictionary = vd as Dictionary
		var osc := Oscillator.new(int(vdef["wave"]), 146.83, sr)
		osc.detune_cents = float(vdef["detune"])
		var vib_hz_val: float = vibrato_hz * (0.9 + randf() * 0.2)
		var vib := Oscillator.new(Oscillator.Waveform.SINE, vib_hz_val, sr)
		_voices.append({
			"osc": osc,
			"vib": vib,
			"gain_mul": float(vdef["gain_mul"]),
			"vib_mul": float(vdef["vib_mul"]),
			"target_freq": 146.83,
			"current_freq": 146.83,
			"port_rate": exp(-1.0 / (0.08 * sr)),
		})


func apply_config(config: Dictionary) -> void:
	vibrato_hz = config.get("vibratoHz", 4.0)
	vibrato_depth = config.get("vibratoDepth", 1.5)
	voice_gain = config.get("voiceGain", 0.12)
	lpf_hz = config.get("lpfHz", 480.0)
	hpf_hz = config.get("hpfHz", 90.0)
	lpf_filter.set_cutoff(lpf_hz)
	hpf.set_cutoff(hpf_hz)
	for v: Variant in _voices:
		var vd: Dictionary = v as Dictionary
		(vd["vib"] as Oscillator).frequency = vibrato_hz * (0.9 + randf() * 0.2)


func set_voicing(freqs: Array) -> void:
	for i in range(mini(_voices.size(), freqs.size())):
		(_voices[i] as Dictionary)["target_freq"] = float(freqs[i])


func next_sample() -> float:
	var out := 0.0
	for v: Variant in _voices:
		var vd: Dictionary = v as Dictionary
		# Portamento
		var cur: float = float(vd["current_freq"])
		var tgt: float = float(vd["target_freq"])
		var rate: float = float(vd["port_rate"])
		cur = tgt + (cur - tgt) * rate
		vd["current_freq"] = cur

		# Vibrato
		var vib_val: float = (vd["vib"] as Oscillator).next_sample() * vibrato_depth * float(vd["vib_mul"])
		(vd["osc"] as Oscillator).frequency = cur + vib_val

		out += (vd["osc"] as Oscillator).next_sample() * voice_gain * float(vd["gain_mul"])

	out = hpf.process_sample(out)
	out = lpf_filter.process_sample(out)
	return out
