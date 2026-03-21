// music_engine_web.js
// Procedural Music Studio — standalone Web Audio engine
// Browser-only procedural music engine for standalone web apps.
// Drop into any HTML page.
//
// Public API:
//   const engine = ProceduralMusic.create({ preset }); // preset optional — defaults to bundled JSON
//   engine.play()
//   engine.stop()
//   engine.seekToPhase(id)          // active scripted id or 'novel'
//   engine.removePhase(id)          // remove from loop (≥1 phase must remain); timeline recompressed
//   engine.restorePhase(id)         // bring back a removed phase
//   engine.getRemovedPhaseIds()     // [{ id, label }, ...]
//   engine.getNextPhaseLevels()     // next phase lv map
//   engine.setVolume(0-2)            // 1.0 = unity, >1 = boost
//   engine.setLayer(name, 0-1)      // layer name from LAYER_IDS
//   engine.setBPM(bpm)              // 50-120, default 83
//   engine.setReverb(0-1)           // wet amount, default 0.16
//   engine.setKey(id)               // e.g. 'Gm', 'Am', 'Dm'
//   engine.setNovelMode(bool)       // if true, generates non-repeating post-outro phases
//   engine.setNovelLock(bool)       // if true, current novel phase is held
//   engine.setPhaseLoop(id|null)    // lock playback to a phase id
//   engine.setArpFilter(hz)         // arp LPF cutoff, default auto per phase
//   engine.getAnalyser()            // AnalyserNode (post output delay; matches heard mix)
//   engine.getLayerAnalysers()      // { layerId: AnalyserNode } per-layer RMS taps (after play)
//   engine.getState()               // { playing, transportActive, phase, ... }
//   engine.setArrangementLookaheadSec(seconds) // strip duration (markers + quantized output delay)
//   engine.setArrangementOutputDelaySec(seconds) // alias; same as setArrangementLookaheadSec
//   engine.on(event, callback)      // 'phase' | 'chord' | 'beat' | 'phaseMarker'
//   engine.off(event, callback)

const ProceduralMusic = (() => {
  const DEFAULT_PRESET = JSON.parse("{\"schemaVersion\":1,\"id\":\"studio-default\",\"name\":\"G Natural Minor (Studio)\",\"description\":\"Original Procedural Music Studio loop: seven phases, layered Web Audio synthesis.\",\"defaults\":{\"bpm\":83,\"key\":\"Gm\",\"reverb\":0.15},\"keyOffsets\":{\"Gm\":0,\"Am\":2,\"Bbm\":3,\"Cm\":5,\"Dm\":7,\"Em\":9,\"Fm\":10},\"baseNotesHz\":{\"G1\":49,\"D2\":73.42,\"G2\":98,\"Bb2\":116.54,\"C3\":130.81,\"D3\":146.83,\"F3\":174.61,\"G3\":196,\"A3\":220,\"Bb3\":233.08,\"C4\":261.63,\"D4\":293.66,\"Eb4\":311.13,\"F4\":349.23,\"G4\":392,\"Bb4\":466.16},\"velocities\":[0.88,0.38,0.54,0.32,0.72,0.36,0.5,0.28,0.8,0.4,0.56,0.3,0.66,0.34,0.48,0.26],\"layerIds\":[\"arp\",\"echo\",\"thump\",\"piano\",\"sub\",\"pad\",\"bass\",\"shim\",\"drone\",\"beatpulse\",\"voices\"],\"layerMix\":{\"arp\":0.3,\"echo\":0.2,\"thump\":0.85,\"piano\":0.9,\"sub\":0.13,\"pad\":0.2,\"bass\":0.22,\"shim\":0.12,\"drone\":0.3,\"beatpulse\":0.55,\"voices\":0.26},\"layerConfigs\":{\"arp\":{\"stepsPerBar\":16,\"lfoHz\":5.1,\"attackSec\":0.007,\"decayTauMul\":0.65,\"gainScale\":0.3},\"echo\":{\"leftDelaySteps\":2,\"rightDelaySteps\":3,\"gainScale\":0.2},\"thump\":{\"durationSec\":0.55,\"startHz\":140,\"endHz\":60,\"pitchDecay\":8,\"ampDecay\":5.5,\"gainScale\":0.85},\"piano\":{\"harmonics\":[1,2,3,4],\"durationSec\":2.2,\"voiceDelaySec\":0.004,\"gainScale\":0.9},\"sub\":{\"rootNote\":\"G1\",\"overtoneNote\":\"G2\",\"overtoneMix\":0.24,\"gainScale\":0.13},\"pad\":{\"vibratoHz\":4.6,\"vibratoDepth\":0.82,\"lpfHz\":820,\"voiceGain\":0.17,\"gainScale\":0.2},\"bass\":{\"lpfHz\":380,\"hpfHz\":45,\"detuneCents\":-5,\"gainScale\":0.22},\"shim\":{\"triggerSteps\":[2,6,10,14],\"durationSec\":0.1,\"octaveMul\":2,\"gainScale\":0.12},\"drone\":{\"holdBeats\":16,\"pulseBeats\":16,\"lpfHz\":280,\"gainScale\":0.3},\"beatpulse\":{\"durationSec\":0.45,\"pitchGlide\":3,\"ampDecay\":6,\"gainScale\":0.55},\"voices\":{\"releaseSec\":1.6,\"vibratoHz\":5.3,\"formantHz\":1180,\"triggerSteps\":[4,12],\"gainScale\":0.26}},\"arpPattern\":[\"G3\",\"D4\",\"Bb3\",\"G4\",\"F4\",\"D4\",\"Bb3\",\"G3\",\"A3\",\"D4\",\"C4\",\"G4\",\"Eb4\",\"C4\",\"Bb3\",\"G3\"],\"phaseFilterHz\":{\"intro\":400,\"build1\":580,\"verse1\":780,\"chorus1\":1100,\"break\":520,\"chorus2\":1200,\"outro\":620},\"novelLabels\":[\"Nebula Drift\",\"Moonlit Pulse\",\"Stardust Bloom\",\"Aurora Steps\",\"Velvet Horizon\",\"Eclipse Motion\"],\"phases\":[{\"id\":\"intro\",\"label\":\"Intro\",\"durationBeats\":16,\"chordSeq\":null,\"droneMode\":false,\"lv\":{\"arp\":0.82,\"echo\":0,\"thump\":0.7,\"piano\":0,\"sub\":0.32,\"pad\":0,\"bass\":0.28,\"shim\":0,\"drone\":0,\"beatpulse\":0,\"voices\":0}},{\"id\":\"build1\",\"label\":\"Build 1\",\"durationBeats\":16,\"chordSeq\":[\"Gm\",\"Eb\"],\"droneMode\":false,\"lv\":{\"arp\":0.82,\"echo\":0.42,\"thump\":0.72,\"piano\":0.52,\"sub\":0.38,\"pad\":0,\"bass\":0.45,\"shim\":0,\"drone\":0,\"beatpulse\":0,\"voices\":0}},{\"id\":\"verse1\",\"label\":\"Verse\",\"durationBeats\":20,\"chordSeq\":[\"Gm\",\"Eb\"],\"droneMode\":false,\"lv\":{\"arp\":0.8,\"echo\":0.46,\"thump\":0.72,\"piano\":0.55,\"sub\":0.42,\"pad\":0.48,\"bass\":0.5,\"shim\":0,\"drone\":0,\"beatpulse\":0,\"voices\":0}},{\"id\":\"chorus1\",\"label\":\"Chorus 1\",\"durationBeats\":16,\"chordSeq\":[\"Gm\",\"Eb\",\"Cm\",\"Bb\"],\"droneMode\":true,\"lv\":{\"arp\":0.78,\"echo\":0.48,\"thump\":0.72,\"piano\":0.58,\"sub\":0.46,\"pad\":0.52,\"bass\":0.52,\"shim\":0.46,\"drone\":0.72,\"beatpulse\":0.6,\"voices\":0.34}},{\"id\":\"break\",\"label\":\"Break\",\"durationBeats\":12,\"chordSeq\":[\"Gm\",\"Eb\"],\"droneMode\":false,\"lv\":{\"arp\":0.84,\"echo\":0.08,\"thump\":0.76,\"piano\":0.5,\"sub\":0.35,\"pad\":0.08,\"bass\":0.3,\"shim\":0,\"drone\":0,\"beatpulse\":0,\"voices\":0}},{\"id\":\"chorus2\",\"label\":\"Chorus 2\",\"durationBeats\":24,\"chordSeq\":[\"Gm\",\"Eb\",\"Cm\",\"Bb\"],\"droneMode\":true,\"lv\":{\"arp\":0.8,\"echo\":0.5,\"thump\":0.72,\"piano\":0.6,\"sub\":0.48,\"pad\":0.55,\"bass\":0.54,\"shim\":0.52,\"drone\":0.78,\"beatpulse\":0.65,\"voices\":0.4}},{\"id\":\"outro\",\"label\":\"Outro\",\"durationBeats\":16,\"chordSeq\":[\"Gm\",\"Eb\"],\"droneMode\":false,\"lv\":{\"arp\":0.72,\"echo\":0.15,\"thump\":0.65,\"piano\":0.42,\"sub\":0.28,\"pad\":0.12,\"bass\":0.22,\"shim\":0.1,\"drone\":0,\"beatpulse\":0,\"voices\":0.12}}]}");

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
    let NOVEL_LABELS = DEFAULT_PRESET.novelLabels.slice();
    let layerConfigs = deepMerge({}, DEFAULT_PRESET.layerConfigs);
    let phaseFilterHzMap = { ...DEFAULT_PRESET.phaseFilterHz };
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
      const CHORDS = {
        Gm: { name:`${keyId}`, notes:[N.G2, N.D3, N.G3, N.Bb3, N.D4] },
        Eb: { name:`${noteNameFor('Eb4').replace(/[0-9]/g, '')}`, notes:[N.G2, N.Eb4*0.5, N.G3, N.Bb3, N.Eb4] },
        Cm: { name:`${noteNameFor('C4').replace(/[0-9]/g, '')}m`, notes:[N.C3, N.G3, N.C4, N.Eb4] },
        Bb: { name:`${noteNameFor('Bb3').replace(/[0-9]/g, '')}`, notes:[N.Bb2*0.5, N.F3, N.Bb3, N.D4] },
      };
      const droneChords = [{r:N.G1,f:N.D2},{r:N.Bb2*0.5,f:N.F3*0.5}];
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

    function invalidateAudioBuffers() {
      pianoPartialCache.clear();
      dronePulseCache.clear();
      thumpBufferBase = null;
      thumpBufferSr = 0;
      shimmerBuffer = null;
      shimmerCacheKey = '';
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
      if (phaseLoopId && phaseLoopId !== 'novel' && !activePhases.some(p => p.id === phaseLoopId)) {
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
    let novelMode = false;
    let novelLocked = false;
    let volumeSetting = 1.0;
    const novelPhases = [];
    let novelCount = 0;

    let actx=null, nd={}, startTime=0, pausedAt=0, playing=false;
    let step=0, pianoBarCount=0, currentPhase=null;
    /** Pending seek target set before actx.resume() completes (play+seek race). */
    let pendingSeekPhaseId = null;
    /** Next 16th-note event time (AudioContext), used by lookahead scheduler. */
    let nextTickAt = 0;
    let schedulerIntervalId = null;
    let droneState = { mode: 'hold', beatsLeft: 16, chordIdx: 0, pulseFreq: tn('G1') };
    /** Reset step sequencer counters so the arp pattern, groove, and chord
     *  progression start from the top. Call on manual seek and loop-back. */
    function resetSequencerCounters() {
      step = 0;
      pianoBarCount = 0;
      droneState = { mode: 'hold', beatsLeft: 16, chordIdx: 0, pulseFreq: tn('G1') };
    }
    let analyser = null;
    let layerAnalysers = {};

    /** Grey-strip duration (s): marker drift time and output delay (viz vs speakers). */
    let arrangementLookaheadSec = 0;
    /** Driven with lookahead from arrangement; delays master → destination. */
    let arrangementOutputDelaySec = 0;
    /** Last quantized strip sec applied to DelayNode (matches marker La/D). */
    let lastStripQuantSec = -1;
    let lastMarkerEmittedT = null;

    /** 250ms steps — fewer delayTime updates (reduces zipper/static from DelayNode). */
    function quantizeStripSec(s) {
      const v = Math.max(0, Number(s) || 0);
      const cap = (nd.outputDelayMax || 16) - 0.0001;
      return Math.round(Math.min(v, cap) * 4) / 4;
    }

    // Event emitter
    const listeners = { phase:[], chord:[], beat:[], phaseMarker:[] };
    function emit(type, data) { (listeners[type]||[]).forEach(fn => { try { fn(data); } catch(e){} }); }

    function resetPhaseMarkerState() {
      lastMarkerEmittedT = null;
    }

    /**
     * Emit once per boundary T so the marker reaches the divider when the **heard** morph happens at T + strip.
     * La and D must match (same quantized strip as DelayNode). Window: el ∈ [T + D − La, T + D).
     */
    function maybeEmitPhaseMarker(el) {
      const strip = quantizeStripSec(arrangementLookaheadSec);
      const La = strip;
      const D = strip;
      if (La <= 0 || !playing || !actx) return;
      if (phaseLoopId && phaseLoopId !== 'novel') return;

      if (
        lastMarkerEmittedT !== null &&
        el >= lastMarkerEmittedT + D - 1e-9
      ) {
        lastMarkerEmittedT = null;
      }

      const phL = getPhase(el - 1e-6);
      const phR = getPhase(el + 1e-6);
      const Tcand = new Set([phL.end, phL.start, phR.end, phR.start]);
      for (const T of Tcand) {
        if (!Number.isFinite(T) || T <= 1e-9) continue;
        if (el < T + D - La - 1e-9) continue;
        if (el >= T + D - 1e-9) continue;
        const phOut = getPhase(T - 1e-6);
        const incoming = getPhase(T + 1e-4);
        if (incoming.id === phOut.id) continue;
        if (lastMarkerEmittedT === T) continue;
        lastMarkerEmittedT = T;
        emit('phaseMarker', { id: incoming.id, label: incoming.label });
        return;
      }
    }

    function getScriptedPhase(t) {
      if (!Number.isFinite(t) || t < 0) t = 0;
      const tt = ((t % scriptedTotal) + scriptedTotal) % scriptedTotal;
      for (let i = activePhases.length - 1; i >= 0; i--) {
        if (tt >= activePhases[i].start) return activePhases[i];
      }
      return activePhases[0];
    }
    function clamp01(v) { return Math.max(0, Math.min(1, v)); }
    function createNovelPhase(startSec, previousLv) {
      const previous = previousLv || activePhases[activePhases.length - 1].lv;
      const dur = 15;
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];
      const lv = {};
      LAYER_IDS.forEach(name => {
        const base = previous[name] ?? 0.2;
        const drift = (Math.random() * 2 - 1) * 0.14;
        lv[name] = clamp01(base + drift);
      });
      // Random drift can drive piano to 0 across successive novel segments; chord stabs then never fire.
      lv.piano = Math.max(0.48, lv.piano);

      return {
        id: `novel-${novelCount + 1}`,
        label: `${NOVEL_LABELS[novelCount % NOVEL_LABELS.length]} ${novelCount + 1}`,
        start: startSec,
        end: startSec + dur,
        chordSeq: pick([['Gm','Eb'], ['Gm','Cm'], ['Gm','Eb','Cm','Bb'], ['Cm','Bb']]),
        droneMode: Math.random() > 0.45,
        lv,
        randomMod: {
          bpm: Math.max(50, Math.min(120, bpmTarget + Math.floor((Math.random() * 14) - 7))),
          reverb: Math.max(0.08, Math.min(0.40, reverbWet + (Math.random() * 0.10 - 0.05))),
          arpFilter: 600 + Math.random() * 1200,
          arpRotate: Math.floor(Math.random() * 16),
        },
      };
    }
    function getNovelPhase(t) {
      if (!Number.isFinite(t) || t < 0) t = 0;
      while (novelPhases.length > 128 && novelPhases[0].end < t - 45) {
        novelPhases.shift();
      }
      while (true) {
        const last = novelPhases[novelPhases.length - 1];
        if (!last) {
          const first = createNovelPhase(scriptedTotal, activePhases[activePhases.length - 1].lv);
          novelCount++;
          novelPhases.push(first);
          if (t < first.end) return first;
          continue;
        }
        if (novelLocked && t >= last.end) return last;
        if (t < last.end) return last;
        const next = createNovelPhase(last.end, last.lv);
        novelCount++;
        novelPhases.push(next);
      }
    }
    function getPhase(t) {
      if (phaseLoopId && phaseLoopId !== 'novel') {
        const fixed = activePhases.find(p => p.id === phaseLoopId);
        if (fixed) return fixed;
      }
      if (phaseLoopId === 'novel') {
        return getNovelPhase(Math.max(scriptedTotal, t));
      }
      if (novelMode && t >= scriptedTotal) return getNovelPhase(t);
      return getScriptedPhase(t);
    }
    function getPhaseProgress(ph, t) {
      const phaseDuration = Math.max(0.001, (ph.end ?? 0) - (ph.start ?? 0));
      if (phaseLoopId && phaseLoopId === ph.id && !String(ph.id).startsWith('novel-')) {
        const rel = (((t - ph.start) % phaseDuration) + phaseDuration) % phaseDuration;
        return Math.max(0, Math.min(1, rel / phaseDuration));
      }
      if (String(ph.id).startsWith('novel-')) {
        const p = (t - ph.start) / phaseDuration;
        return Math.max(0, Math.min(1, p));
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

    /** Heard transport at scheduled time (output delay compensated). */
    function heardTransportAt(when) {
      const el = transportAt(when);
      const lag = nd.outputDelay ? nd.outputDelay.delayTime.value : 0;
      return Math.max(0, el - lag);
    }

    /** Transport time minus output delay — aligns UI progress with what speakers play. */
    function heardElapsedSec() {
      const el = elapsed();
      const lag = nd.outputDelay ? nd.outputDelay.delayTime.value : 0;
      return Math.max(0, el - lag);
    }

    // Layer → node name → scale factor (used by morphTo + per-layer analysers)
    const LAYER_MAP = {
      arp:      { node:'arpGain',   scale: 0.30 },
      echo:     { node:'echoGain',  scale: 0.20 },
      thump:    { node:'thumpGain', scale: 0.85 },
      piano:    { node:'pianoGain', scale: 0.90 },
      sub:      { node:'subGain',   scale: 0.13 },
      pad:      { node:'padGain',   scale: 0.20 },
      bass:     { node:'bassGain',  scale: 0.22 },
      shim:     { node:'shimGain',  scale: 0.12 },
      drone:    { node:'droneGain', scale: 0.30 },
      beatpulse:{ node:'pulseGain', scale: 0.55 },
      voices:   { node:'voiceGain', scale: layerConfigs.voices.gainScale },
    };

    function initAudio() {
      if (actx) return;
      const scale = getScaleData();
      const N = scale.N;
      const ARP = scale.ARP;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const master = actx.createGain(); master.gain.value = 0.42;

      // Oscilloscope tap — post output delay so waveform matches speakers
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      const outputDelay = actx.createDelay(16);
      nd.outputDelay = outputDelay;
      nd.outputDelayMax = 16;
      lastStripQuantSec = quantizeStripSec(arrangementOutputDelaySec);
      outputDelay.delayTime.setValueAtTime(lastStripQuantSec, actx.currentTime);
      master.connect(outputDelay);
      outputDelay.connect(actx.destination);
      outputDelay.connect(analyser);

      // Reverb
      const revBuf = actx.createBuffer(2, actx.sampleRate*1.6, actx.sampleRate);
      for (let ch=0; ch<2; ch++) {
        const d = revBuf.getChannelData(ch);
        for (let i=0; i<d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/d.length, 2.8);
      }
      const rev = actx.createConvolver(); rev.buffer = revBuf;
      const revG = actx.createGain(); revG.gain.value = reverbWet;
      rev.connect(revG); revG.connect(master);
      nd.rev = rev; nd.revG = revG;

      function o(type,freq,det=0) { const n=actx.createOscillator(); n.type=type; n.frequency.value=freq; if(det) n.detune.value=det; n.start(); return n; }
      function lpf(f,Q=0.7) { const n=actx.createBiquadFilter(); n.type='lowpass'; n.frequency.value=f; n.Q.value=Q; return n; }
      function hpf(f) { const n=actx.createBiquadFilter(); n.type='highpass'; n.frequency.value=f; return n; }
      function g(v) { const n=actx.createGain(); n.gain.value=v; return n; }

      // Arp
      const arpG=g(0), arpF=lpf(420,0.85);
      arpG.connect(arpF); arpF.connect(master); arpF.connect(nd.rev);
      const arpO=o('triangle',ARP[0]), arpO2=o('triangle',ARP[0]); arpO2.detune.value=8;
      o('sine',layerConfigs.arp.lfoHz).connect(g(1.1)).connect(arpO.frequency);
      arpO.connect(arpG); arpO2.connect(arpG);
      nd.arpGain=arpG; nd.arpFilt=arpF; nd.arpO=arpO; nd.arpO2=arpO2;

      // Echo (arp2)
      const dL=actx.createDelay(1); dL.delayTime.value=s16()*layerConfigs.echo.leftDelaySteps;
      const dR=actx.createDelay(1); dR.delayTime.value=s16()*layerConfigs.echo.rightDelaySteps;
      const mg=actx.createChannelMerger(2); dL.connect(mg,0,0); dR.connect(mg,0,1);
      const echoG=g(0); mg.connect(echoG); echoG.connect(master); echoG.connect(nd.rev);
      arpF.connect(dL); arpF.connect(dR);
      nd.echoGain=echoG; nd.dL=dL; nd.dR=dR;

      // Thump
      const thumpG=g(0); thumpG.connect(master); nd.thumpGain=thumpG;

      // Piano
      const pianoG=g(0); pianoG.connect(master); pianoG.connect(nd.rev); nd.pianoGain=pianoG;

      // Sub
      const subG=g(0); subG.connect(master);
      const subO1=o('sine',N.G1); subO1.connect(subG);
      const sh=g(layerConfigs.sub.overtoneMix); const subO2=o('sine',N.G2); subO2.connect(sh); sh.connect(subG);
      nd.subGain=subG; nd.subO1=subO1; nd.subO2=subO2;

      // Pad
      const padG=g(0); padG.connect(master); padG.connect(nd.rev);
      nd.padOscs = [];
      [['G3',0],['D4',5],['G2',0],['D3',3]].forEach(([name,d]) => {
        const ov=o('sine',N[name],d);
        const vib=o('sine',layerConfigs.pad.vibratoHz), vg=g(layerConfigs.pad.vibratoDepth); vib.connect(vg); vg.connect(ov.frequency);
        const lp=lpf(layerConfigs.pad.lpfHz,0.65), gn=g(layerConfigs.pad.voiceGain); ov.connect(lp); lp.connect(gn); gn.connect(padG);
        nd.padOscs.push({ osc: ov, name });
      });
      nd.padGain=padG;

      // Bass
      const bassG=g(0); bassG.connect(master); bassG.connect(nd.rev);
      const bO=o('sine',N.G2), bO2=o('sine',N.G2); bO2.detune.value=-5;
      const bL=lpf(380,0.7), bH=hpf(45); bO.connect(bL); bO2.connect(bL); bL.connect(bH); bH.connect(bassG);
      nd.bassGain=bassG; nd.bassO=bO; nd.bassO2=bO2;

      // Shimmer
      const shimG=g(0); shimG.connect(master); shimG.connect(nd.rev); nd.shimGain=shimG;

      // Drone + pulse
      const droneG=g(0); droneG.connect(master); droneG.connect(nd.rev); nd.droneGain=droneG;
      const pulseG=g(0); pulseG.connect(master); nd.pulseGain=pulseG;
      const drO1=o('sine',N.G1), drO2=o('sine',N.G1); drO2.detune.value=6;
      const drO3=o('sine',N.D2), drO4=o('sine',N.D2); drO4.detune.value=-4;
      const drLPF=lpf(layerConfigs.drone.lpfHz,0.6);
      drO1.connect(drLPF); drO2.connect(drLPF); drO3.connect(drLPF); drO4.connect(drLPF); drLPF.connect(droneG);
      nd.drO1=drO1; nd.drO2=drO2; nd.drO3=drO3; nd.drO4=drO4;

      // Ethereal voices
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
     */
    function ramp(param, val, tau=0.8, at=undefined) {
      if (!param) return;
      const t = at ?? actx.currentTime;
      param.cancelScheduledValues(t);
      param.setTargetAtTime(val, t, tau);
    }
    function volumeToGain(v) {
      if (v <= 1) return v * 0.42;
      // Boost range rises faster so "more volume" is clearly audible.
      const boost = Math.min(1, v - 1);
      return 0.42 + boost * 0.50; // max 0.92 at v=2
    }

    function morphLayerTau(name, isNovel) {
      if (isNovel) {
        if (name === 'piano') return 0.45;
        if (name === 'pad' || name === 'voices') return 3.4;
        return 2.2;
      }
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
      const isNovel = String(ph.id).startsWith('novel-');
      ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(ph.id), isNovel ? 3.0 : 2.35, at);
      for (const [name, {node, scale}] of Object.entries(LAYER_MAP)) {
        const phaseVal = lv[name] ?? 0;
        const mult = layerMult[name] ?? 1;
        const tau = morphLayerTau(name, isNovel);
        ramp(nd[node]?.gain, phaseVal * mult * scale, tau, at);
      }
      if (!ph.droneMode) ramp(nd.droneGain.gain, 0, 0.6, at);
      if (ph.randomMod) {
        bpmTarget = ph.randomMod.bpm;
        reverbWet = ph.randomMod.reverb;
        ramp(nd.revG?.gain, reverbWet, isNovel ? 2.0 : 0.7, at);
        if (arpFilterOverride === null) ramp(nd.arpFilt.frequency, ph.randomMod.arpFilter, isNovel ? 2.2 : 1.2, at);
      }
    }

    function retuneContinuousVoices(when) {
      if (!actx) return;
      const t = when ?? actx.currentTime;
      const { N } = getScaleData();
      if (nd.subO1) nd.subO1.frequency.setTargetAtTime(N.G1, t, 0.18);
      if (nd.subO2) nd.subO2.frequency.setTargetAtTime(N.G2, t, 0.2);
      if (nd.padOscs) nd.padOscs.forEach(v => v.osc.frequency.setTargetAtTime(N[v.name], t, 0.2));
      if (nd.drO1 && nd.drO2 && nd.drO3 && nd.drO4) {
        nd.drO1.frequency.setTargetAtTime(N.G1, t, 0.2);
        nd.drO2.frequency.setTargetAtTime(N.G1, t, 0.2);
        nd.drO3.frequency.setTargetAtTime(N.D2, t, 0.2);
        nd.drO4.frequency.setTargetAtTime(N.D2, t, 0.2);
      }
    }

    function getThumpBufferBase() {
      const sr = actx.sampleRate;
      if (thumpBufferBase && thumpBufferSr === sr) return thumpBufferBase;
      const dur = layerConfigs.thump.durationSec;
      const buf = actx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = layerConfigs.thump.startHz * Math.exp(-t * layerConfigs.thump.pitchDecay) + layerConfigs.thump.endHz;
        const env = Math.exp(-t * layerConfigs.thump.ampDecay);
        d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.85;
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
      tG.gain.value = ((tv * 0.52) / Math.max(0.001, gRead)) * vel;
      src.connect(tG);
      tG.connect(nd.thumpGain);
      src.start(when);
    }

    function getPianoPartialBuffer(f, ni, harm, amp, dec) {
      const sr = actx.sampleRate;
      const key = `${f.toFixed(3)}|${ni}|${harm}|${dec}|${sr}`;
      let buf = pianoPartialCache.get(key);
      if (buf) return buf;
      const dur = 2.2;
      buf = actx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const att = t < 0.004 ? t / 0.004 : 1;
        const decay = Math.exp(-t * (3.5 + ni * 0.4) * dec);
        d[i] = Math.sin(2 * Math.PI * f * t) * att * decay * amp * 0.52;
      }
      if (pianoPartialCache.size > 400) pianoPartialCache.clear();
      pianoPartialCache.set(key, buf);
      return buf;
    }

    function firePiano(when, chord, targetGain=null) {
      if (!chord) return;
      const pv = nd.pianoGain.gain.value * (layerMult.piano ?? 1);
      const gate = targetGain != null ? targetGain : pv;
      if (gate < 0.02) return;
      chord.notes.forEach((freq, ni) => {
        [[1, 1.0, 0.90], [2, 0.34, 0.50], [3, 0.16, 0.28], [4, 0.07, 0.15]].forEach(([harm, amp, dec]) => {
          const f = freq * harm;
          if (f > 8000) return;
          const buf = getPianoPartialBuffer(f, ni, harm, amp, dec);
          const src = actx.createBufferSource();
          src.buffer = buf;
          const nG = actx.createGain();
          nG.gain.value = pv * 0.26;
          src.connect(nG);
          nG.connect(nd.pianoGain);
          src.start(when + ni * 0.004);
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
      buf = actx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = freq * 1.5 * Math.exp(-t * layerConfigs.beatpulse.pitchGlide) + freq;
        const env = Math.exp(-t * layerConfigs.beatpulse.ampDecay);
        d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.75 * vel;
      }
      if (dronePulseCache.size > 32) dronePulseCache.clear();
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
      const vv = nd.voiceGain.gain.value * (layerMult.voices ?? 1);
      const gate = targetGain != null ? targetGain : vv;
      if (gate < 0.02) return;
      const dur = layerConfigs.voices.releaseSec;
      chord.notes.slice(0, 3).forEach((freq, idx) => {
        const osc = actx.createOscillator();
        const form = actx.createBiquadFilter();
        const env = actx.createGain();
        const vib = actx.createOscillator();
        const vibAmt = actx.createGain();

        osc.type = 'triangle';
        osc.frequency.value = freq * (idx === 1 ? 2 : 1);
        form.type = 'bandpass';
        form.frequency.value = layerConfigs.voices.formantHz + (idx * 140);
        form.Q.value = 1.4;

        vib.frequency.value = layerConfigs.voices.vibratoHz + idx * 0.3;
        vibAmt.gain.value = 2 + idx;
        vib.connect(vibAmt); vibAmt.connect(osc.frequency);

        env.gain.setValueAtTime(0.0, when);
        env.gain.linearRampToValueAtTime(vv * (0.34 - idx * 0.05), when + 0.08 + idx * 0.02);
        env.gain.setTargetAtTime(0.001, when + 0.15, dur * 0.75);

        osc.connect(form); form.connect(env); env.connect(nd.voiceGain);
        osc.start(when); vib.start(when);
        osc.stop(when + dur + 0.25); vib.stop(when + dur + 0.25);
      });
    }
    function setDroneFreq(f1, f2, when) {
      nd.drO1.frequency.setTargetAtTime(f1,when,0.15); nd.drO2.frequency.setTargetAtTime(f1,when,0.18);
      nd.drO3.frequency.setTargetAtTime(f2,when,0.15); nd.drO4.frequency.setTargetAtTime(f2,when,0.18);
    }

    const SCHEDULER_INTERVAL_MS = 25;
    const SCHEDULER_LOOKAHEAD_SEC = 0.1;
    const SCHEDULER_MAX_TICKS_PER_WAKE = 48;

    function getShimmerBuffer() {
      const sr = actx.sampleRate;
      const key = `${keyId}|${sr}`;
      if (shimmerBuffer && shimmerCacheKey === key) return shimmerBuffer;
      const len = Math.floor(sr * 0.10);
      const shBuf = actx.createBuffer(1, len, sr);
      const sd = shBuf.getChannelData(0);
      const g4 = tn('G4') * 2;
      for (let i = 0; i < sd.length; i++) {
        sd[i] = Math.sin(2 * Math.PI * g4 * i / sr) * Math.exp(-i / sr * 20) * 0.5;
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
    }

    function tick(whenIn) {
      if (!actx || !playing) return;
      const when = Math.max(whenIn, actx.currentTime);
      if (Math.abs(bpmTarget - bpm) > 0.01) {
        // Slew tempo to hide hard phase walls in novel mode.
        bpm += (bpmTarget - bpm) * 0.08;
      } else {
        bpm = bpmTarget;
      }
      const el = transportAt(when);
      maybeEmitPhaseMarker(el);
      const ph = getPhase(el);
      const lv = ph.lv || {};
      const { ARP, CHORDS, droneChords } = getScaleData();
      const idx = step % 16;
      const arpRotate = ph.randomMod?.arpRotate ?? 0;

      // ── Phase transition — MUST fire before any per-step scheduling so that
      //    morphTo's cancelScheduledValues(when) doesn't clobber events from
      //    earlier ticks that the lookahead already queued.
      if (ph !== currentPhase) {
        // Detect loop-back: scripted timeline wrapped (e.g. outro → intro).
        // Reset sequencer so arp pattern, chords, and drone start cleanly.
        // Only applies to scripted (non-novel) phases with a real previous phase.
        const isWrapBack = currentPhase
          && !String(ph.id).startsWith('novel-')
          && !String(currentPhase.id).startsWith('novel-')
          && ph.start < currentPhase.start;
        if (isWrapBack) resetSequencerCounters();
        currentPhase = ph;
        morphTo(ph, when);
        emit('phase', { id: ph.id, label: ph.label });
      }

      const elHeard = heardTransportAt(when);
      const phHeard = getPhase(elHeard);
      emit('beat', {
        step: idx,
        phase: phHeard.id,
        phaseLabel: phHeard.label,
        phaseProgress: getPhaseProgress(phHeard, elHeard),
        phaseStart: phHeard.start,
        phaseEnd: phHeard.end,
      });

      // Arp retrigger — runs AFTER morphTo so its cancelScheduledValues(when)
      // naturally supersedes morphTo's arpGain ramp for this same instant.
      const freq=ARP[(idx + arpRotate) % ARP.length], vel=VEL[idx], av=(lv.arp||0)*(layerMult.arp??1);
      nd.arpO.frequency.setValueAtTime(freq,when);
      nd.arpO2.frequency.setValueAtTime(freq,when);
      nd.arpGain.gain.cancelScheduledValues(when);
      nd.arpGain.gain.setValueAtTime(0,when);
      nd.arpGain.gain.linearRampToValueAtTime(av*vel*0.30, when+0.007);
      nd.arpGain.gain.setTargetAtTime(av*vel*0.08, when+0.007, s16()*0.65);

      if (idx===0 || idx===8) {
        const targetThump = (lv.thump ?? 0) * (layerMult.thump ?? 1) * LAYER_MAP.thump.scale;
        fireThump(when, idx===0 ? 1.0 : 0.88, targetThump);

        if (idx===0) {
          const seq = ph.chordSeq;
          const targetPiano = (lv.piano||0)*(layerMult.piano??1)*LAYER_MAP.piano.scale;
          if (seq && targetPiano > 0.02) {
            const chord = CHORDS[seq[pianoBarCount % seq.length]];
            firePiano(when, chord, targetPiano);
            nd.bassO.frequency.setTargetAtTime(chord.notes[0],when,0.10);
            nd.bassO2.frequency.setTargetAtTime(chord.notes[0],when,0.12);
          }
          const targetVoices = (lv.voices||0)*(layerMult.voices??1)*LAYER_MAP.voices.scale;
          if (seq && targetVoices > 0.02) {
            const chord = CHORDS[seq[pianoBarCount % seq.length]];
            fireVoices(when, chord, targetVoices);
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

      // Shimmer on upbeats
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
      step++;

      // Update echo delay times to current BPM
      nd.dL.delayTime.setTargetAtTime(s16()*layerConfigs.echo.leftDelaySteps, when, 0.1);
      nd.dR.delayTime.setTargetAtTime(s16()*layerConfigs.echo.rightDelaySteps, when, 0.1);
    }

    function beginPlayback() {
      if (!actx) return;
      if (playing) return;
      if (schedulerIntervalId) {
        clearInterval(schedulerIntervalId);
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
        schedulerLoop();
        schedulerIntervalId = setInterval(schedulerLoop, SCHEDULER_INTERVAL_MS);
        return;
      }

      playing = true;
      startTime = actx.currentTime;
      resetSequencerCounters();
      nextTickAt = startTime + 0.01;
      currentPhase = null;
      resetPhaseMarkerState();
      morphTo(getPhase(pausedAt));
      schedulerLoop();
      schedulerIntervalId = setInterval(schedulerLoop, SCHEDULER_INTERVAL_MS);
    }

    function applyArrangementStripTiming(sec) {
      const s = Math.max(0, Number(sec) || 0);
      arrangementLookaheadSec = s;
      arrangementOutputDelaySec = s;
      if (!nd.outputDelay || !nd.outputDelayMax || !actx) return;
      const q = quantizeStripSec(s);
      if (lastStripQuantSec === q) return;
      lastStripQuantSec = q;
      const p = nd.outputDelay.delayTime;
      const t0 = actx.currentTime;
      const t1 = t0 + 0.003;
      const cur = p.value;
      p.cancelScheduledValues(t0);
      p.setValueAtTime(cur, t0);
      p.setValueAtTime(q, t1);
    }

    function applyPresetInternal(preset) {
      if (!preset || preset.schemaVersion !== 1) return false;
      KEY_OFFSETS = { ...DEFAULT_PRESET.keyOffsets, ...preset.keyOffsets };
      BASE_N = { ...DEFAULT_PRESET.baseNotesHz, ...preset.baseNotesHz };
      VEL = preset.velocities.slice();
      arpPattern = preset.arpPattern.slice();
      NOVEL_LABELS = preset.novelLabels.slice();
      phaseFilterHzMap = { ...DEFAULT_PRESET.phaseFilterHz, ...(preset.phaseFilterHz || {}) };
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
        actx.resume().then(() => {
          beginPlayback();
        });
      },

      stop() {
        pausedAt = elapsed();
        playing = false;
        resetPhaseMarkerState();
        if (schedulerIntervalId) {
          clearInterval(schedulerIntervalId);
          schedulerIntervalId = null;
        }
        if (actx) actx.suspend();
      },

      /** Replace song data from a preset object (schema v1). Stops playback if active. */
      applyPreset(preset) {
        if (playing) {
          pausedAt = elapsed();
          playing = false;
          resetPhaseMarkerState();
          if (schedulerIntervalId) {
            clearInterval(schedulerIntervalId);
            schedulerIntervalId = null;
          }
          if (actx) actx.suspend();
        }
        if (!applyPresetInternal(preset)) return false;
        if (actx && nd.master) morphTo(getPhase(elapsed()));
        return true;
      },

      /** Metadata for the last-applied preset (id + name). */
      getPreset() {
        return { ...lastPresetMeta };
      },

      seekToPhase(id) {
        resetPhaseMarkerState();
        resetSequencerCounters();
        if (id === 'novel') {
          novelMode = true;
          pausedAt = scriptedTotal;
          currentPhase = null;
          if (playing && actx) {
            startTime = actx.currentTime;
            nextTickAt = actx.currentTime + 0.01;
            morphTo(getPhase(pausedAt));
          } else {
            // Engine not yet playing (play() promise pending) — stash for beginPlayback.
            pendingSeekPhaseId = id;
          }
          emit('phase', { id: 'novel', label: 'Novel Mode' });
          return;
        }
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
        return true;
      },

      getRemovedPhaseIds() {
        return PHASES.filter(p => disabledPhaseIds.has(p.id)).map(p => ({ id: p.id, label: p.label }));
      },

      setVolume(v) {
        volumeSetting = Math.max(0, Math.min(2, v));
        if (nd.master) nd.master.gain.setTargetAtTime(volumeToGain(volumeSetting), actx.currentTime, 0.3);
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

      setNovelMode(enabled) {
        novelMode = !!enabled;
        if (!novelMode) {
          novelPhases.length = 0;
          novelCount = 0;
        }
      },
      setNovelLock(enabled) {
        novelLocked = !!enabled;
      },
      setPhaseLoop(id) {
        if (id === null) { phaseLoopId = null; return; }
        if (id === 'novel' || activePhases.some(p => p.id === id)) {
          phaseLoopId = id;
        }
      },

      setBPM(newBpm) {
        bpmTarget = Math.max(50, Math.min(120, newBpm));
        if (!playing) bpm = bpmTarget;
        // Delay lines will sync on next tick
      },

      setReverb(wet) {
        reverbWet = Math.max(0, Math.min(0.5, wet));
        if (nd.revG) ramp(nd.revG.gain, reverbWet, 0.5);
      },

      setArpFilter(hz) {
        arpFilterOverride = hz === null ? null : Math.max(200, Math.min(6000, hz));
        if (nd.arpFilt) ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(currentPhase?.id), 0.3);
      },

      getAnalyser() { return analyser; },

      getLayerAnalysers() { return { ...layerAnalysers }; },

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
          novelMode,
          novelLocked,
          phaseLoopId,
          bpm,
          volume: volumeSetting,
          reverb: reverbWet,
          layers: { ...layerMult },
          phaseLevels: ph?.lv ?? {},
        };
      },

      /** Scripted next phase's `lv` map. Novel: mirrors current segment. */
      getNextPhaseLevels() {
        const ph = currentPhase || activePhases[0];
        if (!ph) return {};
        if (String(ph.id).startsWith('novel-')) {
          return { ...(ph.lv || {}) };
        }
        const idx = activePhases.findIndex(p => p.id === ph.id);
        if (idx < 0) return {};
        const nextPh = activePhases[(idx + 1) % activePhases.length];
        return { ...(nextPh.lv || {}) };
      },

      getPhases() {
        return [...activePhases.map(p => ({ id: p.id, label: p.label })), { id:'novel', label:'Novel (Post-Outro)' }];
      },
      getKeys() { return Object.keys(KEY_OFFSETS).map(id => ({ id, label: id })); },
      getLayerConfigs() { return { ...layerConfigs }; },

      /** futureW×frameMs; markers + DelayNode share 250ms-quantized strip; delayTime scheduled +3ms. */
      setArrangementLookaheadSec: applyArrangementStripTiming,
      setArrangementOutputDelaySec: applyArrangementStripTiming,

      on(event, cb) { if (listeners[event]) listeners[event].push(cb); },
      off(event, cb) { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb); },
    };
  }

  return { create };
})();

// CommonJS / ES module shim
if (typeof module !== 'undefined') module.exports = ProceduralMusic;
