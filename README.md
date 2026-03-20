# Procedural Music Studio

Standalone procedural music system for focus/coding sessions. Generates a looping G natural minor soundtrack entirely in the browser with no samples — pure Web Audio API synthesis.

Live site: **[https://tomgarske.github.io/ProceduralMusicStudio/](https://tomgarske.github.io/ProceduralMusicStudio/)**

---

## What it does

Seven song phases (Intro → Build 1 → Verse → Chorus 1 → Break → Chorus 2 → Outro) cycle automatically in a ~2-minute loop. Each phase shapes 10 synthesis layers:

| Layer | Description |
|---|---|
| **Arpeggio** | Triangle-wave melodic pattern, 16-step sequencer |
| **Echo / Arp 2** | Delayed arp copy with BPM-synced feedback |
| **Kick / Thump** | Pitch-swept sine kick drum |
| **Piano** | Multi-partial chord stabs (Gm / Eb / Cm / Bb) |
| **Sub Bass** | Low-frequency sine foundation |
| **String Pad** | Four detuned sines with vibrato |
| **Bass** | Root-note bass line following chord |
| **Shimmer** | High-freq sparkle (Chorus phases only) |
| **Drone** | Held root + rhythmic pulse (Chorus phases only) |
| **Beat Pulse** | Rhythmic sidechain-style pulse |

---

## Website usage

Open `index.html` in a browser (or visit the GitHub Pages URL above).

- **Space** — play / stop
- **1–7** — jump to phase (Intro through Outro)
- **Phase buttons** — click to jump; auto-starts playback
- **Layer mixer** — per-layer multiplier (0–1) on top of phase values; M button mutes
- **BPM** — 60–200; affects arp rate, echo timing, and beat pulse
- **Reverb** — wet/dry convolver mix
- **Oscilloscope** — live waveform via AnalyserNode

---

## JavaScript API

```js
const engine = ProceduralMusic.create();

engine.play();
engine.stop();
engine.seekToPhase('chorus1');   // 'intro'|'build1'|'verse1'|'chorus1'|'break'|'chorus2'|'outro'
engine.setVolume(0.8);           // 0–1
engine.setBPM(140);              // 60–200
engine.setReverb(0.25);          // 0–0.6
engine.setLayer('arp', 0.5);     // layer name, 0–1 multiplier

// Events
engine.on('phase', ({ id, label }) => console.log('Phase:', label));
engine.on('chord', name => console.log('Chord:', name));
engine.on('beat',  beat => console.log('Beat:', beat));

// Oscilloscope
const analyser = engine.getAnalyser();   // Web Audio AnalyserNode
const buf = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(buf);

// Full state snapshot
const state = engine.getState();
// { playing, phase, phaseLabel, bpm, volume, reverb, layers, phaseLevels }
```

---

## Development

```bash
# Clone
git clone https://github.com/BurnBridgers/ProceduralMusicStudio.git
cd ProceduralMusicStudio

# Serve locally (Python)
python3 -m http.server 8080
# Open http://localhost:8080
```

GitHub Pages deploys automatically on push to `main` via `.github/workflows/deploy.yml`.

---

## Architecture notes

- **No samples** — everything is oscillators, envelopes, and filters
- **BPM-independent groove** — arp rate can be slaved to BPM while kick/chord/bass stay locked
- **Layer multiplier system** — user sliders (0–1) multiply phase `lv` values so phase transitions remain musical
- **Reverb** — synthetic impulse response via convolver (1.6s room IR baked into Float32Array)
- **Web Audio graph**: oscillators → individual gain → chorus compressor → reverb send → echo delay → master gain → analyser tap + destination

---

MIT License · Built for [Blacksite Containment](https://github.com/BurnBridgers/BurnBridgers)
