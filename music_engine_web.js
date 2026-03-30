// music_engine_web.js
// Procedural Music Studio — Sea Shanty Web Audio engine
// Browser-only procedural music engine for sea shanty synthesis.
// Drop into any HTML page.
//
// Public API:
//   const engine = ProceduralMusic.create({ preset }); // preset optional — defaults to bundled JSON
//   engine.play()
//   engine.stop()
//   engine.applyPreset(preset)      // replace the active preset definition
//   engine.getPreset()              // { id, name }
//   engine.getNextPhaseLevels()     // next phase lv map
//   engine.setVolume(0-2)           // 1.0 = unity, >1 = boost
//   engine.setLayer(name, 0-2)      // layer name from LAYER_IDS
//   engine.setBPM(bpm)              // 40-200, default 120
//   engine.setKey(id)               // e.g. 'Gm', 'Am', 'Dm'
//   engine.setPhaseLoop(id|null)    // lock playback to a phase id
//   engine.setArpFilter(hz)         // arp LPF cutoff, default auto per phase
//   engine.getAnalyser()            // AnalyserNode (realtime, no output delay)
//   engine.getLayerAnalysers()      // { layerId: AnalyserNode } per-layer RMS taps (after play)
//   engine.resumeAudioContext()     // Promise — resume suspended AudioContext (e.g. after screen unlock)
//   engine.getState()               // { playing, transportActive, phase, ... }
//   engine.on(event, callback)      // 'phase' | 'chord' | 'beat'
//   engine.off(event, callback)

const ProceduralMusic = (() => {
  const DEFAULT_PRESET = JSON.parse("{\n  \"schemaVersion\": 1,\n  \"id\": \"drunken-sailor\",\n  \"name\": \"Drunken Sailor\",\n  \"description\": \"Traditional sea shanty in D minor. Bodhran stomps, concertina drone, crew chorus in call-and-response. Public domain folk song.\",\n  \"defaults\": {\n    \"bpm\": 120,\n    \"key\": \"Dm\"\n  },\n  \"keyOffsets\": {\n    \"Dm\": 0,\n    \"Em\": 2,\n    \"Fm\": 3,\n    \"Gm\": 5,\n    \"Am\": 7,\n    \"Bbm\": 8,\n    \"Cm\": 10\n  },\n  \"baseNotesHz\": {\n    \"D1\": 36.71,\n    \"E1\": 41.2,\n    \"F1\": 43.65,\n    \"G1\": 49,\n    \"A1\": 55,\n    \"C2\": 65.41,\n    \"D2\": 73.42,\n    \"E2\": 82.41,\n    \"F2\": 87.31,\n    \"G2\": 98,\n    \"A2\": 110,\n    \"Bb2\": 116.54,\n    \"B2\": 123.47,\n    \"C3\": 130.81,\n    \"D3\": 146.83,\n    \"E3\": 164.81,\n    \"F3\": 174.61,\n    \"G3\": 196,\n    \"A3\": 220,\n    \"Bb3\": 233.08,\n    \"B3\": 246.94,\n    \"C4\": 261.63,\n    \"D4\": 293.66,\n    \"E4\": 329.63,\n    \"F4\": 349.23,\n    \"G4\": 392,\n    \"A4\": 440,\n    \"B4\": 493.88,\n    \"C5\": 523.25,\n    \"D5\": 587.33\n  },\n  \"chordVoicings\": {\n    \"Dm\": {\n      \"label\": \"Dm\",\n      \"notes\": [\n        \"D3\",\n        \"A3\",\n        \"D4\",\n        \"F4\"\n      ]\n    },\n    \"C\": {\n      \"label\": \"C\",\n      \"notes\": [\n        \"C3\",\n        \"G3\",\n        \"C4\",\n        \"E4\"\n      ]\n    },\n    \"Am\": {\n      \"label\": \"Am\",\n      \"notes\": [\n        \"A2\",\n        \"E3\",\n        \"A3\",\n        \"C4\"\n      ]\n    },\n    \"F\": {\n      \"label\": \"F\",\n      \"notes\": [\n        \"F3\",\n        \"A3\",\n        \"C4\",\n        \"F4\"\n      ]\n    },\n    \"Gm\": {\n      \"label\": \"Gm\",\n      \"notes\": [\n        \"G3\",\n        \"D4\",\n        \"G4\"\n      ]\n    },\n    \"Bb\": {\n      \"label\": \"Bb\",\n      \"notes\": [\n        \"Bb3\",\n        \"D4\",\n        \"F4\"\n      ]\n    }\n  },\n  \"droneVoicings\": [\n    {\n      \"root\": \"D2\",\n      \"fifth\": \"A2\"\n    },\n    {\n      \"root\": \"C3\",\n      \"fifth\": \"G3\"\n    }\n  ],\n  \"velocities\": [\n    0.92,\n    0.28,\n    0.52,\n    0.24,\n    0.88,\n    0.3,\n    0.48,\n    0.22,\n    0.85,\n    0.26,\n    0.5,\n    0.22,\n    0.82,\n    0.28,\n    0.46,\n    0.2\n  ],\n  \"layerIds\": [\n    \"arp\",\n    \"thump\",\n    \"piano\",\n    \"pad\",\n    \"bass\",\n    \"drone\",\n    \"voiceBass\",\n    \"voiceBaritone\",\n    \"voiceTenor\"\n  ],\n  \"layerMix\": {\n    \"arp\": 0.35,\n    \"thump\": 0.65,\n    \"piano\": 0.5,\n    \"pad\": 0.2,\n    \"bass\": 0.25,\n    \"drone\": 0.22,\n    \"voiceBass\": 0.22,\n    \"voiceBaritone\": 0.193,\n    \"voiceTenor\": 0.138\n  },\n  \"layerConfigs\": {\n    \"arp\": {\n      \"stepsPerBar\": 16,\n      \"lfoHz\": 4.8,\n      \"attackSec\": 0.015,\n      \"decayTauMul\": 0.85,\n      \"gainScale\": 0.35\n    },\n    \"thump\": {\n      \"durationSec\": 0.55,\n      \"startHz\": 100,\n      \"endHz\": 42,\n      \"pitchDecay\": 5,\n      \"ampDecay\": 4,\n      \"gainScale\": 0.65\n    },\n    \"piano\": {\n      \"harmonics\": [\n        1,\n        2,\n        3\n      ],\n      \"durationSec\": 2,\n      \"voiceDelaySec\": 0.008,\n      \"gainScale\": 0.5\n    },\n    \"pad\": {\n      \"vibratoHz\": 4,\n      \"vibratoDepth\": 1.5,\n      \"lpfHz\": 480,\n      \"voiceGain\": 0.12,\n      \"gainScale\": 0.2\n    },\n    \"bass\": {\n      \"lpfHz\": 300,\n      \"hpfHz\": 38,\n      \"detuneCents\": -8,\n      \"gainScale\": 0.25\n    },\n    \"drone\": {\n      \"holdBeats\": 16,\n      \"pulseBeats\": 16,\n      \"lpfHz\": 220,\n      \"gainScale\": 0.22\n    },\n    \"voices\": {\n      \"releaseSec\": 2.8,\n      \"vibratoHz\": 3.8,\n      \"formantHz\": 720,\n      \"triggerSteps\": [\n        0,\n        8\n      ]\n    }\n  },\n  \"arpPattern\": [\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"D2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"F2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"C2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"E2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"B2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"C3\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"D3\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"C3\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"A2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"G2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"E2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"D2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"D2\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\",\n    \"-\"\n  ],\n  \"phaseFilterHz\": {\n    \"shanty_call\": 480,\n    \"shanty_response\": 620,\n    \"full_crew\": 780,\n    \"heave_ho\": 980,\n    \"calm_sea\": 400,\n    \"all_hands\": 1100,\n    \"port\": 360\n  },\n  \"phases\": [\n    {\n      \"id\": \"shanty_call\",\n      \"label\": \"Shanty Call\",\n      \"durationBeats\": 32,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Dm\",\n        \"C\",\n        \"C\",\n        \"Dm\",\n        \"Dm\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": false,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"F2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"B2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.24,\n        \"thump\": 0.48,\n        \"piano\": 0,\n        \"pad\": 0,\n        \"bass\": 0.18,\n        \"drone\": 0,\n        \"voiceBass\": 0,\n        \"voiceBaritone\": 0,\n        \"voiceTenor\": 0\n      }\n    },\n    {\n      \"id\": \"shanty_response\",\n      \"label\": \"Crew Response\",\n      \"durationBeats\": 32,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Dm\",\n        \"C\",\n        \"C\",\n        \"Dm\",\n        \"Dm\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": false,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"F2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"B2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.28,\n        \"thump\": 0.55,\n        \"piano\": 0.4,\n        \"pad\": 0,\n        \"bass\": 0.2,\n        \"drone\": 0,\n        \"voiceBass\": 0.46,\n        \"voiceBaritone\": 0.46,\n        \"voiceTenor\": 0.46\n      }\n    },\n    {\n      \"id\": \"full_crew\",\n      \"label\": \"Full Crew\",\n      \"durationBeats\": 64,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Dm\",\n        \"C\",\n        \"C\",\n        \"Dm\",\n        \"Dm\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": false,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"F2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"B2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.31,\n        \"thump\": 0.61,\n        \"piano\": 0.45,\n        \"pad\": 0.18,\n        \"bass\": 0.22,\n        \"drone\": 0,\n        \"voiceBass\": 0.52,\n        \"voiceBaritone\": 0.52,\n        \"voiceTenor\": 0.52\n      }\n    },\n    {\n      \"id\": \"heave_ho\",\n      \"label\": \"Heave Ho!\",\n      \"durationBeats\": 48,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Dm\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": true,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"B2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.35,\n        \"thump\": 0.68,\n        \"piano\": 0.5,\n        \"pad\": 0.2,\n        \"bass\": 0.25,\n        \"drone\": 0.22,\n        \"voiceBass\": 0.58,\n        \"voiceBaritone\": 0.58,\n        \"voiceTenor\": 0.58\n      }\n    },\n    {\n      \"id\": \"calm_sea\",\n      \"label\": \"Calm Sea\",\n      \"durationBeats\": 32,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Am\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": false,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"F2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.31,\n        \"thump\": 0.61,\n        \"piano\": 0.45,\n        \"pad\": 0.18,\n        \"bass\": 0.22,\n        \"drone\": 0,\n        \"voiceBass\": 0.52,\n        \"voiceBaritone\": 0.52,\n        \"voiceTenor\": 0.52\n      }\n    },\n    {\n      \"id\": \"all_hands\",\n      \"label\": \"All Hands!\",\n      \"durationBeats\": 64,\n      \"chordSeq\": [\n        \"Dm\",\n        \"Dm\",\n        \"C\",\n        \"C\",\n        \"Dm\",\n        \"Dm\",\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": true,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"F2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"B2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"C3\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.28,\n        \"thump\": 0.55,\n        \"piano\": 0.4,\n        \"pad\": 0.16,\n        \"bass\": 0.2,\n        \"drone\": 0.18,\n        \"voiceBass\": 0.46,\n        \"voiceBaritone\": 0.46,\n        \"voiceTenor\": 0.46\n      }\n    },\n    {\n      \"id\": \"port\",\n      \"label\": \"Into Port\",\n      \"durationBeats\": 32,\n      \"chordSeq\": [\n        \"Am\",\n        \"Dm\"\n      ],\n      \"droneMode\": false,\n      \"arpPattern\": [\n        \"A2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"G2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"E2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"D2\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\",\n        \"-\"\n      ],\n      \"lv\": {\n        \"arp\": 0.24,\n        \"thump\": 0.48,\n        \"piano\": 0.35,\n        \"pad\": 0.14,\n        \"bass\": 0.18,\n        \"drone\": 0,\n        \"voiceBass\": 0.4,\n        \"voiceBaritone\": 0.4,\n        \"voiceTenor\": 0.4\n      }\n    }\n  ]\n}");

  function deepMerge(a, b) {
    if (!b) return a;
    const out = { ...a };
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
        out[k] = deepMerge(a[k] || {}, b[k]);
      } else {
        out[k] = b[k];
      }
    }
    return out;
  }

  // bpm: preset default BPM used to convert quarter-note beats → seconds.
  // At 60 BPM this is a 1:1 pass-through (legacy behaviour).
  function timelinePhasesFromPreset(phases, bpm) {
    const beatsToSec = bpm ? (60 / bpm) : 1;
    let start = 0;
    return phases.map(p => {
      const rawDur = p.durationBeats != null ? p.durationBeats : (p.end - p.start);
      const dur = rawDur * beatsToSec;
      const end = start + dur;
      const next = {
        id: p.id,
        label: p.label,
        start,
        end,
        chordSeq: p.chordSeq === undefined ? null : p.chordSeq,
        droneMode: !!p.droneMode,
        lv: { ...p.lv },
      };
      if (p.arpPattern) next.arpPattern = p.arpPattern;
      start = end;
      return next;
    });
  }

  const MIN_AUDIBLE_LAYER_LEVEL = 0.3;

  function floorPositiveLayerLevel(value) {
    if (!Number.isFinite(value)) return 0;
    if (value <= 0) return 0;
    return Math.max(MIN_AUDIBLE_LAYER_LEVEL, value);
  }

  function normalizeLayerLevelMap(levels) {
    const next = {};
    for (const [key, value] of Object.entries(levels || {})) {
      next[key] = floorPositiveLayerLevel(value);
    }
    return next;
  }

  function normalizePresetDynamics(preset) {
    return {
      ...preset,
      layerMix: normalizeLayerLevelMap(preset.layerMix),
      phases: (preset.phases || []).map((phase) => ({
        ...phase,
        lv: normalizeLayerLevelMap(phase.lv),
      })),
    };
  }

  const CONCERTINA_GAIN_BOOST = 1.5;

  function create(options = {}) {
    let bpm = DEFAULT_PRESET.defaults.bpm;
    let bpmTarget = bpm;
    let s16 = () => 60 / bpm / 4;   // sixteenth note duration (live)
    let keyId = DEFAULT_PRESET.defaults.key;

    let KEY_OFFSETS = { ...DEFAULT_PRESET.keyOffsets };
    let BASE_N = { ...DEFAULT_PRESET.baseNotesHz };
    let VEL = DEFAULT_PRESET.velocities.slice();
    let arpPattern = DEFAULT_PRESET.arpPattern.slice();
    const LAYER_IDS = DEFAULT_PRESET.layerIds.slice();
    let layerConfigs = deepMerge({}, DEFAULT_PRESET.layerConfigs);
    let phaseFilterHzMap = { ...DEFAULT_PRESET.phaseFilterHz };
    let presetChordVoicings = null;   // null = use hardcoded G-minor chords; object = custom
    let presetDroneVoicings = null;   // null = use hardcoded drone pair; array = custom
    let lastPresetMeta = { id: DEFAULT_PRESET.id || '', name: DEFAULT_PRESET.name || '' };

    function keyRatio() {
      const semis = KEY_OFFSETS[keyId] ?? 0;
      return Math.pow(2, semis / 12);
    }
    function tn(name) {
      return (BASE_N[name] || 0) * keyRatio();
    }
    function noteNameFor(baseName) {
      const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
      const match = /^([A-G]#?|Eb|Ab|Bb|F#)(\d)$/.exec(baseName);
      if (!match) return baseName;
      const [_, n, oct] = match;
      const idxMap = { C:0,'C#':1,D:2,Eb:3,E:4,F:5,'F#':6,G:7,Ab:8,A:9,Bb:10,B:11 };
      const idx = idxMap[n];
      const semis = (idx + (KEY_OFFSETS[keyId] ?? 0) + 12) % 12;
      return `${names[semis]}${oct}`;
    }
    function buildScaleData() {
      const N = Object.fromEntries(Object.keys(BASE_N).map(k => [k, tn(k)]));
      const mapNote = (name, ctx) => {
        if (name === '-') return 0; // hold — sustain previous note
        const hz = N[name];
        if (hz == null) throw new Error(`${ctx}: unknown note key "${name}"`);
        return hz;
      };
      const mapArpNote = (name, ctx) => {
        const hz = mapNote(name, ctx);
        // Keep the cello melody in one low-mid register family across songs.
        return hz > 0 ? fitFreqToRange(hz, 65.41, 261.63) : 0; // C2..C4
      };
      const ARP = arpPattern.map(name => mapArpNote(name, 'arpPattern'));
      // Build per-phase ARP arrays for phases that define their own arpPattern
      const phaseARP = {};
      if (activePhases) {
        for (const ph of activePhases) {
          if (ph.arpPattern) {
            phaseARP[ph.id] = ph.arpPattern.map(name => mapArpNote(name, `phase ${ph.id} arpPattern`));
          }
        }
      }

      // ── Chords: use preset-defined voicings if available, else hardcoded defaults
      let CHORDS;
      if (presetChordVoicings) {
        CHORDS = {};
        for (const [id, def] of Object.entries(presetChordVoicings)) {
          CHORDS[id] = {
            name: def.label || id,
            notes: def.notes.map(n => {
              const hz = N[n];
              if (hz == null) throw new Error(`chordVoicings.${id}: unknown note "${n}"`);
              return hz;
            }),
          };
        }
      } else {
        CHORDS = {
          Gm: { name:`${keyId}`, notes:[N.G2, N.D3, N.G3, N.Bb3, N.D4] },
          Eb: { name:`${noteNameFor('Eb4').replace(/[0-9]/g, '')}`, notes:[N.G2, N.Eb4*0.5, N.G3, N.Bb3, N.Eb4] },
          Cm: { name:`${noteNameFor('C4').replace(/[0-9]/g, '')}m`, notes:[N.C3, N.G3, N.C4, N.Eb4] },
          Bb: { name:`${noteNameFor('Bb3').replace(/[0-9]/g, '')}`, notes:[N.Bb2*0.5, N.F3, N.Bb3, N.D4] },
        };
      }

      return { N, ARP, phaseARP, CHORDS };
    }

    let cachedScaleData = null;
    function getScaleData() {
      if (!cachedScaleData) cachedScaleData = buildScaleData();
      return cachedScaleData;
    }
    function invalidateScaleCache() {
      cachedScaleData = null;
    }

    function fitFreqToRange(freq, minHz, maxHz) {
      let out = Number.isFinite(freq) ? freq : minHz;
      while (out < minHz) out *= 2;
      while (out > maxHz) out *= 0.5;
      return out;
    }
    function fitFreqToOrderedRange(freq, minHz, maxHz, floorHz=0) {
      let out = fitFreqToRange(freq, minHz, maxHz);
      while (floorHz && out <= floorHz * 1.02) out *= 2;
      while (out > maxHz) out *= 0.5;
      return Math.max(minHz, out);
    }
    const CREW_PARTS = [
      {
        id: 'voiceBass',
        node: 'voiceBassGain',
        label: 'Crew Bass',
        noteIndex: 0,
        minHz: 65.41,   // C2
        maxHz: 130.81,  // C3
        formantShift: -120,
        gainMul: 1.08,
        vibratoMul: 0.75,
        breathMul: 0.78,
        detuneMul: 0.72,
        maxVoices: 2,
      },
      {
        id: 'voiceBaritone',
        node: 'voiceBaritoneGain',
        label: 'Crew Baritone',
        noteIndex: 1,
        minHz: 98.0,    // G2
        maxHz: 196.0,   // G3
        formantShift: -60,
        gainMul: 0.94,
        vibratoMul: 0.88,
        breathMul: 0.9,
        detuneMul: 0.86,
        maxVoices: 2,
      },
      {
        id: 'voiceTenor',
        node: 'voiceTenorGain',
        label: 'Crew Tenor',
        noteIndex: 2,
        minHz: 146.83,  // D3
        maxHz: 293.66,  // D4
        formantShift: 15,
        gainMul: 0.8,
        vibratoMul: 1.0,
        breathMul: 1.0,
        detuneMul: 1.0,
        maxVoices: 3,
      },
    ];
    const CREW_PART_MAP = Object.fromEntries(CREW_PARTS.map((part) => [part.id, part]));
    function getSupportReferenceChord() {
      const { CHORDS } = getScaleData();
      const firstPhase = activePhases.find(p => Array.isArray(p.chordSeq) && p.chordSeq.length);
      const chordId = firstPhase?.chordSeq?.[0];
      return (chordId && CHORDS[chordId]) || Object.values(CHORDS)[0] || null;
    }
    function getPadSupportVoicing(chord) {
      const notes = chord?.notes || [];
      return [
        fitFreqToRange(notes[0] ?? 73.42, 65.41, 110.0),
        fitFreqToRange(notes[1] ?? notes[0] ?? 110.0, 98.0, 164.81),
        fitFreqToRange(notes[notes.length - 1] ?? notes[0] ?? 146.83, 130.81, 246.94),
      ];
    }
    function getBassLineVoicing(chord) {
      const notes = chord?.notes || [];
      return {
        // Keep the plucked bass in an actual bass register even when the
        // shared chord voicing is written up for concertina/choir parts.
        root: fitFreqToRange(notes[0] ?? 73.42, 41.2, 98.0),
        fifth: fitFreqToRange(notes[1] ?? notes[0] ?? 110.0, 55.0, 146.83),
      };
    }
    function setPadVoicing(chord, when) {
      if (!nd.padVoices?.length) return;
      const t = when ?? actx.currentTime;
      const voicing = Array.isArray(chord) ? chord : getPadSupportVoicing(chord);
      nd.padVoices.forEach((voice, idx) => {
        const freq = voicing[Math.min(idx, voicing.length - 1)];
        voice.osc.frequency.setTargetAtTime(freq, t, 0.08 + idx * 0.015);
      });
    }
    function getDroneSupportVoicing(chord, leadFifth=false) {
      const notes = chord?.notes || [];
      const root = fitFreqToRange(notes[0] ?? 73.42, 41.2, 98.0);
      const fifth = fitFreqToRange(notes[1] ?? notes[0] ?? 110.0, 55.0, 146.83);
      return leadFifth
        ? { main: fifth, support: fitFreqToRange(root, 55.0, 110.0) }
        : { main: root, support: fifth };
    }
    function getCrewVoicing(chord) {
      const notes = chord?.notes || [];
      const bassSrc = notes[0] ?? 73.42;
      const baritoneSrc = notes[1] ?? notes[notes.length - 1] ?? bassSrc * 1.5;
      const tenorSrc = notes[2] ?? notes[notes.length - 1] ?? baritoneSrc * 1.25;
      const bass = fitFreqToRange(bassSrc, CREW_PART_MAP.voiceBass.minHz, CREW_PART_MAP.voiceBass.maxHz);
      const baritone = fitFreqToOrderedRange(
        baritoneSrc,
        CREW_PART_MAP.voiceBaritone.minHz,
        CREW_PART_MAP.voiceBaritone.maxHz,
        bass,
      );
      const tenor = fitFreqToOrderedRange(
        tenorSrc,
        CREW_PART_MAP.voiceTenor.minHz,
        CREW_PART_MAP.voiceTenor.maxHz,
        baritone,
      );
      return {
        voiceBass: bass,
        voiceBaritone: baritone,
        voiceTenor: tenor,
      };
    }
    function setDroneVoicing(mainFreq, supportFreq, when) {
      if (!actx) return;
      const t = when ?? actx.currentTime;
      if (nd.drO1) nd.drO1.frequency.setTargetAtTime(mainFreq, t, 0.03);
      if (nd.drO2) nd.drO2.frequency.setTargetAtTime(mainFreq, t, 0.04);
      if (nd.drO3) nd.drO3.frequency.setTargetAtTime(supportFreq, t, 0.05);
    }

    const pianoPartialCache = new Map();
    let thumpBufferBase = null;
    let thumpBufferSr = 0;

    // ── Pre-rendered breath noise buffer (reused across voice triggers to avoid GC pressure)
    let breathNoiseBuffer = null;
    let breathNoiseSr = 0;

    function getBreathNoiseBuffer() {
      const sr = actx.sampleRate;
      if (breathNoiseBuffer && breathNoiseSr === sr) return breathNoiseBuffer;
      // 1.5s of noise — long enough for any voice release duration
      const len = Math.floor(sr * 1.5);
      const buf = actx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      breathNoiseBuffer = buf;
      breathNoiseSr = sr;
      return buf;
    }

    function invalidateAudioBuffers() {
      pianoPartialCache.clear();
      thumpBufferBase = null;
      thumpBufferSr = 0;
      breathNoiseBuffer = null;
      breathNoiseSr = 0;
    }

    let PHASES = [];
    let lastPresetPhases = null; // raw phase objects from preset, for BPM-change rebuilds

    /** Phases removed in the UI — timeline is recompressed to [0, scriptedTotal). */
    const disabledPhaseIds = new Set();
    let activePhases = [];
    let scriptedTotal = 0;
    let phaseLoopId = null;

    function rebuildPhaseSchedule() {
      const enabled = PHASES.filter(p => !disabledPhaseIds.has(p.id));
      if (enabled.length < 1) {
        disabledPhaseIds.clear();
        return rebuildPhaseSchedule();
      }
      let acc = 0;
      activePhases = enabled.map(p => {
        const dur = p.end - p.start;
        const start = acc;
        acc += dur;
        return { ...p, start, end: acc };
      });
      scriptedTotal = acc;
      if (phaseLoopId && !activePhases.some(p => p.id === phaseLoopId)) {
        phaseLoopId = null;
      }
    }

    function clampPausedTime() {
      if (scriptedTotal <= 0) return;
      let t = playing && actx ? elapsed() : pausedAt;
      t = Math.min(Math.max(0, t), scriptedTotal - 1e-6);
      if (playing && actx) {
        pausedAt = t;
        startTime = actx.currentTime;
      } else {
        pausedAt = t;
      }
    }

    // User overrides: 0-1 multipliers applied on top of phase lv values
    const layerMult = Object.fromEntries(LAYER_IDS.map(name => [name, 1]));
    let arpFilterOverride = null; // null = auto per phase
    let volumeSetting = 1.0;

    let actx=null, nd={}, startTime=0, pausedAt=0, playing=false, streamDest=null;
    let step=0, pianoBarCount=0, crewSyllableIdx=0, currentPhase=null;
    /** Next 16th-note event time (AudioContext), used by lookahead scheduler. */
    let nextTickAt = 0;
    let schedulerIntervalId = null;
    let lastPlayedChord = null;
    /** Reset step sequencer counters so the arp pattern, groove, and chord
     *  progression start from the top. Call on manual seek and loop-back. */
    function resetSequencerCounters() {
      step = 0;
      pianoBarCount = 0;
      crewSyllableIdx = 0;
      lastPlayedChord = null;
    }
    let analyser = null;
    let layerAnalysers = {};

    // Event emitter — deferred so tick() only queues events; callbacks run after
    // the scheduler's tight loop finishes, keeping audio scheduling jank-free.
    const listeners = { phase:[], chord:[], beat:[] };
    let pendingEvents = [];
    function emit(type, data) { pendingEvents.push([type, data]); }
    function flushEvents() {
      const batch = pendingEvents;
      pendingEvents = [];
      for (let i = 0; i < batch.length; i++) {
        const [type, data] = batch[i];
        const cbs = listeners[type];
        if (cbs) for (let j = 0; j < cbs.length; j++) { try { cbs[j](data); } catch(e){} }
      }
    }

    function resetPhaseMarkerState() { /* no-op: realtime playback, no lookahead markers */ }

    function getScriptedPhase(t) {
      if (!Number.isFinite(t) || t < 0) t = 0;
      const tt = ((t % scriptedTotal) + scriptedTotal) % scriptedTotal;
      for (let i = activePhases.length - 1; i >= 0; i--) {
        if (tt >= activePhases[i].start) return activePhases[i];
      }
      return activePhases[0];
    }
    function getPhase(t) {
      if (phaseLoopId) {
        const fixed = activePhases.find(p => p.id === phaseLoopId);
        if (fixed) return fixed;
      }
      return getScriptedPhase(t);
    }
    function getPhaseProgress(ph, t) {
      const phaseDuration = Math.max(0.001, (ph.end ?? 0) - (ph.start ?? 0));
      if (phaseLoopId && phaseLoopId === ph.id) {
        const rel = (((t - ph.start) % phaseDuration) + phaseDuration) % phaseDuration;
        return Math.max(0, Math.min(1, rel / phaseDuration));
      }
      const tt = ((t % scriptedTotal) + scriptedTotal) % scriptedTotal;
      const p = (tt - ph.start) / phaseDuration;
      return Math.max(0, Math.min(1, p));
    }
    function elapsed() {
      if (!playing || !actx) return pausedAt;
      return Math.max(0, pausedAt + (actx.currentTime - startTime));
    }

    /** Transport position (seconds) at a scheduled audio time `when`. */
    function transportAt(when) {
      if (!playing || !actx) return pausedAt;
      return Math.max(0, pausedAt + (when - startTime));
    }


    // Layer → node name → scale factor (used by morphTo + per-layer analysers)
    const LAYER_MAP = {
      arp:           { node:'arpGain',           scale: 0.30 },
      thump:         { node:'thumpGain',         scale: 0.85 },
      piano:         { node:'pianoGain',         scale: 0.90 },
      pad:           { node:'padGain',           scale: 0.20 },
      bass:          { node:'bassGain',          scale: 0.08 },   // 2 sines through LPF → was 0.22, ÷2.75
      drone:         { node:'droneGain',         scale: 0.10 },   // arco support trio through filtered body gain
      voiceBass:     { node:'voiceBassGain',     scale: 0.22 },
      voiceBaritone: { node:'voiceBaritoneGain', scale: 0.19 },
      voiceTenor:    { node:'voiceTenorGain',    scale: 0.14 },
    };

    function initAudio() {
      if (actx) return;
      const scale = getScaleData();
      const N = scale.N;
      const ARP = scale.ARP;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      // Auto-restart scheduler when iOS resumes a suspended AudioContext
      actx.onstatechange = () => {
        if (actx.state === 'running' && playing) {
          const stale = (performance.now() - schedulerLastRunMs) > 500;
          if (stale) {
            if (schedulerIntervalId !== null) clearTimeout(schedulerIntervalId);
            nextTickAt = actx.currentTime;
            schedulerIntervalId = 0;
            schedulerLoop();
          }
        }
      };
      const master = actx.createGain(); master.gain.value = 0.42;

      // ── Dynamics compressor on master for glitch-free output ──
      // Prevents clipping transients and smooths any inter-layer peaks
      const masterComp = actx.createDynamicsCompressor();
      masterComp.threshold.value = -12;
      masterComp.knee.value = 12;
      masterComp.ratio.value = 4;
      masterComp.attack.value = 0.003;
      masterComp.release.value = 0.15;
      nd.masterComp = masterComp;

      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.72;

      // Signal chain: master → compressor → destination + analyser (zero-latency)
      master.connect(masterComp);
      masterComp.connect(actx.destination);
      masterComp.connect(analyser);

      // iOS background audio: pipe output through a MediaStream so an <audio>
      // element can keep the audio session alive when the page is backgrounded.
      if (typeof actx.createMediaStreamDestination === 'function') {
        streamDest = actx.createMediaStreamDestination();
        masterComp.connect(streamDest);
      }

      function o(type,freq,det=0) { const n=actx.createOscillator(); n.type=type; n.frequency.value=freq; if(det) n.detune.value=det; n.start(); return n; }
      function lpf(f,Q=0.7) { const n=actx.createBiquadFilter(); n.type='lowpass'; n.frequency.value=f; n.Q.value=Q; return n; }
      function hpf(f) { const n=actx.createBiquadFilter(); n.type='highpass'; n.frequency.value=f; return n; }
      function g(v) { const n=actx.createGain(); n.gain.value=v; return n; }

      // Melody layer — instrumental (LPF) or vocal (formant bandpass)
      const arpIsVocal = layerConfigs.arp.synthMode === 'vocal_melody';
      const arpG=g(0);
      let arpF;
      if (arpIsVocal) {
        // Parallel formant bandpass filters for vowel-like timbre
        const f1 = actx.createBiquadFilter(); f1.type='bandpass'; f1.frequency.value=700; f1.Q.value=5;
        const f2 = actx.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=1100; f2.Q.value=4;
        const fMix = g(1.0);
        arpG.connect(f1); arpG.connect(f2); f1.connect(fMix); f2.connect(fMix);
        fMix.connect(master);
        arpF = f1; // morphTo controls the primary formant center
        nd.arpFilt2 = f2;
      } else {
        arpF = lpf(420, 1.2);
        arpG.connect(arpF); arpF.connect(master);
      }
      const arpLfoHz = layerConfigs.arp.lfoHz || (arpIsVocal ? 2.5 : 4.8);
      const arpO=o('sawtooth',ARP[0]), arpO2=o('sawtooth',ARP[0]); arpO2.detune.value = arpIsVocal ? 8 : 14;
      // Vibrato with humanization gate — delays onset per note, scales with velocity
      const arpVib=o('sine',arpLfoHz), arpVibG=g(arpIsVocal ? 2.0 : 4.0);
      const arpVibGate = g(0); // gate node: tick() ramps this 0→1 per note
      arpVib.connect(arpVibG); arpVibG.connect(arpVibGate); arpVibGate.connect(arpO.frequency);
      arpO.connect(arpG); arpO2.connect(arpG);
      nd.arpGain=arpG; nd.arpFilt=arpF; nd.arpO=arpO; nd.arpO2=arpO2; nd.arpVibGate=arpVibGate;

      // Bow noise — bandpass-filtered white noise for rosin/friction texture on attacks
      const bowNoiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const bowData = bowNoiseBuf.getChannelData(0);
      for (let i = 0; i < bowData.length; i++) bowData[i] = Math.random() * 2 - 1;
      const bowSrc = actx.createBufferSource(); bowSrc.buffer = bowNoiseBuf; bowSrc.loop = true; bowSrc.start();
      const bowBP = actx.createBiquadFilter(); bowBP.type = 'bandpass'; bowBP.frequency.value = 2500; bowBP.Q.value = 1.5;
      const bowNoiseGain = g(0);
      bowSrc.connect(bowBP); bowBP.connect(bowNoiseGain); bowNoiseGain.connect(arpG);
      nd.bowNoiseGain = bowNoiseGain;

      // Bodhran stomp
      const thumpG=g(0); thumpG.connect(master); nd.thumpGain=thumpG;

      // Chord stabs (concertina chords)
      const pianoG=g(0); pianoG.connect(master); nd.pianoGain=pianoG;

      // Cello support pad — sustained bowed chord tones that follow the harmony
      const padG=g(0);
      padG.connect(master);
      const padHP = hpf(layerConfigs.pad.hpfHz || 90);
      const padLP = lpf(layerConfigs.pad.lpfHz || 720, 0.8);
      padHP.connect(padLP); padLP.connect(padG);
      nd.padVoices = [];
      const padVoiceGain = layerConfigs.pad.voiceGain || 0.12;
      const padVibDepth = layerConfigs.pad.vibratoDepth || 1.5;
      [
        { type:'triangle', detune:-4, gainMul:1.15, vibMul:0.7 },
        { type:'sawtooth', detune:3, gainMul:0.85, vibMul:0.45 },
        { type:'triangle', detune:0, gainMul:0.95, vibMul:0.58 },
      ].forEach((def) => {
        const ov=o(def.type, 146.83, def.detune);
        const vibHz = (layerConfigs.pad.vibratoHz || 3.6) * (0.9 + Math.random() * 0.2);
        const vib=o('sine',vibHz), vg=g(padVibDepth * def.vibMul); vib.connect(vg); vg.connect(ov.frequency);
        const gn=g(padVoiceGain * def.gainMul);
        ov.connect(gn); gn.connect(padHP);
        nd.padVoices.push({ osc: ov });
      });
      nd.padGain=padG;

      // Bass line
      const bassRootN = (presetDroneVoicings && presetDroneVoicings[0]?.root) || 'D2';
      const bassG=g(0); bassG.connect(master);
      // Triangle adds odd harmonics for warmth; second sine gives body via detuning
      const bO=o('triangle',N[bassRootN]||73.42), bO2=o('sine',N[bassRootN]||73.42); bO2.detune.value=layerConfigs.bass.detuneCents;
      const bL=lpf(layerConfigs.bass.lpfHz,0.7), bH=hpf(layerConfigs.bass.hpfHz);
      // Envelope gain for per-note pluck articulation (starts silent)
      const bassEnvG=actx.createGain(); bassEnvG.gain.value=0;
      bO.connect(bL); bO2.connect(bL); bL.connect(bH); bH.connect(bassEnvG); bassEnvG.connect(bassG);
      nd.bassGain=bassG; nd.bassO=bO; nd.bassO2=bO2; nd.bassEnvG=bassEnvG;

      // Arco support line
      const droneG=g(0); droneG.connect(master); nd.droneGain=droneG;
      const droneArticG=g(0); droneArticG.connect(droneG); nd.droneArticG=droneArticG;
      const drRootN = (presetDroneVoicings && presetDroneVoicings[0]?.root) || 'D2';
      const drFifthN = (presetDroneVoicings && presetDroneVoicings[0]?.fifth) || 'A2';
      const drO1=o('triangle',N[drRootN]||73.42);
      const drO2=o('sawtooth',N[drRootN]||73.42,-5);
      const drO3=o('sine',N[drFifthN]||110,4);
      const drHPF=hpf(layerConfigs.drone.hpfHz || 40);
      const drLPF=lpf(layerConfigs.drone.lpfHz || 240,0.8);
      const drSupportMix=g(layerConfigs.drone.supportMix || 0.55);
      const drVib=o('sine', layerConfigs.drone.vibratoHz || 2.1);
      const drVibG=g(layerConfigs.drone.vibratoDepth || 0.7);
      drVib.connect(drVibG); drVibG.connect(drO1.frequency); drVibG.connect(drO2.frequency);
      drHPF.connect(drLPF); drLPF.connect(droneArticG);
      drO1.connect(drHPF); drO2.connect(drHPF); drO3.connect(drSupportMix); drSupportMix.connect(drHPF);
      nd.drO1=drO1; nd.drO2=drO2; nd.drO3=drO3;

      // Crew chorus split into bass, baritone, and tenor parts
      const voiceBassG=g(0); voiceBassG.connect(master); nd.voiceBassGain=voiceBassG;
      const voiceBaritoneG=g(0); voiceBaritoneG.connect(master); nd.voiceBaritoneGain=voiceBaritoneG;
      const voiceTenorG=g(0); voiceTenorG.connect(master); nd.voiceTenorGain=voiceTenorG;

      // Per-layer analysers for live layer-activity visualization (parallel tap; does not affect mix)
      layerAnalysers = {};
      for (const [layerId, map] of Object.entries(LAYER_MAP)) {
        const gNode = nd[map.node];
        if (!gNode) continue;
        const a = actx.createAnalyser();
        a.fftSize = 1024;
        a.smoothingTimeConstant = 0.75;
        gNode.connect(a);
        layerAnalysers[layerId] = a;
      }

      nd.master=master;
      retuneContinuousVoices(actx.currentTime);
    }

    function phaseFilterFreq(id) {
      return phaseFilterHzMap[id] ?? 700;
    }

    /**
     * Smooth ramp to `val` via setTargetAtTime.
     * @param {AudioParam} param
     * @param {number} val   target value
     * @param {number} tau   time constant (seconds)
     * @param {number} [at]  scheduled audio time — defaults to actx.currentTime.
     *   IMPORTANT: when called from the lookahead scheduler (tick / morphTo),
     *   pass the tick's `when` so automation aligns with the audio clock instead
     *   of starting early at actx.currentTime and clobbering previously-queued events.
     *
     * HIGH-FIDELITY FIX: Instead of hard cancelScheduledValues + immediate set,
     * we read the current value first and start the ramp from there to prevent
     * discontinuities (clicks/pops).
     */
    function ramp(param, val, tau=0.8, at=undefined) {
      if (!param) return;
      const t = at ?? actx.currentTime;
      // Capture current computed value before canceling to prevent discontinuity
      const currentVal = param.value;
      param.cancelScheduledValues(t);
      param.setValueAtTime(currentVal, t);
      param.setTargetAtTime(val, t, tau);
    }
    function snap(param, val, at=undefined) {
      if (!param) return;
      const t = at ?? actx.currentTime;
      param.cancelScheduledValues(t);
      param.setValueAtTime(val, t);
    }
    function volumeToGain(v) {
      if (v <= 1) return v * 0.42;
      // Boost range rises faster so "more volume" is clearly audible.
      const boost = Math.min(1, v - 1);
      return 0.42 + boost * 0.50; // max 0.92 at v=2
    }

    function morphLayerTau(name) {
      if (name === 'pad') return 2.0;
      if (name === 'piano') return 1.4;
      if (name === 'bass') return 1.05;
      return 0.82;
    }
    // Fast taus for user-initiated seeks — layers snap in quickly
    function morphLayerTauFast(name) {
      if (name === 'pad')  return 0.20;
      return 0.10;
    }

    /**
     * Cross-fade all layer gains + filter to the target phase.
     * Newly-entering scheduled layers snap to level at the phase boundary so
     * their first hit arrives at full strength instead of fading in.
     * @param {object} ph   phase object
     * @param {number} [at] scheduled audio time (pass from tick's `when` in the
     *   lookahead scheduler; omit for immediate morphs like play).
     * @param {boolean} [fast] use fast taus for immediate user-initiated transitions
     */
    function morphTo(ph, at, fast=false, prevPhase=null) {
      const lv = ph.lv || {};
      const prevLv = prevPhase?.lv || {};
      ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(ph.id), fast ? 0.3 : 2.35, at);
      for (const [name, {node, scale}] of Object.entries(LAYER_MAP)) {
        const phaseVal = lv[name] ?? 0;
        const prevVal = prevLv[name] ?? 0;
        const mult = layerMult[name] ?? 1;
        const target = phaseVal * mult * scale;
        const prevTarget = prevVal * mult * scale;
        const tau = fast ? morphLayerTauFast(name) : morphLayerTau(name);
        if (!fast && prevTarget <= 0.0005 && target > 0.0005) {
          snap(nd[node]?.gain, target, at);
        } else {
          ramp(nd[node]?.gain, target, tau, at);
        }
      }
    }

    function retuneContinuousVoices(when) {
      if (!actx) return;
      const t = when ?? actx.currentTime;
      const { N } = getScaleData();
      const refChord = getSupportReferenceChord();
      if (refChord) {
        if (nd.padVoices?.length) setPadVoicing(refChord, t);
        if (nd.drO1 && nd.drO2 && nd.drO3) {
          const voicing = getDroneSupportVoicing(refChord);
          setDroneVoicing(voicing.main, voicing.support, t);
        }
      }
    }

    /**
     * Multi-layer physical drum synthesis — models a fist/bodhran strike:
     *
     *  Layer 1 — Knuckle impact: broadband noise burst (bandpass 200–800 Hz, ~10ms)
     *            The initial percussive crack of a fist hitting stretched skin.
     *
     *  Layer 2 — Skin slap:     high-freq noise burst (bandpass 1.5–4 kHz, ~4ms)
     *            The sharp, bright transient from the skin surface.
     *
     *  Layer 3 — Fundamental:   pitch-swept sine (120→55 Hz, faster decay)
     *            The main body tone of the drum head resonating.
     *
     *  Layer 4 — Second mode:   sine at ~1.6× fundamental, faster decay
     *            The drum head's second resonant mode; gives hollow character.
     *
     *  Layer 5 — Sub thud:      very low sine (35–50 Hz, fast decay)
     *            Chest-feel weight; the "boom" felt more than heard.
     *
     *  All layers are summed into a single pre-rendered buffer per sample rate.
     *  A seeded PRNG ensures the noise is deterministic (identical across plays).
     */
    /**
     * ══════════════════════════════════════════════════════════════════════
     *  FIST THUMP — Physical model of a clenched fist hitting a wooden
     *  barrel or table top.  Seven synthesis layers, mixed to emphasize
     *  what makes a fist hit sound different from a drum:
     *
     *  1. KNUCKLE CRACK  — Harsh, wide-band noise burst (300–1200 Hz)
     *     with near-zero attack. Louder and longer than a drum stick
     *     because bone-on-wood has more broadband energy than a padded
     *     beater on a skin head.
     *
     *  2. FLESH SLAP  — Mid-high noise (1.2–3.5 kHz), slightly delayed
     *     (~1 ms after the knuckle) because the fleshy palm lags behind
     *     the knuckles on impact. Gives the "meaty" quality.
     *
     *  3. WOOD RING  — Short, bright resonance (350–600 Hz) from the
     *     barrel/table surface vibrating. Asymmetric half-sine burst for
     *     the "clonk" quality that separates wood from skin.
     *
     *  4. FUNDAMENTAL THUD  — Low pitch-swept sine (110→48 Hz) that is
     *     the weight of the hit. Shorter pitch decay than a drum since
     *     wood damps faster than a drum head.
     *
     *  5. SECOND MODE  — Sine at 2.2× fundamental (wood has higher
     *     overtone ratios than circular drum membranes). Decays fast.
     *
     *  6. SUB WEIGHT  — Very low sine (30–45 Hz), extremely fast decay.
     *     The "felt in your chest" thud of a heavy fist landing.
     *
     *  7. FINGER RATTLE  — Tiny burst of very high noise (3–6 kHz,
     *     ~2ms) simulating fingers rattling on contact. Subtle but
     *     adds realism and differentiates from a palm slap.
     * ══════════════════════════════════════════════════════════════════════
     */
    function getThumpBufferBase() {
      const sr = actx.sampleRate;
      if (thumpBufferBase && thumpBufferSr === sr) return thumpBufferBase;
      const dur = layerConfigs.thump.durationSec;
      const len = Math.floor(sr * dur);
      const buf = actx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);

      // Seeded PRNG for deterministic noise (identical across plays)
      let seed = 48271;
      function rand() { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; }

      const cfg = layerConfigs.thump;
      const startHz  = cfg.startHz  || 110;
      const endHz    = cfg.endHz    || 48;
      const pDecay   = cfg.pitchDecay || 12;   // faster pitch drop than a drum
      const aDecay   = cfg.ampDecay   || 6;    // faster overall decay (wood damps)

      const fadeInN  = Math.floor(sr * 0.0003);  // 0.3ms — almost instant
      const fadeOutN = Math.floor(sr * 0.006);

      // ─── Layer 1: Knuckle crack (wide-band noise, 300–1200 Hz) ─────
      const knuckleLen = Math.floor(sr * 0.018);  // 18ms — longer than a drum hit
      const knuckle = new Float32Array(len);
      {
        const fc = 750 / sr;
        const q = 0.7;           // wide bandwidth
        const w0 = 2 * Math.PI * fc;
        let lp = 0, bp = 0, hp = 0;
        for (let i = 0; i < len; i++) {
          const inp = i < knuckleLen ? rand() : 0;
          hp = inp - lp - q * bp;
          bp += w0 * hp;
          lp += w0 * bp;
          const t = i / sr;
          const att = i < Math.floor(sr * 0.0004) ? i / Math.floor(sr * 0.0004) : 1;
          const env = Math.exp(-t * 85) * att;
          knuckle[i] = bp * env * 2.8;   // dominant layer — this IS the fist
        }
      }

      // ─── Layer 2: Flesh slap (1.2–3.5 kHz, 1ms delayed) ───────────
      const slapDelay = Math.floor(sr * 0.001);
      const slapLen = Math.floor(sr * 0.008);
      const fleshSlap = new Float32Array(len);
      {
        const fc = 2200 / sr;
        const q = 0.8;
        const w0 = 2 * Math.PI * fc;
        let lp = 0, bp = 0, hp = 0;
        for (let i = 0; i < len; i++) {
          const si = i - slapDelay;
          const inp = (si >= 0 && si < slapLen) ? rand() : 0;
          hp = inp - lp - q * bp;
          bp += w0 * hp;
          lp += w0 * bp;
          const t = Math.max(0, si) / sr;
          const att = (si >= 0 && si < Math.floor(sr * 0.0003)) ? si / Math.floor(sr * 0.0003) : 1;
          const env = si >= 0 ? Math.exp(-t * 200) * att : 0;
          fleshSlap[i] = bp * env * 1.4;
        }
      }

      // ─── Layer 3: Wood ring (asymmetric burst, 350–600 Hz) ─────────
      const woodRing = new Float32Array(len);
      {
        const ringHz = 480;
        const ringDecay = 55;     // fast — wood damps quickly
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          // Asymmetric half-sine impulse gives the "clonk"
          const phase = ringHz * t;
          const raw = Math.sin(2 * Math.PI * phase);
          // Rectify slightly — wood resonance is asymmetric
          const asym = raw > 0 ? raw : raw * 0.35;
          const env = Math.exp(-t * ringDecay);
          woodRing[i] = asym * env * 0.55;
        }
      }

      // ─── Layer 7: Finger rattle (3–6 kHz, 2ms, micro-delayed) ─────
      const rattleDelay = Math.floor(sr * 0.002);
      const rattleLen = Math.floor(sr * 0.003);
      const rattle = new Float32Array(len);
      {
        const fc = 4500 / sr;
        const q = 1.0;
        const w0 = 2 * Math.PI * fc;
        let lp = 0, bp = 0, hp = 0;
        for (let i = 0; i < len; i++) {
          const ri = i - rattleDelay;
          const inp = (ri >= 0 && ri < rattleLen) ? rand() * 0.6 : 0;
          hp = inp - lp - q * bp;
          bp += w0 * hp;
          lp += w0 * bp;
          const t = Math.max(0, ri) / sr;
          const env = ri >= 0 ? Math.exp(-t * 450) : 0;
          rattle[i] = bp * env * 0.35;
        }
      }

      // ─── Pitched layers (phase accumulators) ───────────────────────
      let phase1 = 0;  // fundamental
      let phase2 = 0;  // second mode
      let phase3 = 0;  // low mode

      for (let i = 0; i < d.length; i++) {
        const t = i / sr;

        // Layer 4 — Fundamental thud (pitch-swept sine, wood-fast decay)
        const f1 = startHz * Math.exp(-t * pDecay) + endHz;
        phase1 += f1 / sr;
        const fund = Math.sin(2 * Math.PI * phase1) * Math.exp(-t * aDecay) * 0.60;

        // Layer 5 — Second mode at 2.2× (wood overtone, not drum 1.6×)
        const f2 = f1 * 2.2;
        phase2 += f2 / sr;
        const mode2 = Math.sin(2 * Math.PI * phase2) * Math.exp(-t * (aDecay * 2.5)) * 0.22;

        // Layer 6 — Low weight (30–45 Hz, very fast decay)
        const lowHz = endHz * 0.65;
        phase3 += lowHz / sr;
        const lowMode = Math.sin(2 * Math.PI * phase3) * Math.exp(-t * (aDecay * 3.0)) * 0.40;

        // ── Sum all seven layers ──
        let sample = knuckle[i]
                   + fleshSlap[i]
                   + woodRing[i]
                   + rattle[i]
                   + fund
                   + mode2
                   + lowMode;

        // Anti-click fade envelope
        if (i < fadeInN) sample *= i / fadeInN;
        if (i > len - fadeOutN) sample *= (len - i) / fadeOutN;

        d[i] = sample;
      }

      // ── Normalize — keep transient punch, prevent clipping ──
      let peak = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
      if (peak > 0.01) {
        const scale = 0.92 / peak;
        for (let i = 0; i < d.length; i++) d[i] *= scale;
      }

      thumpBufferBase = buf;
      thumpBufferSr = sr;
      return buf;
    }

    function fireThump(when, vel = 1.0, layerThumpTarget = null) {
      const gRead = nd.thumpGain.gain.value;
      const tv = gRead * (layerMult.thump ?? 1);
      const gate = layerThumpTarget != null ? layerThumpTarget : tv;
      if (gate < 0.02) return;
      const buf = getThumpBufferBase();
      const src = actx.createBufferSource();
      src.buffer = buf;
      // Humanize: velocity jitter +-12%, pitch variation +-1.5%, micro-timing
      const velJitter = vel * (0.88 + Math.random() * 0.24);
      const tG = actx.createGain();
      tG.gain.value = ((tv * 0.58) / Math.max(0.001, gRead)) * velJitter;
      src.connect(tG);
      tG.connect(nd.thumpGain);
      // Slight pitch variation per hit — simulates inconsistent hand strikes
      src.playbackRate.value = 0.985 + Math.random() * 0.03;
      // Micro-timing jitter: +-3ms for human feel
      const timeJitter = (Math.random() - 0.5) * 0.006;
      src.start(Math.max(when + timeJitter, actx.currentTime));
    }

    function fireBass(when, freq, vel=1.0) {
      if (!nd.bassEnvG) return;
      const bassCfg = layerConfigs.bass || {};
      const accentPitchMul = bassCfg.attackPitchMul || 1.55;
      const accentGlideSec = bassCfg.attackGlideSec || 0.045;
      const accentDurSec = bassCfg.attackPulseSec || 0.14;
      const accentMix = bassCfg.attackPulseMix || 1.05;

      // Snap frequency immediately (2ms glide avoids click, sounds like a pluck not a slide)
      nd.bassO.frequency.cancelScheduledValues(when);
      nd.bassO.frequency.setTargetAtTime(freq, when, 0.002);
      nd.bassO2.frequency.cancelScheduledValues(when);
      nd.bassO2.frequency.setTargetAtTime(freq, when, 0.003);
      // Pluck envelope: sharp attack then string-like decay
      const env = nd.bassEnvG.gain;
      env.cancelScheduledValues(when);
      env.setValueAtTime(0, when);
      env.linearRampToValueAtTime(1.0 + Math.random() * 0.15, when + 0.010); // 10ms attack, slight velocity jitter
      env.setTargetAtTime(0.001, when + 0.012, 0.28 + Math.random() * 0.06); // decay ~280-340ms tau

      // Fold the old deck-pulse role into bass: a short pitched attack glide
      // on each root/fifth hit that reinforces the harmonic center.
      if (nd.bassGain) {
        const accentOsc = actx.createOscillator();
        accentOsc.type = 'sine';
        const accentGain = actx.createGain();
        const startFreq = Math.max(24, freq * accentPitchMul);
        const endFreq = Math.max(20, freq);
        const peakGain = Math.max(0.001, accentMix * vel);
        accentOsc.frequency.setValueAtTime(startFreq, when);
        accentOsc.frequency.exponentialRampToValueAtTime(endFreq, when + accentGlideSec);
        accentGain.gain.setValueAtTime(0.0001, when);
        accentGain.gain.exponentialRampToValueAtTime(peakGain, when + 0.006);
        accentGain.gain.exponentialRampToValueAtTime(0.0001, when + accentDurSec);
        accentOsc.connect(accentGain);
        accentGain.connect(nd.bassGain);
        accentOsc.start(when);
        accentOsc.stop(when + accentDurSec + 0.03);
      }
    }

    function getPianoPartialBuffer(f, ni, harm, amp, dec) {
      const sr = actx.sampleRate;
      const key = `${f.toFixed(3)}|${ni}|${harm}|${dec}|${sr}`;
      let buf = pianoPartialCache.get(key);
      if (buf) return buf;
      const dur = layerConfigs.piano.durationSec || 2.2;
      const len = Math.floor(sr * dur);
      buf = actx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      // Anti-click: smooth 4ms attack and 8ms fade-out at buffer end
      const fadeInSamples = Math.floor(sr * 0.004);
      const fadeOutSamples = Math.floor(sr * 0.008);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const att = i < fadeInSamples ? i / fadeInSamples : 1;
        const decay = Math.exp(-t * (3.5 + ni * 0.4) * dec);
        let fadeOut = 1.0;
        if (i > len - fadeOutSamples) fadeOut = (len - i) / fadeOutSamples;
        d[i] = Math.sin(2 * Math.PI * f * t) * att * decay * amp * 0.52 * fadeOut;
      }
      // LRU-style eviction: remove oldest 50 entries instead of clearing all
      if (pianoPartialCache.size > 400) {
        const keys = Array.from(pianoPartialCache.keys());
        for (let i = 0; i < 50 && i < keys.length; i++) {
          pianoPartialCache.delete(keys[i]);
        }
      }
      pianoPartialCache.set(key, buf);
      return buf;
    }

    function firePiano(when, chord, targetGain=null) {
      if (!chord) return;
      const pv = nd.pianoGain.gain.value * (layerMult.piano ?? 1);
      const gate = targetGain != null ? targetGain : pv;
      if (gate < 0.02) return;
      // Use the higher of current node value or target gain so chords are audible
      // even on the first tick of a phase (before the gain node has finished ramping).
      const effectiveLevel = Math.max(pv, gate) * CONCERTINA_GAIN_BOOST;
      const harmonicList = layerConfigs.piano.harmonics || [1, 2, 3];
      const harmonicDefs = harmonicList.map((h, idx) => {
        // Progressive amplitude and decay reduction for higher harmonics
        const amp = idx === 0 ? 1.0 : Math.pow(0.38, idx);
        const dec = idx === 0 ? 0.90 : 0.90 - idx * 0.22;
        return [h, amp, Math.max(0.12, dec)];
      });
      chord.notes.forEach((freq, ni) => {
        // Humanize: per-voice gain jitter (+-15%) and timing scatter
        const voiceGainJitter = 0.85 + Math.random() * 0.30;
        harmonicDefs.forEach(([harm, amp, dec]) => {
          const f = freq * harm;
          if (f > 8000) return;
          const buf = getPianoPartialBuffer(f, ni, harm, amp, dec);
          const src = actx.createBufferSource();
          src.buffer = buf;
          const nG = actx.createGain();
          nG.gain.value = effectiveLevel * 0.26 * voiceGainJitter;
          src.connect(nG);
          nG.connect(nd.pianoGain);
          // Humanize: jitter voice delay +-40% and add small random offset
          const voiceDelay = (layerConfigs.piano.voiceDelaySec || 0.004) * (0.6 + Math.random() * 0.8);
          // Slight pitch wobble: detune +-3 cents per voice for bellows imperfection
          src.detune.value = (Math.random() - 0.5) * 6;
          src.start(when + ni * voiceDelay + Math.random() * 0.006);
        });
      });
      emit('chord', chord.name);
    }

    function fireDroneSupport(when, chord, targetGain, leadFifth=false, accent=false) {
      if (!chord || !nd.droneArticG) return;
      if ((targetGain ?? 0) < 0.012) return;
      const voicing = getDroneSupportVoicing(chord, leadFifth);
      setDroneVoicing(voicing.main, voicing.support, when);
      const env = nd.droneArticG.gain;
      const current = env.value;
      const peak = accent ? 0.92 : 0.76;
      const sustain = accent ? 0.42 : 0.54;
      const tau = accent ? 0.26 : 0.78;
      env.cancelScheduledValues(when);
      env.setValueAtTime(current, when);
      env.linearRampToValueAtTime(peak, when + 0.05);
      env.setTargetAtTime(sustain, when + 0.05, tau);
    }
    const CREW_SYLLABLES = [
      // "HO" — round punchy call, strong downbeat
      { f1s:450,  f2s:850,  f3s:2100, f1e:430,  f2e:810,  f3e:2000, q1:12, q2:10, q3:7,  burst:0.09 },
      // "HAY" — bright diphthong EH→EE, classic shanty response
      { f1s:600,  f2s:1900, f3s:2700, f1e:320,  f2e:2300, f3e:3000, q1:11, q2:11, q3:8,  burst:0.08 },
      // "HAUL" — open AH settling into a rounder vowel
      { f1s:800,  f2s:1200, f3s:2500, f1e:650,  f2e:1050, f3e:2300, q1:12, q2:10, q3:8,  burst:0.07 },
      // "AWAY" — AH gliding toward EY
      { f1s:780,  f2s:1200, f3s:2500, f1e:480,  f2e:1800, f3e:2800, q1:11, q2:10, q3:7,  burst:0.05 },
      // "HEAVE" — EH gliding to EE
      { f1s:580,  f2s:1850, f3s:2700, f1e:300,  f2e:2350, f3e:3000, q1:12, q2:11, q3:8,  burst:0.08 },
      // "HMM" — nasal hum (closed mouth, softer phases)
      { f1s:260,  f2s:1000, f3s:2200, f1e:260,  f2e:1000, f3e:2200, q1:15, q2:11, q3:7,  burst:0.01 },
      // "OH" — round sustained call
      { f1s:500,  f2s:900,  f3s:2200, f1e:480,  f2e:870,  f3e:2100, q1:12, q2:10, q3:8,  burst:0.05 },
      // "HMM" again — hum on every other off-beat keeps it varied
      { f1s:260,  f2s:1000, f3s:2200, f1e:260,  f2e:1000, f3e:2200, q1:15, q2:11, q3:7,  burst:0.01 },
    ];

    function fireCrewPart(when, freq, targetGain, part, syllable) {
      const gainNode = nd[part.node];
      if (!gainNode || !freq) return;
      const nodeVal = gainNode.gain.value * (layerMult[part.id] ?? 1);
      const gate = targetGain != null ? targetGain : nodeVal;
      if (gate < 0.018) return;
      const vv = Math.max(nodeVal, gate);

      const vc = layerConfigs.voices;
      const dur = vc.releaseSec;
      const baseVibHz = vc.vibratoHz;
      const baseFormantShift = (vc.formantHz ?? 720) - 720;
      const partVoices = Math.max(1, Math.min(vc.voiceCount ?? 2, part.maxVoices ?? (vc.voiceCount ?? 2)));
      const detSpread = (vc.detuneSpread ?? 15) * part.detuneMul;
      const breathLvl = (vc.breathLevel ?? 0.035) * part.breathMul;

      for (let vi = 0; vi < partVoices; vi++) {
        const detCents = (vi - (partVoices - 1) * 0.5) * detSpread / Math.max(1, partVoices - 1) + (Math.random() - 0.5) * 6;
        const delay = part.noteIndex * 0.022 * (0.8 + Math.random() * 0.35) + vi * (0.02 / Math.max(1, partVoices - 1)) + Math.random() * 0.02;
        const startAt = when + delay;

        const osc = actx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = detCents;

        const drift = actx.createOscillator();
        const driftAmt = actx.createGain();
        drift.frequency.value = 0.22 + Math.random() * 0.4;
        driftAmt.gain.value = 3.2 + Math.random() * 2.2;
        drift.connect(driftAmt); driftAmt.connect(osc.detune);

        const vib = actx.createOscillator();
        const vibAmt = actx.createGain();
        vib.frequency.value = baseVibHz * part.vibratoMul + vi * 0.22 + (Math.random() - 0.5) * 0.5;
        vibAmt.gain.value = (3.0 + part.noteIndex * 0.7) * part.vibratoMul * (0.85 + Math.random() * 0.3);
        vib.connect(vibAmt); vibAmt.connect(osc.frequency);

        const hpPre = actx.createBiquadFilter();
        hpPre.type = 'highpass';
        hpPre.frequency.value = part.id === 'voiceBass' ? 85 : (part.id === 'voiceBaritone' ? 100 : 120);
        hpPre.Q.value = 0.7;
        osc.connect(hpPre);

        const formantShift = baseFormantShift + part.formantShift;
        const f1 = actx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.value = Math.max(180, syllable.f1s + formantShift + vi * 14 + (Math.random() - 0.5) * 22);
        f1.Q.value = syllable.q1;
        const f2 = actx.createBiquadFilter();
        f2.type = 'bandpass';
        f2.frequency.value = Math.max(500, syllable.f2s + formantShift + vi * 22 + (Math.random() - 0.5) * 40);
        f2.Q.value = syllable.q2;
        const f3 = actx.createBiquadFilter();
        f3.type = 'bandpass';
        f3.frequency.value = Math.max(1400, syllable.f3s + formantShift + vi * 30 + (Math.random() - 0.5) * 70);
        f3.Q.value = syllable.q3;
        f1.frequency.setTargetAtTime(Math.max(180, syllable.f1e + formantShift + vi * 14), startAt + 0.22, dur * 0.35);
        f2.frequency.setTargetAtTime(Math.max(500, syllable.f2e + formantShift + vi * 22), startAt + 0.22, dur * 0.35);
        f3.frequency.setTargetAtTime(Math.max(1400, syllable.f3e + formantShift + vi * 30), startAt + 0.22, dur * 0.35);

        const fSum = actx.createGain();
        fSum.gain.value = 1.0;
        hpPre.connect(f1); hpPre.connect(f2); hpPre.connect(f3);
        f1.connect(fSum); f2.connect(fSum); f3.connect(fSum);

        const env = actx.createGain();
        const peakJitter = 0.88 + Math.random() * 0.24;
        const peak = vv * part.gainMul * (0.19 - vi * (0.014 / Math.max(1, partVoices))) * peakJitter;
        const attackTime = (0.12 + part.noteIndex * 0.02) * (0.78 + Math.random() * 0.45);
        env.gain.setValueAtTime(0.0, startAt);
        env.gain.linearRampToValueAtTime(peak, startAt + attackTime);
        env.gain.setTargetAtTime(peak * 0.58, startAt + 0.42, dur * 0.36);
        env.gain.setTargetAtTime(0.001, startAt + dur * 0.55, dur * 0.3);

        fSum.connect(env); env.connect(gainNode);
        osc.start(startAt); vib.start(startAt); drift.start(startAt);
        const endAt = startAt + dur + 0.5;
        osc.stop(endAt); vib.stop(endAt); drift.stop(endAt);
      }

      const noiseDur = dur * 0.45;
      const noiseBuf = getBreathNoiseBuffer();
      const noiseSrc = actx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const maxOffset = Math.max(0, noiseBuf.duration - noiseDur - 0.2);
      const noiseOffset = Math.random() * maxOffset;
      const noiseBpf = actx.createBiquadFilter();
      noiseBpf.type = 'bandpass';
      noiseBpf.frequency.value = syllable.burst > 0.04 ? 2600 : 1500;
      noiseBpf.Q.value = syllable.burst > 0.04 ? 1.2 : 1.9;
      const noiseEnv = actx.createGain();
      const burstPeak = vv * breathLvl * (syllable.burst / 0.035);
      const burstDecay = syllable.burst > 0.04 ? 0.06 : 0.22;
      noiseEnv.gain.setValueAtTime(0, when);
      noiseEnv.gain.linearRampToValueAtTime(burstPeak, when + 0.015);
      noiseEnv.gain.setTargetAtTime(0.001, when + 0.015, burstDecay);
      noiseSrc.connect(noiseBpf); noiseBpf.connect(noiseEnv); noiseEnv.connect(gainNode);
      noiseSrc.start(when, noiseOffset, noiseDur + 0.1);
    }

    function fireCrewVoices(when, chord, partTargets) {
      if (!chord) return;
      const active = CREW_PARTS.some((part) => (partTargets?.[part.id] ?? 0) > 0.018);
      if (!active) return;
      const syllable = CREW_SYLLABLES[crewSyllableIdx % CREW_SYLLABLES.length];
      crewSyllableIdx++;
      const voicing = getCrewVoicing(chord);
      CREW_PARTS.forEach((part) => {
        fireCrewPart(when, voicing[part.id], partTargets?.[part.id] ?? null, part, syllable);
      });
    }

    const SCHEDULER_INTERVAL_MS = 25;
    // 2s lookahead keeps ~2s of audio pre-scheduled, surviving iOS background
    // timer throttling (timers drop to ~1s intervals or pause entirely).
    const SCHEDULER_LOOKAHEAD_SEC = 2.0;
    const SCHEDULER_MAX_TICKS_PER_WAKE = 512;
    /** Wall-clock ms timestamp of last scheduler tick — used to detect dead timers. */
    let schedulerLastRunMs = 0;

    function schedulerLoop() {
      if (!playing || !actx) return;
      schedulerLastRunMs = performance.now();
      const now = actx.currentTime;
      // If the scheduler fell behind (e.g. iOS backgrounded the tab and
      // throttled timers), snap forward instead of trying to catch up —
      // otherwise hundreds of notes fire at once causing a glitch burst.
      if (nextTickAt < now - 0.2) {
        nextTickAt = now;
      }
      const until = now + SCHEDULER_LOOKAHEAD_SEC;
      let n = 0;
      while (nextTickAt < until && playing && n < SCHEDULER_MAX_TICKS_PER_WAKE) {
        tick(nextTickAt);
        nextTickAt += s16();
        n++;
      }
      // Flush queued events AFTER the tight scheduling loop so UI callbacks
      // never block audio node scheduling.
      flushEvents();
      if (playing && schedulerIntervalId !== null) {
        schedulerIntervalId = setTimeout(schedulerLoop, SCHEDULER_INTERVAL_MS);
      }
    }

    function tick(whenIn) {
      if (!actx || !playing) return;
      const when = Math.max(whenIn, actx.currentTime);
      bpm = bpmTarget;
      const el = transportAt(when);
      const ph = getPhase(el);
      const lv = ph.lv || {};
      const { ARP, phaseARP, CHORDS } = getScaleData();
      const phArp = phaseARP[ph.id] || ARP;
      const idx = step % phArp.length;
      const barIdx = step % 16; // bar position for thump/chord triggers (independent of arp length)
      const arpRotate = ph.randomMod?.arpRotate ?? 0;

      if (ph !== currentPhase) {
        const prevPhase = currentPhase;
        const isWrapBack = currentPhase
          && ph.start < currentPhase.start;
        if (isWrapBack) resetSequencerCounters();
        currentPhase = ph;
        morphTo(ph, when, false, prevPhase);
        emit('phase', { id: ph.id, label: ph.label });
      }

      emit('beat', {
        step: barIdx,
        phase: ph.id,
        phaseLabel: ph.label,
        phaseProgress: getPhaseProgress(ph, el),
        phaseStart: ph.start,
        phaseEnd: ph.end,
      });

      // Cello retrigger — humanized envelope with portamento and bow noise
      const freq=phArp[(idx + arpRotate) % phArp.length], vel=VEL[barIdx % VEL.length], av=(lv.arp||0)*(layerMult.arp??1);
      // Hold marker (freq===0): sustain previous note, skip re-trigger
      if (freq > 0) {
      // Humanize: jitter velocity +-10%, attack +-30%, decay +-15%
      const hVel = vel * (0.9 + Math.random() * 0.2);
      const arpAttack = (layerConfigs.arp.attackSec || 0.015) * (0.7 + Math.random() * 0.6);
      const arpDecayTau = s16() * (layerConfigs.arp.decayTauMul || 0.85) * (0.85 + Math.random() * 0.3);
      // Portamento — glide into pitch instead of snapping
      const portamento = layerConfigs.arp.portamentoSec || 0.025;
      nd.arpO.frequency.setTargetAtTime(freq, when, portamento);
      nd.arpO2.frequency.setTargetAtTime(freq, when, portamento);
      // Pitch micro-drift: +-2.5 cents for imperfect folk intonation
      const intonationDrift = (Math.random() - 0.5) * 5;
      nd.arpO.detune.setTargetAtTime(intonationDrift, when, 0.02);
      // Dynamic detune between oscillators: 10-18 cents
      nd.arpO2.detune.setTargetAtTime(10 + Math.random() * 8 + intonationDrift, when, 0.05);
      // HIGH-FIDELITY: Capture current arp gain to prevent discontinuity
      const curArpGain = nd.arpGain.gain.value;
      nd.arpGain.gain.cancelScheduledValues(when);
      // Ramp down from current value over 1ms before the new note attack
      nd.arpGain.gain.setValueAtTime(curArpGain, when);
      nd.arpGain.gain.linearRampToValueAtTime(0, when + 0.001);
      nd.arpGain.gain.linearRampToValueAtTime(av*hVel*0.30, when + 0.001 + arpAttack);
      nd.arpGain.gain.setTargetAtTime(av*hVel*0.08, when + 0.001 + arpAttack, arpDecayTau);
      // Bow noise burst — filtered noise on note attack for rosin texture
      if (nd.bowNoiseGain) {
        const bowMix = layerConfigs.arp.bowNoiseMix || 0.10;
        nd.bowNoiseGain.gain.cancelScheduledValues(when);
        nd.bowNoiseGain.gain.setValueAtTime(0, when);
        nd.bowNoiseGain.gain.linearRampToValueAtTime(av*hVel*bowMix, when + 0.002);
        nd.bowNoiseGain.gain.setTargetAtTime(0, when + 0.002, s16() * 0.3);
      }
      // Vibrato humanization — delayed onset, velocity-scaled depth
      if (nd.arpVibGate) {
        nd.arpVibGate.gain.cancelScheduledValues(when);
        nd.arpVibGate.gain.setValueAtTime(0, when);
        const vibDelay = 0.08 + Math.random() * 0.07;
        const vibDepth = 0.6 + hVel * 0.4;
        nd.arpVibGate.gain.linearRampToValueAtTime(vibDepth, when + vibDelay);
      }
      } // end hold marker check

      if (barIdx===0 || barIdx===8) {
        const targetThump = (lv.thump ?? 0) * (layerMult.thump ?? 1) * LAYER_MAP.thump.scale;
        fireThump(when, barIdx===0 ? 1.0 : 0.82, targetThump);

        if (barIdx===0) {
          const seq = ph.chordSeq;
          // Always resolve the chord — voices, bass, and other layers depend on it
          if (seq) {
            lastPlayedChord = CHORDS[seq[pianoBarCount % seq.length]];
            // Beat 1: bass plays chord root
            if (lastPlayedChord) {
              fireBass(when, getBassLineVoicing(lastPlayedChord).root, 0.9);
            }
          }
          const targetPiano = (lv.piano||0)*(layerMult.piano??1)*LAYER_MAP.piano.scale;
          if (lastPlayedChord && targetPiano > 0.02) {
            firePiano(when, lastPlayedChord, targetPiano);
          }
          const targetPad = (lv.pad||0)*(layerMult.pad??1);
          if (lastPlayedChord && targetPad > 0.02) {
            setPadVoicing(lastPlayedChord, when);
          }
          pianoBarCount++;
        } else if (barIdx===8 && lastPlayedChord) {
          // Beat 3: bass walks to a fitted fifth in the same low register.
          fireBass(when, getBassLineVoicing(lastPlayedChord).fifth, 0.82);
        }

        const targetDrone = (lv.drone||0)*(layerMult.drone??1)*LAYER_MAP.drone.scale;
        if (lastPlayedChord && targetDrone > 0.012) {
          fireDroneSupport(when, lastPlayedChord, targetDrone, barIdx===8, ph.droneMode || barIdx===8);
        } else if (nd.droneArticG) {
          ramp(nd.droneArticG.gain, 0, 0.18, when);
        }

      }

      // Crew chorus on configured trigger steps (call-and-response rhythm)
      const voiceTriggers = layerConfigs.voices.triggerSteps || [0, 8];
      if (voiceTriggers.includes(barIdx)) {
        const crewTargets = {
          voiceBass: (lv.voiceBass || 0) * (layerMult.voiceBass ?? 1) * LAYER_MAP.voiceBass.scale,
          voiceBaritone: (lv.voiceBaritone || 0) * (layerMult.voiceBaritone ?? 1) * LAYER_MAP.voiceBaritone.scale,
          voiceTenor: (lv.voiceTenor || 0) * (layerMult.voiceTenor ?? 1) * LAYER_MAP.voiceTenor.scale,
        };
        if (lastPlayedChord && Object.values(crewTargets).some((value) => value > 0.018)) {
          fireCrewVoices(when, lastPlayedChord, crewTargets);
        }
      }

      step++;
    }

    function beginPlayback() {
      if (!actx) return;
      if (playing) return;
      if (schedulerIntervalId !== null) {
        clearTimeout(schedulerIntervalId);
        schedulerIntervalId = null;
      }

      playing = true;
      startTime = actx.currentTime;
      resetSequencerCounters();
      nextTickAt = startTime + 0.01;
      currentPhase = null;
      resetPhaseMarkerState();
      morphTo(getPhase(pausedAt));
      schedulerIntervalId = 0;
      schedulerLoop();
    }

    function applyPresetInternal(preset) {
      if (!preset || preset.schemaVersion !== 1) return false;
      preset = normalizePresetDynamics(preset);
      KEY_OFFSETS = { ...DEFAULT_PRESET.keyOffsets, ...preset.keyOffsets };
      BASE_N = { ...DEFAULT_PRESET.baseNotesHz, ...preset.baseNotesHz };
      VEL = preset.velocities.slice();
      arpPattern = preset.arpPattern.slice();
      phaseFilterHzMap = { ...DEFAULT_PRESET.phaseFilterHz, ...(preset.phaseFilterHz || {}) };
      presetChordVoicings = preset.chordVoicings || null;
      presetDroneVoicings = preset.droneVoicings || null;
      layerConfigs = deepMerge(deepMerge({}, DEFAULT_PRESET.layerConfigs), preset.layerConfigs);
      if (preset.layerMix) {
        for (const [k, v] of Object.entries(preset.layerMix)) {
          if (LAYER_MAP[k]) LAYER_MAP[k].scale = v;
        }
      }
      const d = preset.defaults || {};
      bpmTarget = d.bpm ?? DEFAULT_PRESET.defaults.bpm;
      // Convert durationBeats (quarter-note beats) → seconds using the preset BPM
      // so phase boundaries align with actual musical bars regardless of tempo.
      lastPresetPhases = preset.phases;
      PHASES = timelinePhasesFromPreset(preset.phases, bpmTarget);
      if (!playing) bpm = bpmTarget;
      keyId = d.key ?? DEFAULT_PRESET.defaults.key;
      lastPresetMeta = { id: preset.id || '', name: preset.name || '' };
      disabledPhaseIds.clear();
      rebuildPhaseSchedule();
      invalidateScaleCache();
      invalidateAudioBuffers();
      resetSequencerCounters();
      clampPausedTime();
      return true;
    }

    applyPresetInternal(options?.preset ?? DEFAULT_PRESET);

    // ── Public API ──────────────────────────────────────────────────────────

    return {
      play() {
        if (playing) return;
        initAudio();
        // Restore master gain (zeroed on stop) before resuming context
        // so morphTo ramps layers up from silence correctly.
        if (nd.master?.gain) {
          nd.master.gain.setValueAtTime(volumeToGain(volumeSetting), actx.currentTime);
        }
        actx.resume().then(() => {
          beginPlayback();
        });
      },

      stop() {
        pausedAt = elapsed();
        playing = false;
        resetPhaseMarkerState();
        if (schedulerIntervalId !== null) {
          clearTimeout(schedulerIntervalId);
          schedulerIntervalId = null;
        }
        if (actx) {
          // Zero all layer gains immediately so resuming the context later
          // doesn't produce a burst of sound from frozen oscillators.
          const t = actx.currentTime;
          for (const { node } of Object.values(LAYER_MAP)) {
            const g = nd[node];
            if (g?.gain) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); }
          }
          if (nd.master?.gain) { nd.master.gain.cancelScheduledValues(t); nd.master.gain.setValueAtTime(0, t); }
          actx.suspend();
        }
      },

      /** Replace song data from a preset object (schema v1).
       *  Hard-resets the audio context to flush all in-flight scheduled nodes.
       *  Playback will NOT restart — caller must explicitly call play(). */
      applyPreset(preset) {
        // ── 1. Kill playback immediately
        playing = false;
        resetPhaseMarkerState();
        if (schedulerIntervalId !== null) {
          clearTimeout(schedulerIntervalId);
          schedulerIntervalId = null;
        }

        // ── 2. Destroy the old AudioContext to flush every scheduled node
        if (actx) {
          try { actx.close(); } catch (_) {}
          actx = null;
          nd = {};
          analyser = null;
          layerAnalysers = {};
          streamDest = null;
        }

        // ── 3. Apply the new preset data (caches, phases, scale, etc.)
        pausedAt = 0;
        if (!applyPresetInternal(preset)) return false;

        // Audio graph will be rebuilt on next play() via initAudio()
        return true;
      },

      /** Metadata for the last-applied preset (id + name). */
      getPreset() {
        return { ...lastPresetMeta };
      },

      setVolume(v) {
        volumeSetting = Math.max(0, Math.min(2, v));
        if (nd.master && actx) {
          nd.master.gain.cancelScheduledValues(actx.currentTime);
          nd.master.gain.setValueAtTime(volumeToGain(volumeSetting), actx.currentTime);
        }
      },

      // name: 'arp'|'thump'|'piano'|'pad'|'bass'|'drone'|'voiceBass'|'voiceBaritone'|'voiceTenor'
      // value: 0–2 multiplier on top of the phase's base level (UI allows up to 200%)
      setLayer(name, value) {
        value = Math.max(0, Math.min(2, value));
        layerMult[name] = value;
        if (!actx || !nd.master) return; // will be applied on next morphTo if not yet initialised
        const map = LAYER_MAP[name];
        if (!map) return;
        const ph = currentPhase || getPhase(elapsed());
        const baseVal = ph?.lv?.[name] ?? 0;
        snap(nd[map.node]?.gain, baseVal * value * map.scale);
      },

      setKey(nextKeyId) {
        if (!(nextKeyId in KEY_OFFSETS)) return;
        keyId = nextKeyId;
        invalidateScaleCache();
        invalidateAudioBuffers();
        if (actx) retuneContinuousVoices(actx.currentTime);
      },

      setPhaseLoop(id) {
        if (id === null) { phaseLoopId = null; return; }
        if (activePhases.some(p => p.id === id)) {
          phaseLoopId = id;
        }
      },

      setBPM(newBpm) {
        const prev = bpmTarget;
        bpmTarget = Math.max(40, Math.min(200, newBpm));
        bpm = bpmTarget;
        // Rebuild phase schedule so durations stay aligned with bars at new tempo
        if (prev !== bpmTarget && lastPresetPhases) {
          PHASES = timelinePhasesFromPreset(lastPresetPhases, bpmTarget);
          rebuildPhaseSchedule();
        }
      },

      setArpFilter(hz) {
        arpFilterOverride = hz === null ? null : Math.max(200, Math.min(6000, hz));
        if (nd.arpFilt) ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(currentPhase?.id), 0.3);
      },

      /** MediaStream from the audio graph — attach to an <audio> element for iOS background playback. */
      getMediaStream() { return streamDest?.stream || null; },

      getAnalyser() { return analyser; },

      getLayerAnalysers() { return { ...layerAnalysers }; },

      /** Call after visibility returns (mobile unlock) so Web Audio can resume.
       *  Also restarts the scheduler if iOS killed the setTimeout chain. */
      resumeAudioContext() {
        const p = (actx && actx.state === 'suspended') ? actx.resume() : Promise.resolve();
        return p.then(() => {
          // If still playing but the scheduler died (iOS killed the timeout),
          // restart it so audio continues from the current position.
          // Detect a dead scheduler by checking if it hasn't run in >500ms.
          const stale = (performance.now() - schedulerLastRunMs) > 500;
          if (playing && actx && stale) {
            if (schedulerIntervalId !== null) {
              clearTimeout(schedulerIntervalId);
            }
            nextTickAt = actx.currentTime;
            schedulerIntervalId = 0;
            schedulerLoop();
          }
        });
      },

      getState() {
        const ph = currentPhase || (activePhases[0]);
        return {
          playing,
          transportActive: playing,
          elapsedSec: elapsed(),
          phase: ph?.id,
          phaseLabel: ph?.label,
          chordSeq: ph?.chordSeq ?? null,
          key: keyId,
          phaseLoopId,
          bpm,
          volume: volumeSetting,
          layers: { ...layerMult },
          phaseLevels: ph?.lv ?? {},
        };
      },

      /** Next phase's `lv` map (wraps around at end of scripted timeline). */
      getNextPhaseLevels() {
        const ph = currentPhase || activePhases[0];
        if (!ph) return {};
        const idx = activePhases.findIndex(p => p.id === ph.id);
        if (idx < 0) return {};
        const nextPh = activePhases[(idx + 1) % activePhases.length];
        return { ...(nextPh.lv || {}) };
      },

      getKeys() { return Object.keys(KEY_OFFSETS).map(id => ({ id, label: id })); },
      /** Available chord names for the active preset (e.g. ['Gm','Eb','Cm','Bb'] or custom). */
      getChordNames() {
        if (presetChordVoicings) return Object.keys(presetChordVoicings);
        return ['Gm', 'Eb', 'Cm', 'Bb'];
      },
      getLayerConfigs() { return { ...layerConfigs }; },

      on(event, cb) { if (listeners[event]) listeners[event].push(cb); },
      off(event, cb) { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb); },
    };
  }

  return { create };
})();

// CommonJS / ES module shim
if (typeof module !== 'undefined') module.exports = ProceduralMusic;
