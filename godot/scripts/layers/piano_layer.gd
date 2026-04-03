class_name PianoLayer
## Concertina/plucked chord stab layer.
## Fires chord notes with harmonics and exponential decay.

var sample_rate: float

# Config
var harmonics: Array = [1, 2, 3]
var duration_sec: float = 2.0
var voice_delay_sec: float = 0.008
var gain_scale: float = 0.5

# Active voices (each is a dict with oscillators and envelope state)
var _voices: Array = []

const MAX_VOICES := 24  # Limit to prevent runaway allocation


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_config(config: Dictionary) -> void:
	harmonics = config.get("harmonics", [1, 2, 3])
	duration_sec = config.get("durationSec", 2.0)
	voice_delay_sec = config.get("voiceDelaySec", 0.008)
	gain_scale = config.get("gainScale", 0.5)


func trigger_chord(chord_notes: Array, gain_level: float) -> void:
	# Clear old voices if at limit
	while _voices.size() > MAX_VOICES - chord_notes.size() * harmonics.size():
		_voices.pop_front()

	var boost := 1.5  # CONCERTINA_GAIN_BOOST from original
	for ni in range(chord_notes.size()):
		var freq: float = float(chord_notes[ni])
		var delay_samples := int(ni * voice_delay_sec * sample_rate)
		for hi in range(harmonics.size()):
			var h: int = int(harmonics[hi])
			var h_freq := freq * float(h)
			var h_gain := gain_level * boost / float(h) * 0.25
			var voice := {
				"phase": 0.0,
				"freq": h_freq,
				"gain": h_gain,
				"decay_rate": exp(-1.0 / (duration_sec * 0.3 * sample_rate)),
				"delay": delay_samples,
				"sample": 0,
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

		# Triangle wave for each partial
		var ph: float = float(v["phase"]) + float(v["freq"]) / sample_rate
		ph -= floorf(ph)
		v["phase"] = ph
		var s: float
		if ph < 0.5:
			s = 4.0 * ph - 1.0
		else:
			s = 3.0 - 4.0 * ph

		var g: float = float(v["gain"]) * float(v["decay_rate"])
		v["gain"] = g
		out += s * g

		if g < 0.0001:
			_voices.remove_at(i)
		else:
			i += 1

	return out
