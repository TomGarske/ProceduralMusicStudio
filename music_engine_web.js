// music_engine_web.js
// Procedural Music Studio — Sea Shanty Web Audio engine
// Browser-only procedural music engine for sea shanty synthesis.
// Drop into any HTML page.
//
// Public API:
//   const engine = ProceduralMusic.create({ preset }); // preset optional — defaults to bundled JSON
//   engine.play()
//   engine.stop()
//   engine.seekToPhase(id)          // active scripted phase id
//   engine.removePhase(id)          // remove from loop (≥1 phase must remain); timeline recompressed
//   engine.restorePhase(id)         // bring back a removed phase
//   engine.getRemovedPhaseIds()     // [{ id, label }, ...]
//   engine.getNextPhaseLevels()     // next phase lv map
//   engine.setVolume(0-2)            // 1.0 = unity, >1 = boost
//   engine.setLayer(name, 0-1)      // layer name from LAYER_IDS
//   engine.setBPM(bpm)              // 40-160, default 76 (sea shanty pace)
//   engine.setReverb(0-0.80)        // wet amount, default per preset
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
  const DEFAULT_PRESET = JSON.parse("{\"schemaVersion\":1,\"id\":\"drunken-sailor\",\"name\":\"Drunken Sailor\",\"description\":\"Traditional sea shanty in D minor. Bodhran stomps, concertina drone, crew chorus in call-and-response. Public domain folk song.\",\"defaults\":{\"bpm\":76,\"key\":\"Dm\",\"reverb\":0.22},\"keyOffsets\":{\"Dm\":0,\"Em\":2,\"Fm\":3,\"Gm\":5,\"Am\":7,\"Bbm\":8,\"Cm\":10},\"baseNotesHz\":{\"A1\":55,\"D2\":73.42,\"E2\":82.41,\"A2\":110,\"Bb2\":116.54,\"C3\":130.81,\"D3\":146.83,\"E3\":164.81,\"F3\":174.61,\"G3\":196,\"A3\":220,\"Bb3\":233.08,\"C4\":261.63,\"D4\":293.66,\"E4\":329.63,\"F4\":349.23,\"G4\":392,\"A4\":440},\"chordVoicings\":{\"Dm\":{\"label\":\"Dm\",\"notes\":[\"D3\",\"A3\",\"D4\",\"F4\"]},\"C\":{\"label\":\"C\",\"notes\":[\"C3\",\"G3\",\"C4\",\"E4\"]},\"Am\":{\"label\":\"Am\",\"notes\":[\"A2\",\"E3\",\"A3\",\"C4\"]},\"F\":{\"label\":\"F\",\"notes\":[\"F3\",\"A3\",\"C4\",\"F4\"]},\"Gm\":{\"label\":\"Gm\",\"notes\":[\"G3\",\"D4\",\"G4\"]},\"Bb\":{\"label\":\"Bb\",\"notes\":[\"Bb3\",\"D4\",\"F4\"]}},\"droneVoicings\":[{\"root\":\"D2\",\"fifth\":\"A2\"},{\"root\":\"C3\",\"fifth\":\"G3\"}],\"velocities\":[0.92,0.28,0.52,0.24,0.88,0.3,0.48,0.22,0.85,0.26,0.5,0.22,0.82,0.28,0.46,0.2],\"layerIds\":[\"arp\",\"echo\",\"thump\",\"piano\",\"sub\",\"pad\",\"bass\",\"shim\",\"drone\",\"beatpulse\",\"voices\"],\"layerMix\":{\"arp\":0.28,\"echo\":0.1,\"thump\":0.8,\"piano\":0.65,\"sub\":0.15,\"pad\":0.2,\"bass\":0.3,\"shim\":0.12,\"drone\":0.32,\"beatpulse\":0.45,\"voices\":0.55},\"layerConfigs\":{\"arp\":{\"stepsPerBar\":16,\"lfoHz\":4.8,\"attackSec\":0.015,\"decayTauMul\":0.85,\"gainScale\":0.28},\"echo\":{\"leftDelaySteps\":4,\"rightDelaySteps\":6,\"gainScale\":0.10},\"thump\":{\"durationSec\":0.55,\"startHz\":100,\"endHz\":42,\"pitchDecay\":5,\"ampDecay\":4,\"gainScale\":0.80},\"piano\":{\"harmonics\":[1,2,3],\"durationSec\":2,\"voiceDelaySec\":0.008,\"gainScale\":0.65},\"sub\":{\"rootNote\":\"D2\",\"overtoneNote\":\"A2\",\"overtoneMix\":0.3,\"gainScale\":0.15},\"pad\":{\"vibratoHz\":4,\"vibratoDepth\":1.5,\"lpfHz\":480,\"voiceGain\":0.12,\"gainScale\":0.2},\"bass\":{\"lpfHz\":300,\"hpfHz\":38,\"detuneCents\":-8,\"gainScale\":0.3},\"shim\":{\"triggerSteps\":[0,8],\"durationSec\":0.12,\"octaveMul\":1,\"gainScale\":0.12},\"drone\":{\"holdBeats\":16,\"pulseBeats\":16,\"lpfHz\":220,\"gainScale\":0.32},\"beatpulse\":{\"durationSec\":0.45,\"pitchGlide\":2,\"ampDecay\":4.5,\"gainScale\":0.45},\"voices\":{\"releaseSec\":2.8,\"vibratoHz\":3.8,\"formantHz\":720,\"triggerSteps\":[0,8],\"gainScale\":0.55}},\"arpPattern\":[\"D3\",\"D3\",\"F3\",\"G3\",\"A3\",\"A3\",\"G3\",\"F3\",\"D3\",\"F3\",\"A3\",\"D4\",\"A3\",\"G3\",\"F3\",\"D3\"],\"phaseFilterHz\":{\"shanty_call\":480,\"shanty_response\":620,\"full_crew\":780,\"heave_ho\":980,\"calm_sea\":400,\"all_hands\":1100,\"port\":360},\"phases\":[{\"id\":\"shanty_call\",\"label\":\"Shanty Call\",\"durationBeats\":32,\"chordSeq\":[\"Dm\",\"Dm\"],\"droneMode\":false,\"lv\":{\"arp\":0.55,\"echo\":0,\"thump\":0.5,\"piano\":0,\"sub\":0.18,\"pad\":0,\"bass\":0.28,\"shim\":0,\"drone\":0,\"beatpulse\":0.35,\"voices\":0}},{\"id\":\"shanty_response\",\"label\":\"Crew Response\",\"durationBeats\":32,\"chordSeq\":[\"Dm\",\"C\"],\"droneMode\":false,\"lv\":{\"arp\":0.5,\"echo\":0.12,\"thump\":0.6,\"piano\":0.42,\"sub\":0.25,\"pad\":0,\"bass\":0.38,\"shim\":0,\"drone\":0,\"beatpulse\":0.45,\"voices\":0.38}},{\"id\":\"full_crew\",\"label\":\"Full Crew\",\"durationBeats\":48,\"chordSeq\":[\"Dm\",\"C\",\"Dm\",\"Am\"],\"droneMode\":false,\"lv\":{\"arp\":0.45,\"echo\":0.18,\"thump\":0.68,\"piano\":0.5,\"sub\":0.32,\"pad\":0.28,\"bass\":0.48,\"shim\":0.08,\"drone\":0,\"beatpulse\":0.52,\"voices\":0.52}},{\"id\":\"heave_ho\",\"label\":\"Heave Ho!\",\"durationBeats\":48,\"chordSeq\":[\"Dm\",\"C\",\"F\",\"C\"],\"droneMode\":true,\"lv\":{\"arp\":0.4,\"echo\":0.25,\"thump\":0.82,\"piano\":0.58,\"sub\":0.4,\"pad\":0.4,\"bass\":0.55,\"shim\":0.15,\"drone\":0.62,\"beatpulse\":0.68,\"voices\":0.68}},{\"id\":\"calm_sea\",\"label\":\"Calm Sea\",\"durationBeats\":32,\"chordSeq\":[\"Dm\",\"Am\"],\"droneMode\":false,\"lv\":{\"arp\":0.48,\"echo\":0.06,\"thump\":0.38,\"piano\":0.28,\"sub\":0.15,\"pad\":0.1,\"bass\":0.22,\"shim\":0,\"drone\":0,\"beatpulse\":0.28,\"voices\":0.18}},{\"id\":\"all_hands\",\"label\":\"All Hands!\",\"durationBeats\":48,\"chordSeq\":[\"Dm\",\"C\",\"Bb\",\"C\"],\"droneMode\":true,\"lv\":{\"arp\":0.42,\"echo\":0.3,\"thump\":0.88,\"piano\":0.65,\"sub\":0.45,\"pad\":0.45,\"bass\":0.6,\"shim\":0.2,\"drone\":0.7,\"beatpulse\":0.75,\"voices\":0.75}},{\"id\":\"port\",\"label\":\"Into Port\",\"durationBeats\":32,\"chordSeq\":[\"Dm\",\"C\"],\"droneMode\":false,\"lv\":{\"arp\":0.38,\"echo\":0.08,\"thump\":0.32,\"piano\":0.22,\"sub\":0.1,\"pad\":0.06,\"bass\":0.16,\"shim\":0,\"drone\":0,\"beatpulse\":0.18,\"voices\":0.1}}]}");

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

  function timelinePhasesFromPreset(phases) {
    let start = 0;
    return phases.map(p => {
      const dur = p.durationBeats != null ? p.durationBeats : (p.end - p.start);
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
      start = end;
      return next;
    });
  }

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
      const ARP = arpPattern.map(name => {
        const hz = N[name];
        if (hz == null) throw new Error(`arpPattern: unknown note key "${name}"`);
        return hz;
      });

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

      // ── Drone chords: use preset-defined voicings if available, else hardcoded defaults
      let droneChords;
      if (presetDroneVoicings) {
        droneChords = presetDroneVoicings.map(dv => ({
          r: N[dv.root] ?? N.G1 ?? tn('G1'),
          f: N[dv.fifth] ?? N.D2 ?? tn('D2'),
        }));
      } else {
        droneChords = [{r:N.G1,f:N.D2},{r:N.Bb2*0.5,f:N.F3*0.5}];
      }

      return { N, ARP, CHORDS, droneChords };
    }

    let cachedScaleData = null;
    function getScaleData() {
      if (!cachedScaleData) cachedScaleData = buildScaleData();
      return cachedScaleData;
    }
    function invalidateScaleCache() {
      cachedScaleData = null;
    }

    const pianoPartialCache = new Map();
    const dronePulseCache = new Map();
    let thumpBufferBase = null;
    let thumpBufferSr = 0;
    let shimmerBuffer = null;
    let shimmerCacheKey = '';

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
      dronePulseCache.clear();
      thumpBufferBase = null;
      thumpBufferSr = 0;
      shimmerBuffer = null;
      shimmerCacheKey = '';
      breathNoiseBuffer = null;
      breathNoiseSr = 0;
    }

    let PHASES = [];

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
    let reverbWet = DEFAULT_PRESET.defaults.reverb;
    let arpFilterOverride = null; // null = auto per phase
    let volumeSetting = 1.0;

    let actx=null, nd={}, startTime=0, pausedAt=0, playing=false, streamDest=null;
    let step=0, pianoBarCount=0, currentPhase=null;
    /** Pending seek target set before actx.resume() completes (play+seek race). */
    let pendingSeekPhaseId = null;
    /** Next 16th-note event time (AudioContext), used by lookahead scheduler. */
    let nextTickAt = 0;
    let schedulerIntervalId = null;
    let droneState = { mode: 'hold', beatsLeft: 16, chordIdx: 0, pulseFreq: tn(layerConfigs.sub.rootNote || 'D2') };
    let lastPlayedChord = null;
    /** Reset step sequencer counters so the arp pattern, groove, and chord
     *  progression start from the top. Call on manual seek and loop-back. */
    function resetSequencerCounters() {
      step = 0;
      pianoBarCount = 0;
      lastPlayedChord = null;
      droneState = { mode: 'hold', beatsLeft: 16, chordIdx: 0, pulseFreq: tn(layerConfigs.sub.rootNote || 'D2') };
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
      arp:      { node:'arpGain',   scale: 0.30 },
      echo:     { node:'echoGain',  scale: 0.20 },
      thump:    { node:'thumpGain', scale: 0.85 },
      piano:    { node:'pianoGain', scale: 0.90 },
      sub:      { node:'subGain',   scale: 0.05 },   // 1 sine + 0.3× overtone → was 0.13, ÷2.6
      pad:      { node:'padGain',   scale: 0.20 },
      bass:     { node:'bassGain',  scale: 0.08 },   // 2 sines through LPF → was 0.22, ÷2.75
      shim:     { node:'shimGain',  scale: 0.12 },
      drone:    { node:'droneGain', scale: 0.07 },   // 4 raw sawtooths → was 0.30, ÷4.3
      beatpulse:{ node:'pulseGain', scale: 0.20 },   // pitched pulse → was 0.55, ÷2.75
      voices:   { node:'voiceGain', scale: layerConfigs.voices.gainScale },
    };

    function initAudio() {
      if (actx) return;
      const scale = getScaleData();
      const N = scale.N;
      const ARP = scale.ARP;
      actx = new (window.AudioContext || window.webkitAudioContext)();
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

      // Reverb — higher quality IR (longer, stereo decorrelated)
      const irLen = Math.floor(actx.sampleRate * 2.2);
      const revBuf = actx.createBuffer(2, irLen, actx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = revBuf.getChannelData(ch);
        // Shaped noise with early reflections + smooth tail
        for (let i = 0; i < d.length; i++) {
          const t = i / actx.sampleRate;
          // Multi-stage decay for more realistic room
          const earlyDecay = t < 0.08 ? 1.0 : Math.exp(-t * 1.8);
          const lateDecay = Math.pow(1 - i / d.length, 3.2);
          const env = earlyDecay * 0.4 + lateDecay * 0.6;
          d[i] = (Math.random() * 2 - 1) * env;
        }
      }
      const rev = actx.createConvolver(); rev.buffer = revBuf;
      const revG = actx.createGain(); revG.gain.value = reverbWet;
      rev.connect(revG); revG.connect(master);
      nd.rev = rev; nd.revG = revG;

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
        fMix.connect(master); fMix.connect(nd.rev);
        arpF = f1; // morphTo controls the primary formant center
        nd.arpFilt2 = f2;
      } else {
        arpF = lpf(420, 1.2);
        arpG.connect(arpF); arpF.connect(master); arpF.connect(nd.rev);
      }
      const arpLfoHz = layerConfigs.arp.lfoHz || (arpIsVocal ? 2.5 : 4.8);
      const arpO=o('sawtooth',ARP[0]), arpO2=o('sawtooth',ARP[0]); arpO2.detune.value = arpIsVocal ? 8 : 14;
      const arpVib=o('sine',arpLfoHz), arpVibG=g(arpIsVocal ? 2.0 : 4.0); arpVib.connect(arpVibG); arpVibG.connect(arpO.frequency);
      arpO.connect(arpG); arpO2.connect(arpG);
      nd.arpGain=arpG; nd.arpFilt=arpF; nd.arpO=arpO; nd.arpO2=arpO2;

      // Echo (delayed concertina copy for width)
      const dL=actx.createDelay(2); dL.delayTime.value=s16()*layerConfigs.echo.leftDelaySteps;
      const dR=actx.createDelay(2); dR.delayTime.value=s16()*layerConfigs.echo.rightDelaySteps;
      const mg=actx.createChannelMerger(2); dL.connect(mg,0,0); dR.connect(mg,0,1);
      const echoG=g(0); mg.connect(echoG); echoG.connect(master); echoG.connect(nd.rev);
      arpF.connect(dL); arpF.connect(dR);
      nd.echoGain=echoG; nd.dL=dL; nd.dR=dR;

      // Bodhran stomp
      const thumpG=g(0); thumpG.connect(master); nd.thumpGain=thumpG;

      // Chord stabs (concertina chords)
      const pianoG=g(0); pianoG.connect(master); pianoG.connect(nd.rev); nd.pianoGain=pianoG;

      // Sub foundation
      const subRootN = layerConfigs.sub.rootNote || 'D2';
      const subOvtN = layerConfigs.sub.overtoneNote || 'A2';
      const subG=g(0); subG.connect(master);
      const subO1=o('sine',N[subRootN]||73.42); subO1.connect(subG);
      const sh=g(layerConfigs.sub.overtoneMix); const subO2=o('sine',N[subOvtN]||110); subO2.connect(sh); sh.connect(subG);
      nd.subGain=subG; nd.subO1=subO1; nd.subO2=subO2; nd.subRootN=subRootN; nd.subOvtN=subOvtN;

      // Squeezebox drone pad (sawtooth + heavy LPF for bellows texture)
      const padG=g(0); padG.connect(master); padG.connect(nd.rev);
      nd.padOscs = [];
      const dv0 = (presetDroneVoicings && presetDroneVoicings[0]) || null;
      const padNotes = dv0
        ? [[dv0.root, 0], [dv0.fifth, 5], [dv0.root, -3], [dv0.fifth, 3]]
        : [['D2',0],['A2',5],['D2',-3],['A2',3]];
      padNotes.forEach(([name,d]) => {
        const ov=o('sawtooth',N[name]||146.83,d);
        const vib=o('sine',layerConfigs.pad.vibratoHz), vg=g(layerConfigs.pad.vibratoDepth); vib.connect(vg); vg.connect(ov.frequency);
        const lp=lpf(layerConfigs.pad.lpfHz,0.5), gn=g(layerConfigs.pad.voiceGain); ov.connect(lp); lp.connect(gn); gn.connect(padG);
        nd.padOscs.push({ osc: ov, name });
      });
      nd.padGain=padG;

      // Bass line
      const bassRootN = (presetDroneVoicings && presetDroneVoicings[0]?.root) || 'D2';
      const bassG=g(0); bassG.connect(master); bassG.connect(nd.rev);
      const bO=o('sine',N[bassRootN]||73.42), bO2=o('sine',N[bassRootN]||73.42); bO2.detune.value=layerConfigs.bass.detuneCents;
      const bL=lpf(layerConfigs.bass.lpfHz,0.7), bH=hpf(layerConfigs.bass.hpfHz); bO.connect(bL); bO2.connect(bL); bL.connect(bH); bH.connect(bassG);
      nd.bassGain=bassG; nd.bassO=bO; nd.bassO2=bO2;

      // Ship's bell / ring accent
      const shimG=g(0); shimG.connect(master); shimG.connect(nd.rev); nd.shimGain=shimG;

      // Drone + pulse (low sustained fifths)
      const droneG=g(0); droneG.connect(master); droneG.connect(nd.rev); nd.droneGain=droneG;
      const pulseG=g(0); pulseG.connect(master); nd.pulseGain=pulseG;
      const drRootN = (presetDroneVoicings && presetDroneVoicings[0]?.root) || 'D2';
      const drFifthN = (presetDroneVoicings && presetDroneVoicings[0]?.fifth) || 'A2';
      const drO1=o('sawtooth',N[drRootN]||73.42), drO2=o('sawtooth',N[drRootN]||73.42); drO2.detune.value=6;
      const drO3=o('sawtooth',N[drFifthN]||110), drO4=o('sawtooth',N[drFifthN]||110); drO4.detune.value=-4;
      const drLPF=lpf(layerConfigs.drone.lpfHz,0.5);
      drO1.connect(drLPF); drO2.connect(drLPF); drO3.connect(drLPF); drO4.connect(drLPF); drLPF.connect(droneG);
      nd.drO1=drO1; nd.drO2=drO2; nd.drO3=drO3; nd.drO4=drO4;

      // Crew chorus
      const voiceG=g(0); voiceG.connect(master); voiceG.connect(nd.rev); nd.voiceGain=voiceG;

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
    function volumeToGain(v) {
      if (v <= 1) return v * 0.42;
      // Boost range rises faster so "more volume" is clearly audible.
      const boost = Math.min(1, v - 1);
      return 0.42 + boost * 0.50; // max 0.92 at v=2
    }

    function morphLayerTau(name) {
      if (name === 'pad') return 2.0;
      // Echo taps stereo delays — fast ramps dump stored energy and sound like static/grain.
      if (name === 'echo') return 2.85;
      if (name === 'piano') return 1.4;
      if (name === 'bass') return 1.05;
      if (name === 'sub') return 0.95;
      return 0.82;
    }

    /**
     * Cross-fade all layer gains + filter to the target phase.
     * @param {object} ph   phase object
     * @param {number} [at] scheduled audio time (pass from tick's `when` in the
     *   lookahead scheduler; omit for immediate morphs like seekToPhase / play).
     */
    function morphTo(ph, at) {
      const lv = ph.lv || {};
      ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(ph.id), 2.35, at);
      for (const [name, {node, scale}] of Object.entries(LAYER_MAP)) {
        const phaseVal = lv[name] ?? 0;
        const mult = layerMult[name] ?? 1;
        const tau = morphLayerTau(name);
        ramp(nd[node]?.gain, phaseVal * mult * scale, tau, at);
      }
      if (!ph.droneMode) ramp(nd.droneGain.gain, 0, 0.6, at);
    }

    function retuneContinuousVoices(when) {
      if (!actx) return;
      const t = when ?? actx.currentTime;
      const { N } = getScaleData();
      const subR = nd.subRootN || layerConfigs.sub.rootNote || 'D2';
      const subO = nd.subOvtN || layerConfigs.sub.overtoneNote || 'A2';
      if (nd.subO1) nd.subO1.frequency.setTargetAtTime(N[subR] || 73.42, t, 0.18);
      if (nd.subO2) nd.subO2.frequency.setTargetAtTime(N[subO] || 110, t, 0.2);
      if (nd.padOscs) nd.padOscs.forEach(v => v.osc.frequency.setTargetAtTime(N[v.name] || 146.83, t, 0.2));
      if (nd.drO1 && nd.drO2 && nd.drO3 && nd.drO4) {
        const dv = (presetDroneVoicings && presetDroneVoicings[0]) || { root: 'D2', fifth: 'A2' };
        const drR = N[dv.root] || 73.42;
        const drF = N[dv.fifth] || 110;
        nd.drO1.frequency.setTargetAtTime(drR, t, 0.2);
        nd.drO2.frequency.setTargetAtTime(drR, t, 0.2);
        nd.drO3.frequency.setTargetAtTime(drF, t, 0.2);
        nd.drO4.frequency.setTargetAtTime(drF, t, 0.2);
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
      let phase3 = 0;  // sub

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

        // Layer 6 — Sub weight (30–45 Hz, very fast decay)
        const subHz = endHz * 0.65;
        phase3 += subHz / sr;
        const sub = Math.sin(2 * Math.PI * phase3) * Math.exp(-t * (aDecay * 3.0)) * 0.40;

        // ── Sum all seven layers ──
        let sample = knuckle[i]
                   + fleshSlap[i]
                   + woodRing[i]
                   + rattle[i]
                   + fund
                   + mode2
                   + sub;

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
      const tG = actx.createGain();
      tG.gain.value = ((tv * 0.58) / Math.max(0.001, gRead)) * vel;
      src.connect(tG);
      tG.connect(nd.thumpGain);
      src.start(when);
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
      const harmonicList = layerConfigs.piano.harmonics || [1, 2, 3];
      const harmonicDefs = harmonicList.map((h, idx) => {
        // Progressive amplitude and decay reduction for higher harmonics
        const amp = idx === 0 ? 1.0 : Math.pow(0.38, idx);
        const dec = idx === 0 ? 0.90 : 0.90 - idx * 0.22;
        return [h, amp, Math.max(0.12, dec)];
      });
      chord.notes.forEach((freq, ni) => {
        harmonicDefs.forEach(([harm, amp, dec]) => {
          const f = freq * harm;
          if (f > 8000) return;
          const buf = getPianoPartialBuffer(f, ni, harm, amp, dec);
          const src = actx.createBufferSource();
          src.buffer = buf;
          const nG = actx.createGain();
          nG.gain.value = pv * 0.26;
          src.connect(nG);
          nG.connect(nd.pianoGain);
          const voiceDelay = layerConfigs.piano.voiceDelaySec || 0.004;
          src.start(when + ni * voiceDelay);
        });
      });
      emit('chord', chord.name);
    }

    function getDronePulseBuffer(freq, vel) {
      const sr = actx.sampleRate;
      const key = `${freq.toFixed(3)}|${vel.toFixed(2)}|${sr}`;
      let buf = dronePulseCache.get(key);
      if (buf) return buf;
      const dur = layerConfigs.beatpulse.durationSec;
      const len = Math.floor(sr * dur);
      buf = actx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      // Anti-click: 1ms fade-in and 5ms fade-out
      const fadeInSamples = Math.floor(sr * 0.001);
      const fadeOutSamples = Math.floor(sr * 0.005);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = freq * 1.5 * Math.exp(-t * layerConfigs.beatpulse.pitchGlide) + freq;
        const env = Math.exp(-t * layerConfigs.beatpulse.ampDecay);
        let fadeEnv = 1.0;
        if (i < fadeInSamples) fadeEnv = i / fadeInSamples;
        if (i > len - fadeOutSamples) fadeEnv = (len - i) / fadeOutSamples;
        d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.75 * vel * fadeEnv;
      }
      // LRU-style eviction instead of wholesale clear
      if (dronePulseCache.size > 32) {
        const keys = Array.from(dronePulseCache.keys());
        for (let i = 0; i < 8 && i < keys.length; i++) {
          dronePulseCache.delete(keys[i]);
        }
      }
      dronePulseCache.set(key, buf);
      return buf;
    }

    function fireDronePulse(when, freq, vel=1.0, targetGain=null) {
      const pv = nd.pulseGain.gain.value;
      const gate = targetGain != null ? targetGain : pv;
      if (gate < 0.02) return;
      const buf = getDronePulseBuffer(freq, vel);
      const src = actx.createBufferSource(); src.buffer = buf;
      const pG2 = actx.createGain(); pG2.gain.value = pv > 0.001 ? pv * 0.48 : gate * 0.48;
      src.connect(pG2); pG2.connect(nd.master); src.start(when);
    }

    function fireVoices(when, chord, targetGain=null) {
      if (!chord || !nd.voiceGain) return;
      // Use targetGain (computed from phase lv) for both gating AND envelope levels.
      // nd.voiceGain.gain.value is unreliable during morph transitions (may be near 0).
      const nodeVal = nd.voiceGain.gain.value * (layerMult.voices ?? 1);
      const gate = targetGain != null ? targetGain : nodeVal;
      if (gate < 0.02) return;
      // Effective level for envelope peaks — use the higher of node value or target
      // so voices are audible even during the first tick of a morph
      const vv = Math.max(nodeVal, gate);

      const vc = layerConfigs.voices;
      const dur = vc.releaseSec;
      const baseFormant = vc.formantHz;
      const baseVibHz = vc.vibratoHz;
      const numVoices = vc.voiceCount ?? 2;
      const detSpread = vc.detuneSpread ?? 15;
      const breathLvl = vc.breathLevel ?? 0.035;

      const vowels = [
        { f1: baseFormant,       f2: baseFormant * 1.55, q1: 5, q2: 4 },
        { f1: baseFormant * 0.7, f2: baseFormant * 1.2,  q1: 6, q2: 5 },
      ];

      const notes = chord.notes.slice(0, Math.min(4, chord.notes.length));

      notes.forEach((freq, ni) => {
        const vowel = vowels[ni % vowels.length];

        for (let vi = 0; vi < numVoices; vi++) {
          const detCents = (vi - (numVoices - 1) * 0.5) * detSpread / Math.max(1, numVoices - 1) + (Math.random() - 0.5) * 8;
          const delay = ni * 0.04 + vi * (0.025 / Math.max(1, numVoices - 1)) + Math.random() * 0.02;
          const startAt = when + delay;

          const osc = actx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = freq;
          osc.detune.value = detCents;

          const vib = actx.createOscillator();
          const vibAmt = actx.createGain();
          vib.frequency.value = baseVibHz + ni * 0.4 + vi * 0.3;
          vibAmt.gain.value = 3.5 + ni * 1.2;
          vib.connect(vibAmt); vibAmt.connect(osc.frequency);

          const f1 = actx.createBiquadFilter();
          f1.type = 'bandpass'; f1.frequency.value = vowel.f1 + vi * 25; f1.Q.value = vowel.q1;
          const f2 = actx.createBiquadFilter();
          f2.type = 'bandpass'; f2.frequency.value = vowel.f2 + vi * 40; f2.Q.value = vowel.q2;
          const fSum = actx.createGain(); fSum.gain.value = 1.0;
          osc.connect(f1); osc.connect(f2); f1.connect(fSum); f2.connect(fSum);

          const env = actx.createGain();
          const peak = vv * (0.20 - ni * 0.025 - vi * (0.015 / numVoices));
          env.gain.setValueAtTime(0.0, startAt);
          env.gain.linearRampToValueAtTime(peak, startAt + 0.12 + ni * 0.025);
          env.gain.setTargetAtTime(peak * 0.55, startAt + 0.45, dur * 0.38);
          env.gain.setTargetAtTime(0.001, startAt + dur * 0.55, dur * 0.3);

          fSum.connect(env); env.connect(nd.voiceGain);
          osc.start(startAt); vib.start(startAt);
          const endAt = startAt + dur + 0.5;
          osc.stop(endAt); vib.stop(endAt);
        }
      });

      const noiseDur = dur * 0.5;
      const noiseBuf = getBreathNoiseBuffer();
      const noiseSrc = actx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const maxOffset = Math.max(0, noiseBuf.duration - noiseDur - 0.2);
      const noiseOffset = Math.random() * maxOffset;
      const noiseBpf = actx.createBiquadFilter();
      noiseBpf.type = 'bandpass'; noiseBpf.frequency.value = 1600; noiseBpf.Q.value = 1.8;
      const noiseEnv = actx.createGain();
      noiseEnv.gain.setValueAtTime(0, when);
      noiseEnv.gain.linearRampToValueAtTime(vv * breathLvl, when + 0.18);
      noiseEnv.gain.setTargetAtTime(0.001, when + 0.5, noiseDur * 0.25);
      noiseSrc.connect(noiseBpf); noiseBpf.connect(noiseEnv); noiseEnv.connect(nd.voiceGain);
      noiseSrc.start(when, noiseOffset, noiseDur + 0.1);
    }

    function setDroneFreq(f1, f2, when) {
      nd.drO1.frequency.setTargetAtTime(f1,when,0.15); nd.drO2.frequency.setTargetAtTime(f1,when,0.18);
      nd.drO3.frequency.setTargetAtTime(f2,when,0.15); nd.drO4.frequency.setTargetAtTime(f2,when,0.18);
    }

    const SCHEDULER_INTERVAL_MS = 25;
    // 2s lookahead keeps ~2s of audio pre-scheduled, surviving iOS background
    // timer throttling (timers drop to ~1s intervals or pause entirely).
    const SCHEDULER_LOOKAHEAD_SEC = 2.0;
    const SCHEDULER_MAX_TICKS_PER_WAKE = 512;

    function getShimmerBuffer() {
      const sr = actx.sampleRate;
      const mode = layerConfigs.shim.synthMode || 'bell';
      const key = `${mode}|${keyId}|${sr}`;
      if (shimmerBuffer && shimmerCacheKey === key) return shimmerBuffer;

      if (mode === 'clap') {
        const clapDur = layerConfigs.shim.durationSec || 0.06;
        const len = Math.floor(sr * clapDur);
        const shBuf = actx.createBuffer(1, len, sr);
        const sd = shBuf.getChannelData(0);
        const bpfCenter = 2400;
        const bpfQ = 1.5;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const noise = Math.random() * 2 - 1;
          // Double-tap envelope simulates flesh impact
          const env1 = Math.exp(-t * 80);
          const env2 = t > 0.008 ? Math.exp(-(t - 0.008) * 60) * 0.7 : 0;
          const env = env1 + env2;
          // Simple bandpass approximation via resonant shaping
          const angle = 2 * Math.PI * bpfCenter * t;
          const shaped = noise * (0.5 + 0.5 * Math.sin(angle * bpfQ * 0.1));
          let fadeEnv = 1.0;
          if (i < 4) fadeEnv = i / 4;
          if (i > len - 8) fadeEnv = (len - i) / 8;
          sd[i] = shaped * env * 0.65 * fadeEnv;
        }
        shimmerBuffer = shBuf;
        shimmerCacheKey = key;
        return shBuf;
      }

      const shimDur = layerConfigs.shim.durationSec || 0.12;
      const len = Math.floor(sr * shimDur);
      const shBuf = actx.createBuffer(1, len, sr);
      const sd = shBuf.getChannelData(0);
      const bellHz = tn('A4') * (layerConfigs.shim.octaveMul || 1);
      const bellHz2 = bellHz * 2.71;
      const fadeInSamples = Math.floor(sr * 0.0005);
      const fadeOutSamples = Math.floor(sr * 0.002);
      for (let i = 0; i < sd.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * (1 / shimDur) * 3.5);
        let fadeEnv = 1.0;
        if (i < fadeInSamples) fadeEnv = i / fadeInSamples;
        if (i > len - fadeOutSamples) fadeEnv = (len - i) / fadeOutSamples;
        sd[i] = (Math.sin(2 * Math.PI * bellHz * t) * 0.6
               + Math.sin(2 * Math.PI * bellHz2 * t) * 0.25) * env * 0.5 * fadeEnv;
      }
      shimmerBuffer = shBuf;
      shimmerCacheKey = key;
      return shBuf;
    }

    function schedulerLoop() {
      if (!playing || !actx) return;
      const now = actx.currentTime;
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
      const { ARP, CHORDS, droneChords } = getScaleData();
      const idx = step % 16;
      const arpRotate = ph.randomMod?.arpRotate ?? 0;

      if (ph !== currentPhase) {
        const isWrapBack = currentPhase
          && ph.start < currentPhase.start;
        if (isWrapBack) resetSequencerCounters();
        currentPhase = ph;
        morphTo(ph, when);
        emit('phase', { id: ph.id, label: ph.label });
      }

      emit('beat', {
        step: idx,
        phase: ph.id,
        phaseLabel: ph.label,
        phaseProgress: getPhaseProgress(ph, el),
        phaseStart: ph.start,
        phaseEnd: ph.end,
      });

      // Concertina retrigger — smooth envelope to avoid clicks
      // Uses setValueAtTime at current gain before ramping to prevent discontinuity
      const freq=ARP[(idx + arpRotate) % ARP.length], vel=VEL[idx], av=(lv.arp||0)*(layerMult.arp??1);
      const arpAttack = layerConfigs.arp.attackSec || 0.015;
      const arpDecayTau = s16() * (layerConfigs.arp.decayTauMul || 0.85);
      nd.arpO.frequency.setValueAtTime(freq,when);
      nd.arpO2.frequency.setValueAtTime(freq,when);
      // HIGH-FIDELITY: Capture current arp gain to prevent discontinuity
      const curArpGain = nd.arpGain.gain.value;
      nd.arpGain.gain.cancelScheduledValues(when);
      // Ramp down from current value over 1ms before the new note attack
      nd.arpGain.gain.setValueAtTime(curArpGain, when);
      nd.arpGain.gain.linearRampToValueAtTime(0, when + 0.001);
      nd.arpGain.gain.linearRampToValueAtTime(av*vel*0.30, when + 0.001 + arpAttack);
      nd.arpGain.gain.setTargetAtTime(av*vel*0.08, when + 0.001 + arpAttack, arpDecayTau);

      if (idx===0 || idx===8) {
        const targetThump = (lv.thump ?? 0) * (layerMult.thump ?? 1) * LAYER_MAP.thump.scale;
        fireThump(when, idx===0 ? 1.0 : 0.82, targetThump);

        if (idx===0) {
          const seq = ph.chordSeq;
          // Always resolve the chord — voices, bass, and other layers depend on it
          if (seq) {
            lastPlayedChord = CHORDS[seq[pianoBarCount % seq.length]];
            // Bass follows the chord root regardless of piano level
            if (lastPlayedChord) {
              nd.bassO.frequency.setTargetAtTime(lastPlayedChord.notes[0],when,0.10);
              nd.bassO2.frequency.setTargetAtTime(lastPlayedChord.notes[0],when,0.12);
            }
          }
          const targetPiano = (lv.piano||0)*(layerMult.piano??1)*LAYER_MAP.piano.scale;
          if (lastPlayedChord && targetPiano > 0.02) {
            firePiano(when, lastPlayedChord, targetPiano);
          }
          pianoBarCount++;
        }

        // Drone/pulse state machine
        const ds = droneState;
        const targetDrone = (lv.drone||0)*(layerMult.drone??1);
        const targetPulse = targetDrone * LAYER_MAP.beatpulse.scale;
        if (ph.droneMode && targetDrone > 0.02) {
          if (ds.mode==='hold') {
            if (ds.beatsLeft===16) {
              const ch=droneChords[ds.chordIdx % droneChords.length];
              setDroneFreq(ch.r, ch.f, when);
              ramp(nd.droneGain.gain, targetDrone*0.30, 0.6, when);
            }
            ds.beatsLeft--;
            if (ds.beatsLeft<=0) { ramp(nd.droneGain.gain, 0.02, 0.3, when); ds.mode='pulse'; ds.beatsLeft=16; ds.pulseFreq=droneChords[ds.chordIdx % droneChords.length].r; }
          } else {
            fireDronePulse(when, ds.pulseFreq, 0.85, targetPulse);
            ds.beatsLeft--;
            if (ds.beatsLeft<=0) { ds.chordIdx++; ds.mode='hold'; ds.beatsLeft=16; }
          }
        } else if (!ph.droneMode) {
          ds.mode='hold'; ds.beatsLeft=16; ds.chordIdx=0;
          ramp(nd.droneGain.gain, 0, 0.5, when);
        }
      }

      // Ship's bell / ring accent on configured beats
      if (layerConfigs.shim.triggerSteps.includes(idx) && (lv.shim||0)*(layerMult.shim??1) > 0.02) {
        const sv = (lv.shim||0)*(layerMult.shim??1);
        const shBuf = getShimmerBuffer();
        const shSrc = actx.createBufferSource();
        shSrc.buffer = shBuf;
        const shG2 = actx.createGain();
        shG2.gain.value = sv * 0.14;
        shSrc.connect(shG2);
        shG2.connect(nd.shimGain);
        shSrc.start(when);
      }

      // Crew chorus on configured trigger steps (call-and-response rhythm)
      const voiceTriggers = layerConfigs.voices.triggerSteps || [0, 8];
      if (voiceTriggers.includes(idx)) {
        const targetVoices = (lv.voices||0)*(layerMult.voices??1)*LAYER_MAP.voices.scale;
        if (lastPlayedChord && targetVoices > 0.02) {
          fireVoices(when, lastPlayedChord, targetVoices);
        }
      }

      step++;

      // Update echo delay times to current BPM (smooth ramp prevents zipper noise)
      nd.dL.delayTime.setTargetAtTime(s16()*layerConfigs.echo.leftDelaySteps, when, 0.15);
      nd.dR.delayTime.setTargetAtTime(s16()*layerConfigs.echo.rightDelaySteps, when, 0.15);
    }

    function beginPlayback() {
      if (!actx) return;
      if (playing) return;
      if (schedulerIntervalId !== null) {
        clearTimeout(schedulerIntervalId);
        schedulerIntervalId = null;
      }

      // If seekToPhase was called while the actx.resume() promise was pending,
      // honour that seek now that the context is actually running.
      if (pendingSeekPhaseId !== null) {
        const seekId = pendingSeekPhaseId;
        pendingSeekPhaseId = null;
        // pausedAt was already set by seekToPhase; counters already reset.
        playing = true;
        startTime = actx.currentTime;
        nextTickAt = startTime + 0.01;
        currentPhase = null;
        resetPhaseMarkerState();
        morphTo(getPhase(pausedAt));
        schedulerIntervalId = 0;
        schedulerLoop();
        return;
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
      LAYER_MAP.voices.scale = layerConfigs.voices.gainScale;
      PHASES = timelinePhasesFromPreset(preset.phases);
      const d = preset.defaults || {};
      bpmTarget = d.bpm ?? DEFAULT_PRESET.defaults.bpm;
      if (!playing) bpm = bpmTarget;
      keyId = d.key ?? DEFAULT_PRESET.defaults.key;
      if (d.reverb != null) reverbWet = d.reverb;
      lastPresetMeta = { id: preset.id || '', name: preset.name || '' };
      disabledPhaseIds.clear();
      rebuildPhaseSchedule();
      invalidateScaleCache();
      invalidateAudioBuffers();
      resetSequencerCounters();
      clampPausedTime();
      if (nd.revG && actx) ramp(nd.revG.gain, reverbWet, 0.5);
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
          // doesn't produce a burst of sound from frozen oscillators / reverb tail.
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

      seekToPhase(id) {
        resetPhaseMarkerState();
        resetSequencerCounters();
        for (let i = 0; i < activePhases.length; i++) {
          if (activePhases[i].id === id) {
            pausedAt = activePhases[i].start;
            currentPhase = null;
            if (playing && actx) {
              startTime = actx.currentTime;
              nextTickAt = actx.currentTime + 0.01;
              morphTo(activePhases[i]);
            } else {
              pendingSeekPhaseId = id;
            }
            emit('phase', { id: activePhases[i].id, label: activePhases[i].label });
            flushEvents();
            return;
          }
        }
      },

      /** Remove a phase from the loop (at least one scripted phase must remain). Timeline is recompressed. */
      removePhase(id) {
        if (!PHASES.some(p => p.id === id)) return false;
        const wouldRemain = PHASES.filter(p => !disabledPhaseIds.has(p.id) && p.id !== id).length;
        if (wouldRemain < 1) return false;
        disabledPhaseIds.add(id);
        rebuildPhaseSchedule();
        clampPausedTime();
        currentPhase = null;
        resetPhaseMarkerState();
        const ph = getPhase(elapsed());
        if (actx) morphTo(ph);
        emit('phase', { id: ph.id, label: ph.label });
        flushEvents();
        return true;
      },

      /** Restore a previously removed phase. */
      restorePhase(id) {
        if (!disabledPhaseIds.has(id)) return false;
        disabledPhaseIds.delete(id);
        rebuildPhaseSchedule();
        clampPausedTime();
        currentPhase = null;
        resetPhaseMarkerState();
        const ph = getPhase(elapsed());
        if (actx) morphTo(ph);
        emit('phase', { id: ph.id, label: ph.label });
        flushEvents();
        return true;
      },

      getRemovedPhaseIds() {
        return PHASES.filter(p => disabledPhaseIds.has(p.id)).map(p => ({ id: p.id, label: p.label }));
      },

      setVolume(v) {
        volumeSetting = Math.max(0, Math.min(2, v));
        if (nd.master && actx) {
          nd.master.gain.cancelScheduledValues(actx.currentTime);
          nd.master.gain.setValueAtTime(volumeToGain(volumeSetting), actx.currentTime);
        }
      },

      // name: 'arp'|'echo'|'thump'|'piano'|'sub'|'pad'|'bass'|'shim'|'drone'|'beatpulse'|'voices'
      // value: 0–2 multiplier on top of the phase's base level (UI allows up to 200%)
      setLayer(name, value) {
        value = Math.max(0, Math.min(2, value));
        layerMult[name] = value;
        if (!actx || !nd.master) return; // will be applied on next morphTo if not yet initialised
        const map = LAYER_MAP[name];
        if (!map) return;
        const ph = currentPhase || getPhase(elapsed());
        const baseVal = ph?.lv?.[name] ?? 0;
        ramp(nd[map.node]?.gain, baseVal * value * map.scale, 0.3);
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
        bpmTarget = Math.max(40, Math.min(200, newBpm));
        bpm = bpmTarget;
      },

      setReverb(wet) {
        reverbWet = Math.max(0, Math.min(0.80, wet));
        if (nd.revG && actx) {
          nd.revG.gain.cancelScheduledValues(actx.currentTime);
          nd.revG.gain.setValueAtTime(reverbWet, actx.currentTime);
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

      /** Call after visibility returns (mobile unlock) so Web Audio can resume. */
      resumeAudioContext() {
        if (actx && actx.state === 'suspended') return actx.resume();
        return Promise.resolve();
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
          reverb: reverbWet,
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

      getPhases() {
        return activePhases.map(p => ({ id: p.id, label: p.label }));
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
