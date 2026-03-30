# Procedural Music Studio

Browser-based procedural sea shanty studio built with the Web Audio API. It generates and mixes the soundtrack entirely in the browser with synthesized instruments and voices instead of samples.

Live site: [https://tomgarske.github.io/ProceduralMusicStudio/](https://tomgarske.github.io/ProceduralMusicStudio/)

## What It Does

The app plays through sea-shanty arrangements made from preset song data. Each preset defines:

- tempo and key defaults
- chord voicings and note tables
- a sequence of named song phases
- per-phase layer levels and timing

The current UI exposes these synthesis layers:

- `Fist Thump`
- `Bass Line`
- `Concertina Chords`
- `Cello Harmony`
- `Arco Bass`
- `Cello Melody`
- `Crew Bass`
- `Crew Baritone`
- `Crew Tenor`

## Main UI

Open `index.html` in a browser, or serve the repo locally.

- `Space`: play or pause
- `⏮ / ⏭`: switch presets
- `Playlist`: select any included shanty
- `BPM`: adjust tempo from 40 to 200
- `Volume`: set output level, including boost above 100%
- `Layer mixer`: set per-layer multipliers on top of each phase's base mix
- `Waveform`: realtime output scope
- `Arrangement`: live per-layer activity strip

The app also supports Media Session controls for play, pause, previous, next, and BPM changes from compatible lock-screen or headset controls.

## Project Structure

- `index.html`: the full static UI and client-side app wiring
- `music_engine_web.js`: the procedural synth engine and scheduler
- `arrangement_live.js`: layer activity visualization
- `presets/`: preset song definitions and manifest
- `poc/voice-synth-compare.html`: Pink Trombone voice experiment

## JavaScript API

```js
const engine = ProceduralMusic.create();

engine.play();
engine.stop();
engine.applyPreset(presetJson);
engine.setVolume(0.8);      // 0-2
engine.setLayer('arp', 1);  // 0-2 multiplier on top of phase level
engine.setBPM(90);          // 40-200

engine.on('phase', ({ label }) => console.log(label));
engine.on('chord', name => console.log(name));
engine.on('beat', beat => console.log(beat));

const analyser = engine.getAnalyser();
const state = engine.getState();
```

## Development

This repo is a static site. There is no backend or build step required.

```bash
git clone https://github.com/TomGarske/ProceduralMusicStudio.git
cd ProceduralMusicStudio
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

GitHub Pages deploys automatically from `main` via `.github/workflows/deploy.yml`.

## Notes

- Audio is generated with oscillators, filters, envelopes, and noise.
- Presets are schema-driven JSON files, so new shanties can be added without changing the engine core.
- The voice POC currently focuses on Pink Trombone rather than meSpeak or vocoder experiments.

MIT License
