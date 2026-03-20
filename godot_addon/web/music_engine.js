// music_engine.js
// Full Web Audio synthesiser — injected into the browser context by music_manager.gd
// All the Lessons-style layers: arp, echo, thump, piano, sub, pad, bass, shimmer,
// drone hold/pulse element. Matches the interactive demo exactly.

(function () {
  if (window._music) return; // already initialised

  const BPM = 120;
  const S16 = 60 / BPM / 4;   // 0.125s sixteenth
  const TOTAL = 120;           // 2-min loop

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
    Gm: { name:'Gm',  notes:[N.G2, N.D3, N.G3, N.Bb3, N.D4] },
    Eb: { name:'Eb',  notes:[N.G2, N.Eb4*0.5, N.G3, N.Bb3, N.Eb4] },
    Cm: { name:'Cm',  notes:[N.C3, N.G3, N.C4, N.Eb4] },
    Bb: { name:'Bb',  notes:[58.27, N.F3, N.Bb3, N.D4] },
  };

  const PHASES = [
    { id:'intro',   label:'Intro',    start:0,   end:16,  chordSeq:null,                       droneMode:false,
      lv:{arp:0.82,arp2:0.00,thump:0.70,piano:0.00,sub:0.32,pad:0.00,bass:0.28,shim:0.00,drone:0.00,beatpulse:0.00} },
    { id:'build1',  label:'Build 1',  start:16,  end:32,  chordSeq:['Gm','Eb'],               droneMode:false,
      lv:{arp:0.82,arp2:0.42,thump:0.72,piano:0.52,sub:0.38,pad:0.00,bass:0.45,shim:0.00,drone:0.00,beatpulse:0.00} },
    { id:'verse1',  label:'Verse',    start:32,  end:52,  chordSeq:['Gm','Eb'],               droneMode:false,
      lv:{arp:0.80,arp2:0.46,thump:0.72,piano:0.55,sub:0.42,pad:0.48,bass:0.50,shim:0.00,drone:0.00,beatpulse:0.00} },
    { id:'chorus1', label:'Chorus 1', start:52,  end:68,  chordSeq:['Gm','Eb','Cm','Bb'],    droneMode:true,
      lv:{arp:0.78,arp2:0.48,thump:0.72,piano:0.58,sub:0.46,pad:0.52,bass:0.52,shim:0.46,drone:0.72,beatpulse:0.60} },
    { id:'break',   label:'Break',    start:68,  end:80,  chordSeq:['Gm','Eb'],               droneMode:false,
      lv:{arp:0.84,arp2:0.08,thump:0.76,piano:0.50,sub:0.35,pad:0.08,bass:0.30,shim:0.00,drone:0.00,beatpulse:0.00} },
    { id:'chorus2', label:'Chorus 2', start:80,  end:104, chordSeq:['Gm','Eb','Cm','Bb'],    droneMode:true,
      lv:{arp:0.80,arp2:0.50,thump:0.72,piano:0.60,sub:0.48,pad:0.55,bass:0.54,shim:0.52,drone:0.78,beatpulse:0.65} },
    { id:'outro',   label:'Outro',    start:104, end:120, chordSeq:['Gm','Eb'],               droneMode:false,
      lv:{arp:0.72,arp2:0.15,thump:0.65,piano:0.42,sub:0.28,pad:0.12,bass:0.22,shim:0.10,drone:0.00,beatpulse:0.00} },
  ];

  let actx=null, nodes={}, startTime=0, pausedAt=0, playing=false;
  let step=0, pianoBarCount=0, currentPhase=null;
  let gdCallback=null;
  let droneState={ mode:'hold', beatsLeft:16, chordIdx:0, pulseFreq:N.G1 };

  function getPhase(t){ const tt=t%TOTAL; for(let i=PHASES.length-1;i>=0;i--){ if(tt>=PHASES[i].start) return PHASES[i]; } return PHASES[0]; }
  function elapsed(){ if(!playing||!actx) return pausedAt; return Math.min(TOTAL, pausedAt+(actx.currentTime-startTime)); }

  function emit(type, payload){ if(gdCallback) try{ gdCallback(type, payload); }catch(e){} }

  function initAudio(){
    if(actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const master = actx.createGain(); master.gain.value = 0.42; master.connect(actx.destination);

    const revBuf = actx.createBuffer(2, actx.sampleRate*1.6, actx.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=revBuf.getChannelData(ch); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.8); }
    const rev = actx.createConvolver(); rev.buffer=revBuf;
    const revG = actx.createGain(); revG.gain.value=0.16; rev.connect(revG); revG.connect(master);

    function o(type,freq,det=0){ const n=actx.createOscillator(); n.type=type; n.frequency.value=freq; if(det) n.detune.value=det; n.start(); return n; }
    function lpf(f,Q=0.7){ const n=actx.createBiquadFilter(); n.type='lowpass'; n.frequency.value=f; n.Q.value=Q; return n; }
    function hpf(f){ const n=actx.createBiquadFilter(); n.type='highpass'; n.frequency.value=f; return n; }
    function g(v){ const n=actx.createGain(); n.gain.value=v; return n; }

    // Arp
    const arpG=g(0), arpF=lpf(420,0.85);
    arpG.connect(arpF); arpF.connect(master); arpF.connect(rev);
    const arpO=o('triangle',ARP[0]), arpO2=o('triangle',ARP[0]); arpO2.detune.value=8;
    o('sine',5.1).connect(g(1.1)).connect(arpO.frequency);
    arpO.connect(arpG); arpO2.connect(arpG);
    nodes.arpGain=arpG; nodes.arpFilt=arpF; nodes.arpO=arpO; nodes.arpO2=arpO2;

    // Echo delay (stereo)
    const dL=actx.createDelay(1); dL.delayTime.value=S16*2;
    const dR=actx.createDelay(1); dR.delayTime.value=S16*3;
    const mg=actx.createChannelMerger(2); dL.connect(mg,0,0); dR.connect(mg,0,1);
    const echoG=g(0); mg.connect(echoG); echoG.connect(master); echoG.connect(rev);
    arpF.connect(dL); arpF.connect(dR);
    nodes.echoGain=echoG;

    // Thump
    const thumpG=g(0); thumpG.connect(master); nodes.thumpGain=thumpG;

    // Piano
    const pianoG=g(0); pianoG.connect(master); pianoG.connect(rev); nodes.pianoGain=pianoG;

    // Sub
    const subG=g(0); subG.connect(master);
    o('sine',N.G1).connect(subG); const sh=g(0.24); o('sine',N.G2).connect(sh); sh.connect(subG);
    nodes.subGain=subG;

    // Pad
    const padG=g(0); padG.connect(master); padG.connect(rev);
    [[N.G3,0],[N.D4,5],[N.G2,0],[N.D3,3]].forEach(([f,d])=>{ const ov=o('sine',f,d); const vib=o('sine',4.6); const vg=g(0.82); vib.connect(vg); vg.connect(ov.frequency); const lp=lpf(820,0.65),gn=g(0.17); ov.connect(lp); lp.connect(gn); gn.connect(padG); });
    nodes.padGain=padG;

    // Bass
    const bassG=g(0); bassG.connect(master); bassG.connect(rev);
    const bO=o('sine',N.G2), bO2=o('sine',N.G2); bO2.detune.value=-5;
    const bL=lpf(380,0.7), bH=hpf(45); bO.connect(bL); bO2.connect(bL); bL.connect(bH); bH.connect(bassG);
    nodes.bassGain=bassG; nodes.bassO=bO; nodes.bassO2=bO2;

    // Shimmer
    const shimG=g(0); shimG.connect(master); shimG.connect(rev); nodes.shimGain=shimG;

    // Drone + pulse
    const droneG=g(0); droneG.connect(master); droneG.connect(rev); nodes.droneGain=droneG;
    const pulseG=g(0); pulseG.connect(master); nodes.pulseGain=pulseG;
    const drO1=o('sine',N.G1), drO2=o('sine',N.G1); drO2.detune.value=6;
    const drO3=o('sine',N.D2), drO4=o('sine',N.D2); drO4.detune.value=-4;
    const drLPF=lpf(280,0.6); drO1.connect(drLPF); drO2.connect(drLPF); drO3.connect(drLPF); drO4.connect(drLPF); drLPF.connect(droneG);
    nodes.drO1=drO1; nodes.drO2=drO2; nodes.drO3=drO3; nodes.drO4=drO4;

    nodes.master=master;
  }

  function fireThump(when, vel=1.0){
    const tv=nodes.thumpGain.gain.value; if(tv<0.02) return;
    const sr=actx.sampleRate, dur=0.55;
    const buf=actx.createBuffer(1,Math.floor(sr*dur),sr); const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++){ const t=i/sr,f=140*Math.exp(-t*8)+60,env=Math.exp(-t*5.5); d[i]=(Math.sin(2*Math.PI*f*t)*env*0.85)*vel; }
    const src=actx.createBufferSource(); src.buffer=buf;
    const tG=actx.createGain(); tG.gain.value=tv*0.52; src.connect(tG); tG.connect(nodes.master); src.start(when);
  }

  function firePiano(when, chord){
    if(!chord) return;
    const pv=nodes.pianoGain.gain.value; if(pv<0.02) return;
    chord.notes.forEach((freq,ni)=>{
      [[1,1.0,0.90],[2,0.34,0.50],[3,0.16,0.28],[4,0.07,0.15]].forEach(([harm,amp,dec])=>{
        const f=freq*harm; if(f>8000) return;
        const sr=actx.sampleRate, dur=2.2;
        const buf=actx.createBuffer(1,Math.floor(sr*dur),sr); const d=buf.getChannelData(0);
        for(let i=0;i<d.length;i++){ const t=i/sr,att=t<0.004?t/0.004:1,decay=Math.exp(-t*(3.5+ni*0.4)*dec); d[i]=Math.sin(2*Math.PI*f*t)*att*decay*amp*0.52; }
        const src=actx.createBufferSource(); src.buffer=buf;
        const nG=actx.createGain(); nG.gain.value=pv*0.26; src.connect(nG); nG.connect(nodes.pianoGain); src.start(when+ni*0.004);
      });
    });
    emit('chord', chord.name);
  }

  function fireDronePulse(when, freq, vel=1.0){
    const pv=nodes.pulseGain.gain.value; if(pv<0.02) return;
    const sr=actx.sampleRate, dur=0.45;
    const buf=actx.createBuffer(1,Math.floor(sr*dur),sr); const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++){ const t=i/sr,f=freq*1.5*Math.exp(-t*3)+freq,env=Math.exp(-t*6.0); d[i]=Math.sin(2*Math.PI*f*t)*env*0.75*vel; }
    const src=actx.createBufferSource(); src.buffer=buf;
    const pG2=actx.createGain(); pG2.gain.value=pv*0.48; src.connect(pG2); pG2.connect(nodes.pulseGain); src.start(when);
  }

  function setDroneFreq(f1, f2, when){
    nodes.drO1.frequency.setTargetAtTime(f1,when,0.15); nodes.drO2.frequency.setTargetAtTime(f1,when,0.18);
    nodes.drO3.frequency.setTargetAtTime(f2,when,0.15); nodes.drO4.frequency.setTargetAtTime(f2,when,0.18);
  }

  function ramp(param,val,tau=0.8){ param.cancelScheduledValues(actx.currentTime); param.setTargetAtTime(val,actx.currentTime,tau); }

  function getFC(id){ return {intro:400,build1:580,verse1:780,chorus1:1100,'break':520,chorus2:1200,outro:620}[id]||700; }

  function morphTo(ph){
    const lv=ph.lv||{};
    ramp(nodes.arpFilt.frequency, getFC(ph.id), 1.8);
    ramp(nodes.echoGain.gain,  (lv.arp2||0)*0.20, 1.2);
    ramp(nodes.thumpGain.gain, (lv.thump||0)*0.85, 0.5);
    ramp(nodes.pianoGain.gain, (lv.piano||0)*0.90, 0.8);
    ramp(nodes.subGain.gain,   (lv.sub||0)*0.13,   1.4);
    ramp(nodes.padGain.gain,   (lv.pad||0)*0.20,   2.0);
    ramp(nodes.bassGain.gain,  (lv.bass||0)*0.22,  1.0);
    ramp(nodes.shimGain.gain,  (lv.shim||0)*0.12,  1.0);
    ramp(nodes.pulseGain.gain, (lv.beatpulse||0)*0.55, 0.6);
    if(!ph.droneMode) ramp(nodes.droneGain.gain, 0, 0.6);
  }

  function tick(when){
    if(!actx||!playing) return;
    const ph=getPhase(elapsed()%TOTAL);
    const lv=ph.lv||{};
    const idx=step%16;

    // Arp retrigger
    const freq=ARP[idx], vel=VEL[idx], av=lv.arp||0;
    nodes.arpO.frequency.setValueAtTime(freq,when);
    nodes.arpO2.frequency.setValueAtTime(freq,when);
    nodes.arpGain.gain.cancelScheduledValues(when);
    nodes.arpGain.gain.setValueAtTime(0,when);
    nodes.arpGain.gain.linearRampToValueAtTime(av*vel*0.30,when+0.007);
    nodes.arpGain.gain.setTargetAtTime(av*vel*0.08,when+0.007,S16*0.65);

    // Thump every 2 beats
    if(idx===0||idx===8){
      fireThump(when, idx===0?1.0:0.88);

      if(idx===0){
        // Piano every bar
        const seq=ph.chordSeq;
        if(seq && (lv.piano||0)>0.02){
          const chord=CHORDS[seq[pianoBarCount%seq.length]];
          firePiano(when, chord);
          const bf=chord.notes[0];
          nodes.bassO.frequency.setTargetAtTime(bf,when,0.10);
          nodes.bassO2.frequency.setTargetAtTime(bf,when,0.12);
        }
        pianoBarCount++;
      }

      // Drone/pulse state machine
      const droneChords=[{r:N.G1,f:N.D2,name:'Gm'},{r:58.27,f:87.31,name:'Eb'}];
      const ds=droneState;
      if(ph.droneMode && (lv.drone||0)>0.02){
        if(ds.mode==='hold'){
          if(ds.beatsLeft===16){
            const ch=droneChords[ds.chordIdx%droneChords.length];
            setDroneFreq(ch.r, ch.f, when);
            ramp(nodes.droneGain.gain, (lv.drone||0)*0.30, 0.6);
          }
          ds.beatsLeft--;
          if(ds.beatsLeft<=0){
            ramp(nodes.droneGain.gain, 0.02, 0.3);
            ds.mode='pulse'; ds.beatsLeft=16;
            ds.pulseFreq=droneChords[ds.chordIdx%droneChords.length].r;
          }
        } else {
          fireDronePulse(when, ds.pulseFreq, 0.85);
          ds.beatsLeft--;
          if(ds.beatsLeft<=0){ ds.chordIdx++; ds.mode='hold'; ds.beatsLeft=16; }
        }
      } else if(!ph.droneMode){
        ds.mode='hold'; ds.beatsLeft=16; ds.chordIdx=0;
        ramp(nodes.droneGain.gain, 0, 0.5);
      }
    }

    // Shimmer on upbeats
    if([2,6,10,14].includes(idx) && (lv.shim||0)>0.02){
      const sv=lv.shim;
      const shBuf=actx.createBuffer(1,Math.floor(actx.sampleRate*0.10),actx.sampleRate);
      const sd=shBuf.getChannelData(0);
      for(let i=0;i<sd.length;i++) sd[i]=Math.sin(2*Math.PI*(N.G4*2)*i/actx.sampleRate)*Math.exp(-i/actx.sampleRate*20)*0.5;
      const shSrc=actx.createBufferSource(); shSrc.buffer=shBuf;
      const shG2=actx.createGain(); shG2.gain.value=sv*0.14; shSrc.connect(shG2); shG2.connect(nodes.shimGain); shSrc.start(when);
    }

    step++;
    const nextWhen=when+S16;

    // Check phase transition
    const elap=elapsed()%TOTAL;
    const ph2=getPhase(elap);
    if(ph2!==currentPhase){
      currentPhase=ph2;
      morphTo(ph2);
      emit('phase', ph2.id+'|'+ph2.label);
    }

    nodes._tickTO=setTimeout(()=>tick(actx.currentTime+0.002),(nextWhen-actx.currentTime-0.005)*1000);
  }

  // ── Public API (called from GDScript via JavaScriptBridge.eval) ──────────

  window._music = {
    play() {
      if(playing) return;
      initAudio();
      actx.resume().then(()=>{
        playing=true; startTime=actx.currentTime;
        currentPhase=null;
        morphTo(getPhase(pausedAt%TOTAL));
        tick(actx.currentTime+0.01);
      });
    },
    stop() {
      pausedAt=elapsed(); playing=false;
      clearTimeout(nodes._tickTO);
      if(actx) actx.suspend();
    },
    seekToPhase(id) {
      for(let i=0;i<PHASES.length;i++){
        if(PHASES[i].id===id){ pausedAt=PHASES[i].start; currentPhase=null; if(playing&&actx){ startTime=actx.currentTime; morphTo(PHASES[i]); } return; }
      }
    },
    setVolume(v) {
      if(nodes.master) nodes.master.gain.setTargetAtTime(Math.max(0,Math.min(1,v))*0.42, actx.currentTime, 0.3);
    },
    setGDCallback(cb) {
      gdCallback=cb;
    },
  };

})();
