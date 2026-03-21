# Procedural Music Studio

Standalone procedural music system for focus/coding sessions. Generates a looping G natural minor soundtrack entirely in the browser with no samples — pure Web Audio API synthesis.

Live site: **[https://tomgarske.github.io/ProceduralMusicStudio/](https://tomgarske.github.io/ProceduralMusicStudio/)**

---

## What it does

Seven song phases (Intro → Build 1 → Verse → Chorus 1 → Break → Chorus 2 → Outro) cycle automatically in a ~2-minute loop. Each phase shapes 11 synthesis layers:

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
| **Ethereal Voices** | Airy choir swells on phrase turns |

---

## Website usage

Open `index.html` in a browser (or visit the GitHub Pages URL above).

- **Space** — play / stop
- **1–7** — jump to phase (Intro through Outro)
- **Phase buttons** — click to jump; auto-starts playback
- **Synthesize** — top-right control; enters post-loop evolving (novel) mode
- **Layer mixer** — per-layer multiplier (0–1) on top of phase values; chord-driven layers show the phase’s chord progression
- **BPM** — 50–120; affects arp rate, echo timing, and beat pulse
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
engine.setBPM(90);               // 50–120
engine.setReverb(0.15);          // 0–0.6 wet (default ~15% in UI)
engine.setLayer('arp', 0.5);     // layer name, 0–2× multiplier on phase level

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
// { playing, phase, phaseLabel, chordSeq, bpm, volume, reverb, layers, phaseLevels }
```

---

## Development

This repository ships the **static web app** only (`index.html`, `music_engine_web.js`, and related assets). There is no Godot add-on or other game-engine integration.

```bash
# Clone
git clone https://github.com/TomGarske/ProceduralMusicStudio.git
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
- **Layer multiplier system** — user sliders (0–2×) multiply phase `lv` values so phase transitions remain musical
- **Song phases** — each phase can be removed with **×** (shown on hover; at least one scripted phase must stay). The loop timeline is recompressed. `engine.removePhase(id)`, `engine.restorePhase(id)`, `engine.getRemovedPhaseIds()`
- **Arrangement view** — `arrangement_live.js`: **one** ring buffer per layer across the **full** strip width (same RMS stream everywhere). **Time runs left → right:** **older** (amber, `x < pastW`) **left** of the center line, **newer** toward the **right**; the **latest** sample is at the **right edge** (`distFromRight = 0`). The grey half is the **lead-in** to the live edge (ahead of the left side in time). **Audio starts immediately** with play; `setArrangementLookaheadSec(futureHalfSec)` matches **phase name** markers (`futureW × frameMs`) so labels cross the center at real transitions. **Phase** labels: **`phaseMarker`** + lookahead. `ArrangementLive.setFocusLayer`.
- **Reverb** — synthetic impulse response via convolver (1.6s room IR baked into Float32Array)
- **Web Audio graph**: oscillators → individual gain → chorus compressor → reverb send → echo delay → master gain → analyser tap + destination

---

MIT License · [Tom Garske](https://github.com/TomGarske)
