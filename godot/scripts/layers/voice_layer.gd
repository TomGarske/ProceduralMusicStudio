class_name VoiceLayer
## Formant-based crew voice part (bass, baritone, or tenor).
## Each trigger spawns multiple voices using additive sine harmonics
## through 3-formant bandpass filters for natural vocal timbre.

var sample_rate: float

# Part config (set from CREW_PARTS data)
var part_id: String = "voiceBass"
var min_hz: float = 65.41
var max_hz: float = 130.81
var formant_shift: float = -120.0
var gain_mul: float = 1.08
var vibrato_mul: float = 0.75
var breath_mul: float = 0.78
var detune_mul: float = 0.72
var max_voices: int = 2

# Voice config from preset
var release_sec: float = 2.8
var vibrato_hz: float = 3.8
var base_formant_shift: float = 0.0
var voice_count: int = 2
var detune_spread: float = 15.0
var breath_level: float = 0.035

# Active voice instances
var _active: Array = []

# Noise state
var _noise_state: int = 12345

const MAX_ACTIVE := 8

# Number of harmonics for the vocal source (approximates sawtooth richness)
const NUM_HARMONICS := 10

# Syllable definitions (formant frequencies and Q values)
const SYLLABLES := [
	{"f1s": 720, "f2s": 1100, "f3s": 2400, "f1e": 600, "f2e": 1000, "f3e": 2300, "q1": 10, "q2": 8, "q3": 6, "burst": 0.035},
	{"f1s": 340, "f2s": 920, "f3s": 2200, "f1e": 300, "f2e": 870, "f3e": 2100, "q1": 12, "q2": 10, "q3": 7, "burst": 0.03},
	{"f1s": 530, "f2s": 1840, "f3s": 2500, "f1e": 500, "f2e": 1750, "f3e": 2400, "q1": 11, "q2": 9, "q3": 7, "burst": 0.04},
	{"f1s": 660, "f2s": 1720, "f3s": 2400, "f1e": 350, "f2e": 2100, "f3e": 2800, "q1": 10, "q2": 9, "q3": 7, "burst": 0.045},
	{"f1s": 780, "f2s": 1200, "f3s": 2500, "f1e": 480, "f2e": 1800, "f3e": 2800, "q1": 11, "q2": 10, "q3": 7, "burst": 0.05},
	{"f1s": 580, "f2s": 1850, "f3s": 2700, "f1e": 300, "f2e": 2350, "f3e": 3000, "q1": 12, "q2": 11, "q3": 8, "burst": 0.08},
	{"f1s": 260, "f2s": 1000, "f3s": 2200, "f1e": 260, "f2e": 1000, "f3e": 2200, "q1": 15, "q2": 11, "q3": 7, "burst": 0.01},
	{"f1s": 500, "f2s": 900, "f3s": 2200, "f1e": 480, "f2e": 870, "f3e": 2100, "q1": 12, "q2": 10, "q3": 8, "burst": 0.05},
	{"f1s": 260, "f2s": 1000, "f3s": 2200, "f1e": 260, "f2e": 1000, "f3e": 2200, "q1": 15, "q2": 11, "q3": 7, "burst": 0.01},
]

var _syllable_idx: int = 0


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_voice_config(config: Dictionary) -> void:
	release_sec = config.get("releaseSec", 2.8)
	vibrato_hz = config.get("vibratoHz", 3.8)
	base_formant_shift = config.get("formantHz", 720.0) - 720.0
	voice_count = config.get("voiceCount", 2)
	detune_spread = config.get("detuneSpread", 15.0)
	breath_level = config.get("breathLevel", 0.035)


func set_part(id: String, cfg: Dictionary) -> void:
	part_id = id
	min_hz = cfg.get("min_hz", 65.41)
	max_hz = cfg.get("max_hz", 130.81)
	formant_shift = cfg.get("formant_shift", 0.0)
	gain_mul = cfg.get("gain_mul", 1.0)
	vibrato_mul = cfg.get("vibrato_mul", 1.0)
	breath_mul = cfg.get("breath_mul", 1.0)
	detune_mul = cfg.get("detune_mul", 1.0)
	max_voices = cfg.get("max_voices", 2)


func _noise() -> float:
	_noise_state = (_noise_state * 16807) % 2147483647
	return float(_noise_state) / 1073741823.5 - 1.0


func trigger(freq: float, target_gain: float, note_index: int) -> void:
	if freq <= 0.0 or target_gain < 0.018:
		return

	while _active.size() >= MAX_ACTIVE:
		_active.pop_front()

	var syllable: Dictionary = SYLLABLES[_syllable_idx % SYLLABLES.size()]
	_syllable_idx += 1

	var part_voices := mini(voice_count, max_voices)
	var det_spread := detune_spread * detune_mul
	var total_shift := base_formant_shift + formant_shift

	for vi in range(part_voices):
		var det_cents := (float(vi) - float(part_voices - 1) * 0.5) * det_spread / maxf(1.0, float(part_voices - 1))
		det_cents += (randf() - 0.5) * 6.0
		var detune_factor := pow(2.0, det_cents / 1200.0)

		# Additive sine harmonics as vocal source (replaces sawtooth)
		var phases := PackedFloat32Array()
		phases.resize(NUM_HARMONICS)
		# Harmonic amplitudes: 1/n rolloff (sawtooth spectrum) but alias-free
		var harm_amps := PackedFloat32Array()
		harm_amps.resize(NUM_HARMONICS)
		for h in range(NUM_HARMONICS):
			phases[h] = 0.0
			harm_amps[h] = 1.0 / float(h + 1)

		var vib := Oscillator.new(Oscillator.Waveform.SINE, vibrato_hz * vibrato_mul + float(vi) * 0.22, sample_rate)

		# Three formant bandpass filters
		var f1 := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, maxf(180.0, syllable["f1s"] + total_shift), syllable["q1"], sample_rate)
		var f2 := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, maxf(500.0, syllable["f2s"] + total_shift), syllable["q2"], sample_rate)
		var f3 := BiquadFilter.new(BiquadFilter.Mode.BANDPASS, maxf(1400.0, syllable["f3s"] + total_shift), syllable["q3"], sample_rate)

		var f1_target := maxf(180.0, syllable["f1e"] + total_shift)
		var f2_target := maxf(500.0, syllable["f2e"] + total_shift)
		var f3_target := maxf(1400.0, syllable["f3e"] + total_shift)

		var peak_jitter := 0.88 + randf() * 0.24
		var peak := target_gain * gain_mul * (0.50 - float(vi) * 0.03 / maxf(1.0, float(part_voices))) * peak_jitter
		var attack_time := (0.12 + float(note_index) * 0.02) * (0.78 + randf() * 0.45)

		var env := Envelope.new(sample_rate)
		env.snap(0.0)
		env.linear_ramp(peak, attack_time)

		var delay_samples := int((float(note_index) * 0.022 * (0.8 + randf() * 0.35) + float(vi) * 0.02 / maxf(1.0, float(part_voices - 1)) + randf() * 0.02) * sample_rate)
		var total_dur_samples := int((release_sec + 0.5) * sample_rate)

		var voice := {
			"phases": phases,
			"harm_amps": harm_amps,
			"freq": freq,
			"detune_factor": detune_factor,
			"vib": vib,
			"vib_depth": (3.0 + float(note_index) * 0.7) * vibrato_mul * (0.85 + randf() * 0.3),
			"f1": f1, "f2": f2, "f3": f3,
			"f1_target": f1_target, "f2_target": f2_target, "f3_target": f3_target,
			"f1_rate": exp(-1.0 / (release_sec * 0.35 * sample_rate)),
			"env": env,
			"peak": peak,
			"attack_samples": int(attack_time * sample_rate),
			"sustain_start": int(0.42 * sample_rate),
			"decay_start": int(release_sec * 0.55 * sample_rate),
			"delay": delay_samples,
			"age": 0,
			"total_dur": total_dur_samples,
			"phase": 0,  # 0=attack, 1=sustain, 2=decay
		}
		_active.append(voice)

	# Breath noise voice
	var breath_dur := int(release_sec * 0.45 * sample_rate)
	var burst_peak: float = target_gain * breath_level * breath_mul * (float(syllable["burst"]) / 0.035)
	_active.append({
		"is_breath": true,
		"age": 0,
		"total_dur": breath_dur,
		"peak": burst_peak,
		"burst_decay_fast": syllable["burst"] > 0.04,
		"env": Envelope.new(sample_rate),
		"bpf": BiquadFilter.new(
			BiquadFilter.Mode.BANDPASS,
			2600.0 if syllable["burst"] > 0.04 else 1500.0,
			1.2 if syllable["burst"] > 0.04 else 1.9,
			sample_rate
		),
	})


func next_sample() -> float:
	var out := 0.0
	var i := 0
	while i < _active.size():
		var v: Dictionary = _active[i]

		if v.get("is_breath", false):
			var breath_age: int = int(v["age"]) + 1
			v["age"] = breath_age
			if breath_age > int(v["total_dur"]):
				_active.remove_at(i)
				continue
			var t := float(breath_age) / sample_rate
			var peak: float = float(v["peak"])
			var breath_env: float
			if t < 0.015:
				breath_env = peak * (t / 0.015)
			else:
				var decay_tau: float = 0.06 if bool(v["burst_decay_fast"]) else 0.22
				breath_env = peak * exp(-(t - 0.015) / decay_tau)
			var noise_val := _noise()
			out += (v["bpf"] as BiquadFilter).process_sample(noise_val) * breath_env
			i += 1
			continue

		var age: int = int(v["age"]) + 1
		v["age"] = age
		if age > int(v["total_dur"]):
			_active.remove_at(i)
			continue

		if age < int(v["delay"]):
			i += 1
			continue

		var active_age: int = age - int(v["delay"])

		# Formant frequency glide
		var rate: float = float(v["f1_rate"])
		var f1: BiquadFilter = v["f1"] as BiquadFilter
		var f2: BiquadFilter = v["f2"] as BiquadFilter
		var f3: BiquadFilter = v["f3"] as BiquadFilter
		f1.set_cutoff(float(v["f1_target"]) + (f1.cutoff - float(v["f1_target"])) * rate)
		f2.set_cutoff(float(v["f2_target"]) + (f2.cutoff - float(v["f2_target"])) * rate)
		f3.set_cutoff(float(v["f3_target"]) + (f3.cutoff - float(v["f3_target"])) * rate)

		# Vibrato
		var vib: Oscillator = v["vib"] as Oscillator
		var vib_val: float = vib.next_sample() * float(v["vib_depth"])

		# Additive sine harmonics (alias-free vocal source)
		var base_freq: float = float(v["freq"]) * float(v["detune_factor"]) + vib_val
		var phases: PackedFloat32Array = v["phases"]
		var harm_amps: PackedFloat32Array = v["harm_amps"]
		var raw := 0.0
		for h in range(NUM_HARMONICS):
			var h_freq := base_freq * float(h + 1)
			if h_freq > sample_rate * 0.45:
				break
			phases[h] += h_freq / sample_rate
			phases[h] -= floorf(phases[h])
			raw += sin(phases[h] * TAU) * harm_amps[h]
		v["phases"] = phases

		# Sum three formant filters
		var filtered: float = f1.process_sample(raw) + f2.process_sample(raw) + f3.process_sample(raw)

		# Envelope phases
		var env: Envelope = v["env"] as Envelope
		var env_val: float
		var phase_val: int = int(v["phase"])
		match phase_val:
			0:  # attack
				env_val = env.next_sample()
				if active_age >= int(v["attack_samples"]):
					v["phase"] = 1
					env.set_target(float(v["peak"]) * 0.58, release_sec * 0.36)
			1:  # sustain decay
				env_val = env.next_sample()
				if active_age >= int(v["decay_start"]):
					v["phase"] = 2
					env.set_target(0.001, release_sec * 0.3)
			2:  # final decay
				env_val = env.next_sample()
			_:
				env_val = env.next_sample()

		out += filtered * env_val
		i += 1

	return out
