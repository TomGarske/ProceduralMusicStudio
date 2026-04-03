class_name PianoLayer
## Piano layer with three components:
## - Chord stabs (full voicing on beat 1)
## - Left-hand accompaniment (bass notes on beats 1 and 3)
## - Right-hand melody (upper chord tones on beats 1 and 2)

var sample_rate: float

# Config
var harmonics: Array = [1, 2, 3]
var duration_sec: float = 2.2
var voice_delay_sec: float = 0.004
var gain_scale: float = 0.5

# Three voice arrays
var _chord_voices: Array = []
var _lh_voices: Array = []
var _rh_voices: Array = []

const MAX_VOICES := 32


func _init(sr: float = 44100.0) -> void:
	sample_rate = sr


func apply_config(config: Dictionary) -> void:
	harmonics = config.get("harmonics", [1, 2, 3])
	duration_sec = config.get("durationSec", 2.2)
	voice_delay_sec = config.get("voiceDelaySec", 0.004)
	gain_scale = config.get("gainScale", 0.5)


func trigger_chord(chord_notes: Array, gain_level: float) -> void:
	# Clear old chord voices if at limit
	var needed := chord_notes.size() * harmonics.size()
	while _chord_voices.size() > MAX_VOICES - needed:
		_chord_voices.pop_front()

	var boost := 0.5
	var total_samples := int(duration_sec * sample_rate)
	var fade_in_samples := int(sample_rate * 0.004)
	var fade_out_samples := int(sample_rate * 0.008)

	for ni in range(chord_notes.size()):
		var freq: float = float(chord_notes[ni])
		var voice_gain_jitter := 0.85 + randf() * 0.30
		var jittered_delay := voice_delay_sec * (0.6 + randf() * 0.8)
		var delay_samples := int(ni * jittered_delay * sample_rate + randf() * 0.006 * sample_rate)

		for hi in range(harmonics.size()):
			var h: int = int(harmonics[hi])
			var h_freq := freq * float(h)
			if h_freq > 8000.0:
				continue
			var amp: float = 1.0 if hi == 0 else pow(0.38, float(hi))
			var dec: float = 0.90 if hi == 0 else maxf(0.12, 0.90 - float(hi) * 0.22)
			var decay_rate := (3.5 + float(ni) * 0.4) * dec
			var h_gain := gain_level * boost * 0.65 * amp * voice_gain_jitter
			var detune_factor := pow(2.0, (randf() - 0.5) * 6.0 / 1200.0)

			_chord_voices.append({
				"phase": 0.0,
				"freq": h_freq * detune_factor,
				"gain": h_gain,
				"decay_rate": decay_rate,
				"delay": delay_samples,
				"sample": 0,
				"total_samples": total_samples,
				"fade_in_samples": fade_in_samples,
				"fade_out_samples": fade_out_samples,
			})


func trigger_left_hand(freq: float, gain_level: float) -> void:
	# Bass accompaniment: 2 harmonics, 1.5s duration, soft attack
	while _lh_voices.size() > 8:
		_lh_voices.pop_front()

	var total_samples := int(1.5 * sample_rate)
	var fade_in_samples := int(sample_rate * 0.008)
	var fade_out_samples := int(sample_rate * 0.008)
	var lh_harmonics := [1, 2]

	for hi in range(lh_harmonics.size()):
		var h: int = lh_harmonics[hi]
		var h_freq := freq * float(h)
		if h_freq > 4000.0:
			continue
		var amp: float = 1.0 if hi == 0 else 0.35
		var h_gain := gain_level * amp * (0.90 + randf() * 0.20)

		_lh_voices.append({
			"phase": 0.0,
			"freq": h_freq,
			"gain": h_gain,
			"decay_rate": 4.5,
			"delay": 0,
			"sample": 0,
			"total_samples": total_samples,
			"fade_in_samples": fade_in_samples,
			"fade_out_samples": fade_out_samples,
		})


func trigger_right_hand(freq: float, gain_level: float) -> void:
	# Melody: 2 harmonics, 1.2s duration
	while _rh_voices.size() > 8:
		_rh_voices.pop_front()

	var total_samples := int(1.2 * sample_rate)
	var fade_in_samples := int(sample_rate * 0.004)
	var fade_out_samples := int(sample_rate * 0.006)
	var rh_harmonics := [1, 2]

	for hi in range(rh_harmonics.size()):
		var h: int = rh_harmonics[hi]
		var h_freq := freq * float(h)
		if h_freq > 8000.0:
			continue
		var amp: float = 1.0 if hi == 0 else 0.25
		var h_gain := gain_level * amp * (0.90 + randf() * 0.20)

		_rh_voices.append({
			"phase": 0.0,
			"freq": h_freq,
			"gain": h_gain,
			"decay_rate": 5.0,
			"delay": 0,
			"sample": 0,
			"total_samples": total_samples,
			"fade_in_samples": fade_in_samples,
			"fade_out_samples": fade_out_samples,
		})


func _process_voices(voices: Array) -> float:
	var out := 0.0
	var i := 0
	while i < voices.size():
		var v: Dictionary = voices[i]
		var samp: int = int(v["sample"]) + 1
		v["sample"] = samp

		if samp < int(v["delay"]):
			i += 1
			continue

		var elapsed := samp - int(v["delay"])
		var total: int = int(v["total_samples"])

		if elapsed >= total:
			voices.remove_at(i)
			continue

		var ph: float = float(v["phase"]) + float(v["freq"]) / sample_rate
		ph -= floorf(ph)
		v["phase"] = ph
		var s := sin(ph * TAU)

		var t := float(elapsed) / sample_rate
		var env := exp(-t * float(v["decay_rate"]))

		var fade_in: int = int(v["fade_in_samples"])
		if elapsed < fade_in:
			env *= float(elapsed) / float(fade_in)

		var fade_out: int = int(v["fade_out_samples"])
		if elapsed > total - fade_out:
			env *= float(total - elapsed) / float(fade_out)

		out += s * float(v["gain"]) * env

		if env < 0.0001:
			voices.remove_at(i)
		else:
			i += 1

	return out


func next_sample() -> float:
	return _process_voices(_chord_voices) + _process_voices(_lh_voices) + _process_voices(_rh_voices)
