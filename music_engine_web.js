// music_engine_web.js
// Procedural Music Studio — standalone Web Audio engine
// Extended from the BurnBridgers Godot addon's music_engine.js.
// No Godot/JavaScriptBridge dependency. Drop into any HTML page.
//
// Public API:
//   const engine = ProceduralMusic.create();
//   engine.play()
//   engine.stop()
//   engine.seekToPhase(id)          // 'intro'|'build1'|'verse1'|'chorus1'|'break'|'chorus2'|'outro'
//   engine.setVolume(0-1)
//   engine.setLayer(name, 0-1)      // 'arp'|'echo'|'thump'|'piano'|'sub'|'pad'|'bass'|'shim'|'drone'|'beatpulse'
//   engine.setBPM(bpm)              // 60-200, default 120
//   engine.setReverb(0-1)           // wet amount, default 0.16
//   engine.setArpFilter(hz)         // arp LPF cutoff, default auto per phase
//   engine.getAnalyser()            // returns AnalyserNode for oscilloscope
//   engine.getState()               // { playing, phase, chord, bpm, layers, volume }
//   engine.on(event, callback)      // 'phase' | 'chord' | 'beat'
//   engine.off(event, callback)

const ProceduralMusic = (() => {

  function create() {
    let bpm = 120;
    let s16 = () => 60 / bpm / 4;   // sixteenth note duration (live)

    const TOTAL = 120; // 2-min loop

    const N = {
      G1:49.00, D2:73.42, G2:98.00, Bb2:116.54, C3:130.81,
      D3:146.83, F3:174.61, G3:196.00, A3:220.00, Bb3:233.08,
      C4:261.63, D4:293.66, Eb4:311.13, F4:349.23, G4:392.00, Bb4:466.16,
    };

    const ARP = [N.G3,N.D4,N.Bb3,N.G4, N.F4,N.D4,N.Bb3,N.G3,
                 N.A3,N.D4,N.C4,N.G4,  N.Eb4,N.C4,N.Bb3,N.G3];
    const VEL = [0.88,0.38,0.54,0.32, 0.72,0.36,0.50,0.28,
                 0.80,0.40,0.56,0.30, 0.66,0.34,0.48,0.26];

    const CHORDS = {
      Gm: { name:'Gm', notes:[N.G2, N.D3, N.G3, N.Bb3, N.D4] },
      Eb: { name:'Eb', notes:[N.G2, N.Eb4*0.5, N.G3, N.Bb3, N.Eb4] },
      Cm: { name:'Cm', notes:[N.C3, N.G3, N.C4, N.Eb4] },
      Bb: { name:'Bb', notes:[58.27, N.F3, N.Bb3, N.D4] },
    };

    const PHASES = [
      { id:'intro',   label:'Intro',    start:0,   end:16,  chordSeq:null,                     droneMode:false,
        lv:{arp:0.82,echo:0.00,thump:0.70,piano:0.00,sub:0.32,pad:0.00,bass:0.28,shim:0.00,drone:0.00,beatpulse:0.00} },
      { id:'build1',  label:'Build 1',  start:16,  end:32,  chordSeq:['Gm','Eb'],              droneMode:false,
        lv:{arp:0.82,echo:0.42,thump:0.72,piano:0.52,sub:0.38,pad:0.00,bass:0.45,shim:0.00,drone:0.00,beatpulse:0.00} },
      { id:'verse1',  label:'Verse',    start:32,  end:52,  chordSeq:['Gm','Eb'],              droneMode:false,
        lv:{arp:0.80,echo:0.46,thump:0.72,piano:0.55,sub:0.42,pad:0.48,bass:0.50,shim:0.00,drone:0.00,beatpulse:0.00} },
      { id:'chorus1', label:'Chorus 1', start:52,  end:68,  chordSeq:['Gm','Eb','Cm','Bb'],   droneMode:true,
        lv:{arp:0.78,echo:0.48,thump:0.72,piano:0.58,sub:0.46,pad:0.52,bass:0.52,shim:0.46,drone:0.72,beatpulse:0.60} },
      { id:'break',   label:'Break',    start:68,  end:80,  chordSeq:['Gm','Eb'],              droneMode:false,
        lv:{arp:0.84,echo:0.08,thump:0.76,piano:0.50,sub:0.35,pad:0.08,bass:0.30,shim:0.00,drone:0.00,beatpulse:0.00} },
      { id:'chorus2', label:'Chorus 2', start:80,  end:104, chordSeq:['Gm','Eb','Cm','Bb'],   droneMode:true,
        lv:{arp:0.80,echo:0.50,thump:0.72,piano:0.60,sub:0.48,pad:0.55,bass:0.54,shim:0.52,drone:0.78,beatpulse:0.65} },
      { id:'outro',   label:'Outro',    start:104, end:120, chordSeq:['Gm','Eb'],              droneMode:false,
        lv:{arp:0.72,echo:0.15,thump:0.65,piano:0.42,sub:0.28,pad:0.12,bass:0.22,shim:0.10,drone:0.00,beatpulse:0.00} },
    ];

    // User overrides: 0-1 multipliers applied on top of phase lv values
    const layerMult = {arp:1,echo:1,thump:1,piano:1,sub:1,pad:1,bass:1,shim:1,drone:1,beatpulse:1};
    let reverbWet = 0.16;
    let arpFilterOverride = null; // null = auto per phase

    let actx=null, nd={}, startTime=0, pausedAt=0, playing=false;
    let step=0, pianoBarCount=0, currentPhase=null;
    let droneState={ mode:'hold', beatsLeft:16, chordIdx:0, pulseFreq:N.G1 };
    let analyser=null;

    // Event emitter
    const listeners = { phase:[], chord:[], beat:[] };
    function emit(type, data) { (listeners[type]||[]).forEach(fn => { try { fn(data); } catch(e){} }); }

    function getPhase(t) {
      const tt = t % TOTAL;
      for (let i = PHASES.length-1; i >= 0; i--) {
        if (tt >= PHASES[i].start) return PHASES[i];
      }
      return PHASES[0];
    }
    function elapsed() {
      if (!playing || !actx) return pausedAt;
      return Math.min(TOTAL, pausedAt + (actx.currentTime - startTime));
    }

    function initAudio() {
      if (actx) return;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const master = actx.createGain(); master.gain.value = 0.42;

      // Analyser tap — connects to master but doesn't block signal to destination
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      master.connect(analyser);
      master.connect(actx.destination);

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
      o('sine',5.1).connect(g(1.1)).connect(arpO.frequency);
      arpO.connect(arpG); arpO2.connect(arpG);
      nd.arpGain=arpG; nd.arpFilt=arpF; nd.arpO=arpO; nd.arpO2=arpO2;

      // Echo (arp2)
      const dL=actx.createDelay(1); dL.delayTime.value=s16()*2;
      const dR=actx.createDelay(1); dR.delayTime.value=s16()*3;
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
      o('sine',N.G1).connect(subG);
      const sh=g(0.24); o('sine',N.G2).connect(sh); sh.connect(subG);
      nd.subGain=subG;

      // Pad
      const padG=g(0); padG.connect(master); padG.connect(nd.rev);
      [[N.G3,0],[N.D4,5],[N.G2,0],[N.D3,3]].forEach(([f,d]) => {
        const ov=o('sine',f,d);
        const vib=o('sine',4.6), vg=g(0.82); vib.connect(vg); vg.connect(ov.frequency);
        const lp=lpf(820,0.65), gn=g(0.17); ov.connect(lp); lp.connect(gn); gn.connect(padG);
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
      const drLPF=lpf(280,0.6);
      drO1.connect(drLPF); drO2.connect(drLPF); drO3.connect(drLPF); drO4.connect(drLPF); drLPF.connect(droneG);
      nd.drO1=drO1; nd.drO2=drO2; nd.drO3=drO3; nd.drO4=drO4;

      nd.master=master;
    }

    // Layer → node name → scale factor
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
    };

    function phaseFilterFreq(id) {
      return {intro:400,build1:580,verse1:780,chorus1:1100,'break':520,chorus2:1200,outro:620}[id]||700;
    }

    function ramp(param, val, tau=0.8) {
      if (!param) return;
      param.cancelScheduledValues(actx.currentTime);
      param.setTargetAtTime(val, actx.currentTime, tau);
    }

    function morphTo(ph) {
      const lv = ph.lv || {};
      ramp(nd.arpFilt.frequency, arpFilterOverride ?? phaseFilterFreq(ph.id), 1.8);
      for (const [name, {node, scale}] of Object.entries(LAYER_MAP)) {
        const phaseVal = lv[name] ?? 0;
        const mult = layerMult[name] ?? 1;
        ramp(nd[node]?.gain, phaseVal * mult * scale, name === 'pad' ? 2.0 : 0.8);
      }
      if (!ph.droneMode) ramp(nd.droneGain.gain, 0, 0.6);
    }

    function fireThump(when, vel=1.0) {
      const tv = nd.thumpGain.gain.value * (layerMult.thump ?? 1);
      if (tv < 0.02) return;
      const sr=actx.sampleRate, dur=0.55;
      const buf=actx.createBuffer(1,Math.floor(sr*dur),sr);
      const d=buf.getChannelData(0);
      for (let i=0;i<d.length;i++) { const t=i/sr,f=140*Math.exp(-t*8)+60,env=Math.exp(-t*5.5); d[i]=Math.sin(2*Math.PI*f*t)*env*0.85*vel; }
      const src=actx.createBufferSource(); src.buffer=buf;
      const tG=actx.createGain(); tG.gain.value=tv*0.52; src.connect(tG); tG.connect(nd.master); src.start(when);
    }

    function firePiano(when, chord) {
      if (!chord) return;
      const pv = nd.pianoGain.gain.value * (layerMult.piano ?? 1);
      if (pv < 0.02) return;
      chord.notes.forEach((freq,ni) => {
        [[1,1.0,0.90],[2,0.34,0.50],[3,0.16,0.28],[4,0.07,0.15]].forEach(([harm,amp,dec]) => {
          const f=freq*harm; if (f>8000) return;
          const sr=actx.sampleRate, dur=2.2;
          const buf=actx.createBuffer(1,Math.floor(sr*dur),sr); const d=buf.getChannelData(0);
          for (let i=0;i<d.length;i++) { const t=i/sr,att=t<0.004?t/0.004:1,decay=Math.exp(-t*(3.5+ni*0.4)*dec); d[i]=Math.sin(2*Math.PI*f*t)*att*decay*amp*0.52; }
          const src=actx.createBufferSource(); src.buffer=buf;
          const nG=actx.createGain(); nG.gain.value=pv*0.26; src.connect(nG); nG.connect(nd.pianoGain); src.start(when+ni*0.004);
        });
      });
      emit('chord', chord.name);
    }

    function fireDronePulse(when, freq, vel=1.0) {
      const pv = nd.pulseGain.gain.value;
      if (pv < 0.02) return;
      const sr=actx.sampleRate, dur=0.45;
      const buf=actx.createBuffer(1,Math.floor(sr*dur),sr); const d=buf.getChannelData(0);
      for (let i=0;i<d.length;i++) { const t=i/sr,f=freq*1.5*Math.exp(-t*3)+freq,env=Math.exp(-t*6.0); d[i]=Math.sin(2*Math.PI*f*t)*env*0.75*vel; }
      const src=actx.createBufferSource(); src.buffer=buf;
      const pG2=actx.createGain(); pG2.gain.value=pv*0.48; src.connect(pG2); pG2.connect(nd.master); src.start(when);
    }

    function setDroneFreq(f1, f2, when) {
      nd.drO1.frequency.setTargetAtTime(f1,when,0.15); nd.drO2.frequency.setTargetAtTime(f1,when,0.18);
      nd.drO3.frequency.setTargetAtTime(f2,when,0.15); nd.drO4.frequency.setTargetAtTime(f2,when,0.18);
    }

    function tick(when) {
      if (!actx || !playing) return;
      const ph = getPhase(elapsed() % TOTAL);
      const lv = ph.lv || {};
      const idx = step % 16;

      emit('beat', { step: idx, phase: ph.id });

      // Arp retrigger
      const freq=ARP[idx], vel=VEL[idx], av=(lv.arp||0)*(layerMult.arp??1);
      nd.arpO.frequency.setValueAtTime(freq,when);
      nd.arpO2.frequency.setValueAtTime(freq,when);
      nd.arpGain.gain.cancelScheduledValues(when);
      nd.arpGain.gain.setValueAtTime(0,when);
      nd.arpGain.gain.linearRampToValueAtTime(av*vel*0.30, when+0.007);
      nd.arpGain.gain.setTargetAtTime(av*vel*0.08, when+0.007, s16()*0.65);

      if (idx===0 || idx===8) {
        fireThump(when, idx===0 ? 1.0 : 0.88);

        if (idx===0) {
          const seq = ph.chordSeq;
          if (seq && (lv.piano||0)*(layerMult.piano??1) > 0.02) {
            const chord = CHORDS[seq[pianoBarCount % seq.length]];
            firePiano(when, chord);
            nd.bassO.frequency.setTargetAtTime(chord.notes[0],when,0.10);
            nd.bassO2.frequency.setTargetAtTime(chord.notes[0],when,0.12);
          }
          pianoBarCount++;
        }

        // Drone/pulse state machine
        const droneChords = [{r:N.G1,f:N.D2},{r:58.27,f:87.31}];
        const ds = droneState;
        if (ph.droneMode && (lv.drone||0)*(layerMult.drone??1) > 0.02) {
          if (ds.mode==='hold') {
            if (ds.beatsLeft===16) {
              const ch=droneChords[ds.chordIdx % droneChords.length];
              setDroneFreq(ch.r, ch.f, when);
              ramp(nd.droneGain.gain, (lv.drone||0)*(layerMult.drone??1)*0.30, 0.6);
            }
            ds.beatsLeft--;
            if (ds.beatsLeft<=0) { ramp(nd.droneGain.gain, 0.02, 0.3); ds.mode='pulse'; ds.beatsLeft=16; ds.pulseFreq=droneChords[ds.chordIdx % droneChords.length].r; }
          } else {
            fireDronePulse(when, ds.pulseFreq, 0.85);
            ds.beatsLeft--;
            if (ds.beatsLeft<=0) { ds.chordIdx++; ds.mode='hold'; ds.beatsLeft=16; }
          }
        } else if (!ph.droneMode) {
          ds.mode='hold'; ds.beatsLeft=16; ds.chordIdx=0;
          ramp(nd.droneGain.gain, 0, 0.5);
        }
      }

      // Shimmer on upbeats
      if ([2,6,10,14].includes(idx) && (lv.shim||0)*(layerMult.shim??1) > 0.02) {
        const sv = (lv.shim||0)*(layerMult.shim??1);
        const shBuf=actx.createBuffer(1,Math.floor(actx.sampleRate*0.10),actx.sampleRate);
        const sd=shBuf.getChannelData(0);
        for (let i=0;i<sd.length;i++) sd[i]=Math.sin(2*Math.PI*(N.G4*2)*i/actx.sampleRate)*Math.exp(-i/actx.sampleRate*20)*0.5;
        const shSrc=actx.createBufferSource(); shSrc.buffer=shBuf;
        const shG2=actx.createGain(); shG2.gain.value=sv*0.14; shSrc.connect(shG2); shG2.connect(nd.shimGain); shSrc.start(when);
      }

      step++;

      // Phase transition check
      const ph2 = getPhase(elapsed() % TOTAL);
      if (ph2 !== currentPhase) {
        currentPhase = ph2;
        morphTo(ph2);
        emit('phase', { id: ph2.id, label: ph2.label });
      }

      // Update echo delay times to current BPM
      nd.dL.delayTime.setTargetAtTime(s16()*2, when, 0.1);
      nd.dR.delayTime.setTargetAtTime(s16()*3, when, 0.1);

      const nextWhen = when + s16();
      nd._tickTO = setTimeout(() => tick(actx.currentTime + 0.002), (nextWhen - actx.currentTime - 0.005) * 1000);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    return {
      play() {
        if (playing) return;
        initAudio();
        actx.resume().then(() => {
          playing = true;
          startTime = actx.currentTime;
          currentPhase = null;
          morphTo(getPhase(pausedAt % TOTAL));
          tick(actx.currentTime + 0.01);
        });
      },

      stop() {
        pausedAt = elapsed();
        playing = false;
        clearTimeout(nd._tickTO);
        if (actx) actx.suspend();
      },

      seekToPhase(id) {
        for (let i=0; i<PHASES.length; i++) {
          if (PHASES[i].id === id) {
            pausedAt = PHASES[i].start;
            currentPhase = null;
            if (playing && actx) { startTime = actx.currentTime; morphTo(PHASES[i]); }
            emit('phase', { id: PHASES[i].id, label: PHASES[i].label });
            return;
          }
        }
      },

      setVolume(v) {
        v = Math.max(0, Math.min(1, v));
        if (nd.master) nd.master.gain.setTargetAtTime(v * 0.42, actx.currentTime, 0.3);
      },

      // name: 'arp'|'echo'|'thump'|'piano'|'sub'|'pad'|'bass'|'shim'|'drone'|'beatpulse'
      // value: 0-1 multiplier on top of the phase's base level
      setLayer(name, value) {
        value = Math.max(0, Math.min(1, value));
        layerMult[name] = value;
        if (!actx || !nd.master) return; // will be applied on next morphTo if not yet initialised
        const map = LAYER_MAP[name];
        if (!map) return;
        const ph = currentPhase || getPhase(elapsed() % TOTAL);
        const baseVal = ph?.lv?.[name] ?? 0;
        ramp(nd[map.node]?.gain, baseVal * value * map.scale, 0.3);
      },

      setBPM(newBpm) {
        bpm = Math.max(60, Math.min(200, newBpm));
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

      getState() {
        const ph = currentPhase || (PHASES[0]);
        return {
          playing,
          phase: ph?.id,
          phaseLabel: ph?.label,
          bpm,
          volume: nd.master ? nd.master.gain.value / 0.42 : 1,
          reverb: reverbWet,
          layers: { ...layerMult },
          phaseLevels: ph?.lv ?? {},
        };
      },

      getPhases() { return PHASES.map(p => ({ id: p.id, label: p.label })); },

      on(event, cb) { if (listeners[event]) listeners[event].push(cb); },
      off(event, cb) { if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== cb); },
    };
  }

  return { create };
})();

// CommonJS / ES module shim
if (typeof module !== 'undefined') module.exports = ProceduralMusic;
