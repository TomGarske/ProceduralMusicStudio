class_name PianoLayer
## Concertina/plucked chord stab layer.
## Fires chord notes with sine-wave harmonics, attack/release envelopes,
## and humanization to match the web audio engine.

var sample_rate: float

# Config
var harmonics: Array = [1, 2, 3]
var duration_sec: float = 2.2
var voice_delay_sec: float = 0.004
var gain_scale: float = 0.5

# Active voices (each is a dict with oscillator and envelope state)
var _voices: Array = []

const MAX_VOICES := 24  # Limit to prevent runaway allocation


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_config(config: Dictionary) -> void:
	harmonics = config.get("harmonics", [1, 2, 3])
	duration_sec = config.get("durationSec", 2.2)
	voice_delay_sec = config.get("voiceDelaySec", 0.004)
	gain_scale = config.get("gainScale", 0.5)


func trigger_chord(chord_notes: Array, gain_level: float) -> void:
	# Clear old voices if at limit
	while _voices.size() > MAX_VOICES - chord_notes.size() * harmonics.size():
		_voices.pop_front()

	var boost := 1.5  # CONCERTINA_GAIN_BOOST from original
	var total_samples := int(duration_sec * sample_rate)
	var fade_in_samples := int(sample_rate * 0.004)   # 4ms attack
	var fade_out_samples := int(sample_rate * 0.008)   # 8ms fade-out

	for ni in range(chord_notes.size()):
		var freq: float = float(chord_notes[ni])
		# Humanize: per-voice gain jitter +-15%
		var voice_gain_jitter := 0.85 + randf() * 0.30
		# Humanize: jitter voice delay +-40% and add small random offset
		var jittered_delay := voice_delay_sec * (0.6 + randf() * 0.8)
		var delay_samples := int(ni * jittered_delay * sample_rate + randf() * 0.006 * sample_rate)

		for hi in range(harmonics.size()):
			var h: int = int(harmonics[hi])
			var h_freq := freq * float(h)
			# Skip partials above 8 kHz (matches web)
			if h_freq > 8000.0:
				continue
			# Harmonic amplitude: pow(0.38, idx) matching web
			var amp: float
			if hi == 0:
				amp = 1.0
			else:
				amp = pow(0.38, float(hi))
			# Harmonic decay factor: higher harmonics decay faster (matches web)
			var dec: float
			if hi == 0:
				dec = 0.90
			else:
				dec = maxf(0.12, 0.90 - float(hi) * 0.22)
			# Per-note decay scaling (matches web: 3.5 + ni * 0.4)
			var decay_rate_per_sample := (3.5 + float(ni) * 0.4) * dec
			var h_gain := gain_level * boost * 0.26 * amp * 0.52 * voice_gain_jitter
			# Slight pitch wobble: detune +-3 cents per voice for bellows imperfection
			var detune_factor := pow(2.0, (randf() - 0.5) * 6.0 / 1200.0)

			var voice := {
				"phase": 0.0,
				"freq": h_freq * detune_factor,
				"gain": h_gain,
				"decay_rate": decay_rate_per_sample,
				"delay": delay_samples,
				"sample": 0,
				"total_samples": total_samples,
				"fade_in_samples": fade_in_samples,
				"fade_out_samples": fade_out_samples,
				"alive": true,
			}
			_voices.append(voice)


func next_sample() -> float:
	var out := 0.0
	var i := 0
	while i < _voices.size():
		var v: Dictionary = _voices[i]
		var samp: int = int(v["sample"]) + 1
		v["sample"] = samp

		if samp < int(v["delay"]):
			i += 1
			continue

		var elapsed := samp - int(v["delay"])
		var total: int = int(v["total_samples"])

		# Remove if past duration
		if elapsed >= total:
			_voices.remove_at(i)
			continue

		# Sine wave (matches web version - clean tone, no harsh harmonics)
		var ph: float = float(v["phase"]) + float(v["freq"]) / sample_rate
		ph -= floorf(ph)
		v["phase"] = ph
		var s := sin(ph * TAU)

		# Exponential decay matching web: exp(-t * decay_rate)
		var t := float(elapsed) / sample_rate
		var env := exp(-t * float(v["decay_rate"]))

		# Anti-click: 4ms linear attack
		var fade_in: int = int(v["fade_in_samples"])
		if elapsed < fade_in:
			env *= float(elapsed) / float(fade_in)

		# Anti-click: 8ms linear fade-out at buffer end
		var fade_out: int = int(v["fade_out_samples"])
		if elapsed > total - fade_out:
			env *= float(total - elapsed) / float(fade_out)

		out += s * float(v["gain"]) * env

		if env < 0.0001:
			_voices.remove_at(i)
		else:
			i += 1

	return out
