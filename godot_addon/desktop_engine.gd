## desktop_engine.gd
## Procedural music engine for desktop (Windows / Mac / Linux) builds.
## Uses AudioStreamGenerator to push raw PCM frames.
## Loaded dynamically by music_manager.gd — do not add to scene manually.
##
## Note: GDScript AudioStreamGenerator has a performance ceiling.
## For very complex layering, see the C# port notes at the bottom.

extends Node

signal phase_changed(phase_id: String, label: String)
signal chord_changed(chord_name: String)

const SAMPLE_RATE   := 22050   # Lower rate is fine — we're generating musical tones
const BPM           := 120.0
const BASE_SIXTEENTH := 60.0 / BPM / 4.0   # 0.125s
const BASE_BEAT      := BASE_SIXTEENTH * 4.0

# G natural minor frequencies
const FREQ = {
	"G1": 49.00, "D2": 73.42, "G2": 98.00, "Bb2": 116.54, "C3": 130.81,
	"D3": 146.83, "F3": 174.61, "G3": 196.00, "A3": 220.00, "Bb3": 233.08,
	"C4": 261.63, "D4": 293.66, "Eb4": 311.13, "F4": 349.23, "G4": 392.00,
}

# 16-step arp
const ARP_FREQS = [196.00,293.66,233.08,392.00, 349.23,293.66,233.08,196.00,
                   220.00,293.66,261.63,392.00, 311.13,261.63,233.08,196.00]
const ARP_VELS  = [0.88,0.38,0.54,0.32, 0.72,0.36,0.50,0.28,
                   0.80,0.40,0.56,0.30, 0.66,0.34,0.48,0.26]

# Song phases — id, duration in seconds, layer levels
const PHASES = [
	{ "id":"intro",   "label":"Intro",    "duration":16.0,
	  "lv":{"arp":0.82,"arp2":0.00,"thump":0.70,"sub":0.32,"pad":0.00,"bass":0.28} },
	{ "id":"build1",  "label":"Build 1",  "duration":16.0,
	  "lv":{"arp":0.82,"arp2":0.42,"thump":0.72,"sub":0.38,"pad":0.00,"bass":0.45} },
	{ "id":"verse1",  "label":"Verse",    "duration":20.0,
	  "lv":{"arp":0.80,"arp2":0.46,"thump":0.72,"sub":0.42,"pad":0.48,"bass":0.50} },
	{ "id":"chorus1", "label":"Chorus 1", "duration":16.0,
	  "lv":{"arp":0.78,"arp2":0.48,"thump":0.72,"sub":0.46,"pad":0.52,"bass":0.52} },
	{ "id":"break",   "label":"Break",    "duration":12.0,
	  "lv":{"arp":0.84,"arp2":0.08,"thump":0.76,"sub":0.35,"pad":0.08,"bass":0.30} },
	{ "id":"chorus2", "label":"Chorus 2", "duration":24.0,
	  "lv":{"arp":0.80,"arp2":0.50,"thump":0.72,"sub":0.48,"pad":0.55,"bass":0.54} },
	{ "id":"outro",   "label":"Outro",    "duration":16.0,
	  "lv":{"arp":0.72,"arp2":0.15,"thump":0.65,"sub":0.28,"pad":0.12,"bass":0.22} },
]

# Piano chord voicings — [root_freq, third, fifth, octave]
const PIANO_CHORDS = {
	"Gm": [98.00, 116.54, 146.83, 196.00],
	"Eb": [77.78, 98.00,  116.54, 155.56],
	"Cm": [65.41, 77.78,  98.00,  130.81],
	"Bb": [58.27, 73.42,  87.31,  116.54],
}
const CHORD_SEQ_VERSE   = ["Gm", "Eb"]
const CHORD_SEQ_CHORUS  = ["Gm", "Eb", "Cm", "Bb"]

# Runtime state
var _playing       := false
var _phase_idx     := 0
var _phase_time    := 0.0
var _song_time     := 0.0
var _step          := 0        # arp sixteenth note counter
var _groove_step   := 0        # drum/chord sixteenth note counter
var _beat_count    := 0
var _piano_seq_idx := 0
var _master_vol    := 0.6
var _intensity     := 1.0
var _speed         := 1.0
var _tone          := 1.0

# Per-oscillator phases (for continuous waveform generation)
var _arp_phase     := 0.0
var _arp_freq      := ARP_FREQS[0]
var _sub_phase     := 0.0
var _pad_phases    := [0.0, 0.0, 0.0, 0.0]
var _bass_phase    := 0.0
var _bass_freq     := FREQ["G2"]

# Envelope state
var _arp_env       := 0.0       # current arp amplitude
var _thump_env     := 0.0       # thump decay envelope
var _thump_attack  := 0.0       # thump attack ramp to avoid click transients
var _thump_freq    := 80.0
var _piano_env     := 0.0       # piano release envelope
var _piano_freqs   := []        # current chord being played

# AudioStreamGenerator nodes
var _player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback

# Next event times (in samples from _sample_pos)
var _sample_pos        := 0     # absolute sample counter
var _next_step_sample  := 0
var _next_groove_sample := 0

const PAD_FREQS = [196.00, 293.66, 98.00, 146.83]  # G3 D4 G2 D3
const PAD_DETUNES = [0.0, 3.0, 0.0, -2.0]           # cents

func _ready() -> void:
	_setup_audio_player()

func _setup_audio_player() -> void:
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = SAMPLE_RATE
	stream.buffer_length = 0.2   # 200ms buffer — responsive without crackling

	_player = AudioStreamPlayer.new()
	_player.stream = stream
	_player.volume_db = linear_to_db(_master_vol)
	add_child(_player)

# ── Public API ────────────────────────────────────────────────────────────────

func play() -> void:
	if _playing:
		return
	_playing = true
	_player.play()
	_playback = _player.get_stream_playback()
	_next_step_sample = 0
	_next_groove_sample = 0

func stop() -> void:
	_playing = false
	_player.stop()

func set_volume(v: float) -> void:
	_master_vol = clampf(v, 0.0, 1.0)
	_player.volume_db = linear_to_db(_master_vol)

func set_profile(intensity: float, speed: float, tone: float) -> void:
	_intensity = clampf(intensity, 0.2, 2.0)
	_speed = clampf(speed, 0.2, 3.0)
	_tone = 1.0

func seek_to_phase(phase_id: String) -> void:
	for i in PHASES.size():
		if PHASES[i]["id"] == phase_id:
			_phase_idx = i
			_phase_time = 0.0
			phase_changed.emit(phase_id, PHASES[i]["label"])
			return

# ── Audio generation ──────────────────────────────────────────────────────────
# Called every frame — fills the generator buffer

func _process(_delta: float) -> void:
	if not _playing or not _playback:
		return
	_fill_buffer()

func _fill_buffer() -> void:
	var frames = _playback.get_frames_available()
	if frames <= 0:
		return

	var ph: Dictionary = PHASES[_phase_idx]
	var lv: Dictionary = ph["lv"]
	var dt := 1.0 / SAMPLE_RATE
	var tone_pitch: float = 1.0
	var intensity_gain: float = clampf(1.0 + (_intensity - 1.0) * 0.20, 0.86, 1.14)
	# Speed primarily affects arp movement, not global arrangement pacing.
	var speed_scale: float = clampf(_speed, 0.2, 3.0)
	var step_samples: int = int(BASE_SIXTEENTH * SAMPLE_RATE / speed_scale)
	step_samples = maxi(step_samples, 1)
	var groove_samples: int = int(BASE_SIXTEENTH * SAMPLE_RATE)
	groove_samples = maxi(groove_samples, 1)

	for _i in frames:
		# ── Trigger events on step boundaries ──
		if _sample_pos >= _next_step_sample:
			_trigger_arp_step()
			_next_step_sample = _sample_pos + step_samples
		if _sample_pos >= _next_groove_sample:
			_trigger_groove_step(ph)
			_next_groove_sample = _sample_pos + groove_samples

		# ── Advance per-oscillator phases ──
		var arp_inc   = (_arp_freq * tone_pitch) / SAMPLE_RATE
		var sub_inc   = (FREQ["G1"] * tone_pitch) / SAMPLE_RATE
		var bass_inc  = (_bass_freq * tone_pitch) / SAMPLE_RATE
		_arp_phase  = fmod(_arp_phase  + arp_inc,  1.0)
		_sub_phase  = fmod(_sub_phase  + sub_inc,  1.0)
		_bass_phase = fmod(_bass_phase + bass_inc, 1.0)
		for j in 4:
			var f = PAD_FREQS[j] * tone_pitch * pow(2.0, PAD_DETUNES[j] / 1200.0)
			_pad_phases[j] = fmod(_pad_phases[j] + f / SAMPLE_RATE, 1.0)

		# ── Generate sample ──
		var sample := 0.0

		# Arp — triangle wave with velocity envelope
		_arp_env *= 0.9985   # slow exponential decay between steps
		if lv.get("arp", 0.0) > 0.01:
			sample += _triangle(_arp_phase) * _arp_env * lv["arp"] * 0.38 * intensity_gain

		# Thump — pitch-swept sine decay
		if _thump_env > 0.001:
			if _thump_attack > 0.0:
				_thump_env = minf(_thump_env + 0.035, 1.0)
				_thump_attack = maxf(_thump_attack - 0.035, 0.0)
			_thump_freq = 140.0 * _thump_env + 55.0
			sample += sin(_thump_phase * TAU) * _thump_env * lv.get("thump", 0.0) * 0.50 * intensity_gain
			_thump_phase = fmod(_thump_phase + _thump_freq / SAMPLE_RATE, 1.0)
			_thump_env *= 0.9965

		# Piano chord — multi-partial sine decay
		if _piano_env > 0.001 and _piano_freqs.size() > 0:
			for freq in _piano_freqs:
				sample += sin((freq * tone_pitch) * TAU * float(_sample_pos) / SAMPLE_RATE) * _piano_env * 0.18 * intensity_gain
			_piano_env *= 0.9988

		# Sub bass — pure sine
		if lv.get("sub", 0.0) > 0.01:
			sample += sin(_sub_phase * TAU) * lv["sub"] * 0.15 * intensity_gain

		# String pad — four sine voices detuned
		if lv.get("pad", 0.0) > 0.01:
			var pad_sum := 0.0
			for j in 4:
				pad_sum += sin(_pad_phases[j] * TAU) * 0.25
			sample += pad_sum * lv["pad"] * 0.20 * intensity_gain

		# Bass — sine
		if lv.get("bass", 0.0) > 0.01:
			sample += sin(_bass_phase * TAU) * lv["bass"] * 0.22 * intensity_gain

		# Push stereo frame
		var s := clampf(sample, -1.0, 1.0)
		_playback.push_frame(Vector2(s, s))
		_sample_pos += 1

	# Advance phase time
	_phase_time += float(frames) / SAMPLE_RATE
	_song_time  += float(frames) / SAMPLE_RATE
	if _phase_time >= PHASES[_phase_idx]["duration"]:
		_advance_phase()

# Thump needs its own continuous phase counter
var _thump_phase := 0.0

# ── Step sequencer ────────────────────────────────────────────────────────────

func _trigger_arp_step() -> void:
	var idx = _step % 16

	# Retrigger arp frequency and velocity envelope
	_arp_freq = ARP_FREQS[idx]
	_arp_env  = ARP_VELS[idx]
	_step += 1

func _trigger_groove_step(ph: Dictionary) -> void:
	var idx = _groove_step % 16
	# Thump every 2 beats (every 8 sixteenths: idx 0 and 8)
	if idx == 0 or idx == 8:
		# Use a tiny attack ramp to avoid audible click/skip artifacts.
		_thump_env   = 0.0
		_thump_attack = 1.0
		_thump_freq  = 140.0

		# Piano every bar (idx 0 only)
		if idx == 0:
			_trigger_piano(ph)

		# Bass root on beat
		_bass_freq = FREQ.get("G2", 98.0)
	_groove_step += 1

func _trigger_piano(ph: Dictionary) -> void:
	var seq: Array
	match ph["id"]:
		"build1", "break", "outro":
			seq = CHORD_SEQ_VERSE
		"verse1", "chorus1", "chorus2":
			seq = CHORD_SEQ_CHORUS
		_:
			return   # no piano in intro

	var chord_name = seq[_piano_seq_idx % seq.size()]
	_piano_freqs = PIANO_CHORDS.get(chord_name, [])
	_piano_env   = 1.0
	_piano_seq_idx += 1
	chord_changed.emit(chord_name)
	_bass_freq = _piano_freqs[0] if _piano_freqs.size() > 0 else FREQ["G2"]

func _advance_phase() -> void:
	_phase_time = 0.0
	_phase_idx  = (_phase_idx + 1) % PHASES.size()
	var ph = PHASES[_phase_idx]
	phase_changed.emit(ph["id"], ph["label"])

# ── Waveform helpers ──────────────────────────────────────────────────────────

func _triangle(phase: float) -> float:
	# Triangle wave: rises from -1 to 1 over first half, falls second half
	if phase < 0.5:
		return phase * 4.0 - 1.0
	else:
		return 3.0 - phase * 4.0

# ── C# port note ─────────────────────────────────────────────────────────────
# If you hit performance issues with GDScript, the buffer fill loop is the
# bottleneck. Port _fill_buffer() to C# for ~10x throughput:
#
#   using Godot;
#   public partial class DesktopMusicEngine : Node {
#     private AudioStreamGeneratorPlayback _playback;
#     public override void _Process(double delta) { FillBuffer(); }
#     private void FillBuffer() {
#       int frames = _playback.GetFramesAvailable();
#       for (int i = 0; i < frames; i++) {
#         float s = /* your synthesis */;
#         _playback.PushFrame(new Vector2(s, s));
#       }
#     }
#   }
