class_name PadLayer
## Sustained cello pad — three voices using additive sine synthesis
## with vibrato and filtering for a warm, natural sustained tone.

var sample_rate: float

# Three voices with different harmonic profiles for richness
var _voices: Array = []
var hpf: BiquadFilter
var lpf_filter: BiquadFilter
var gain_env: Envelope

# Config
var vibrato_hz: float = 3.6
var vibrato_depth: float = 0.5
var voice_gain: float = 0.12
var lpf_hz: float = 720.0
var hpf_hz: float = 90.0

# Partial definitions per voice type
# Voice 1 (warm, triangle-like): odd harmonics, fast rolloff
const PARTIALS_WARM := [
	[1.0, 1.00], [3.0, 0.11], [5.0, 0.04], [7.0, 0.015],
]
# Voice 2 (rich, sawtooth-like): all harmonics, moderate rolloff
const PARTIALS_RICH := [
	[1.0, 1.00], [2.0, 0.40], [3.0, 0.22], [4.0, 0.12], [5.0, 0.06],
]
# Voice 3 (soft, triangle-like): odd harmonics, fast rolloff
const PARTIALS_SOFT := [
	[1.0, 1.00], [3.0, 0.09], [5.0, 0.03],
]


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr
	hpf = BiquadFilter.new(BiquadFilter.Mode.HIGHPASS, 90.0, 0.7, sr)
	lpf_filter = BiquadFilter.new(BiquadFilter.Mode.LOWPASS, 720.0, 0.8, sr)
	gain_env = Envelope.new(sr)

	var voice_defs := [
		{"partials": PARTIALS_WARM, "detune": -4.0, "gain_mul": 1.15, "vib_mul": 0.7},
		{"partials": PARTIALS_RICH, "detune": 3.0, "gain_mul": 0.85, "vib_mul": 0.45},
		{"partials": PARTIALS_SOFT, "detune": 0.0, "gain_mul": 0.95, "vib_mul": 0.58},
	]
	for idx in range(voice_defs.size()):
		var vdef: Dictionary = voice_defs[idx] as Dictionary
		var partials: Array = vdef["partials"]
		var phases := PackedFloat32Array()
		phases.resize(partials.size())
		for p in range(partials.size()):
			phases[p] = 0.0
		var vib_hz_val: float = vibrato_hz * (0.9 + randf() * 0.2)
		var vib := Oscillator.new(Oscillator.Waveform.SINE, vib_hz_val, sr)
		var port_tau := 0.08 + float(idx) * 0.015
		_voices.append({
			"partials": partials,
			"phases": phases,
			"detune_factor": pow(2.0, float(vdef["detune"]) / 1200.0),
			"vib": vib,
			"gain_mul": float(vdef["gain_mul"]),
			"vib_mul": float(vdef["vib_mul"]),
			"target_freq": 146.83,
			"current_freq": 146.83,
			"port_rate": exp(-1.0 / (port_tau * sr)),
		})


func apply_config(config: Dictionary) -> void:
	vibrato_hz = config.get("vibratoHz", 3.6)
	vibrato_depth = config.get("vibratoDepth", 1.5)
	voice_gain = config.get("voiceGain", 0.12)
	lpf_hz = config.get("lpfHz", 720.0)
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
		var base_freq := (cur + vib_val) * float(vd["detune_factor"])

		# Additive synthesis
		var voice_out := 0.0
		var partials: Array = vd["partials"]
		var phases: PackedFloat32Array = vd["phases"]
		for p in range(partials.size()):
			var partial: Array = partials[p]
			var p_freq := base_freq * float(partial[0])
			if p_freq > sample_rate * 0.45:
				continue
			phases[p] += p_freq / sample_rate
			phases[p] -= floorf(phases[p])
			voice_out += sin(phases[p] * TAU) * float(partial[1])
		vd["phases"] = phases

		out += voice_out * voice_gain * float(vd["gain_mul"])

	out = hpf.process_sample(out)
	out = lpf_filter.process_sample(out)
	return out
