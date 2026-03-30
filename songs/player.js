(async function () {
  const cfg = window.STANDALONE_SONG || {};
  const titleEl = document.getElementById('song-title');
  const mediaKeepalive = document.getElementById('media-keepalive');
  let engine = null;

  function setTitle(text) {
    if (titleEl) titleEl.textContent = text;
    document.title = text;
  }

  function startKeepalive() {
    try {
      const stream = engine?.getMediaStream?.();
      if (stream) mediaKeepalive.srcObject = stream;
      mediaKeepalive.volume = 0.01;
      mediaKeepalive.play().catch(() => {});
    } catch (_) {}
  }

  function stopKeepalive() {
    try {
      mediaKeepalive.pause();
      mediaKeepalive.srcObject = null;
    } catch (_) {}
  }

  function updateMediaSessionMetadata() {
    if (!engine || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: cfg.name || 'Sea Shanty',
        artist: cfg.name || 'Sea Shanty',
        album: 'Sci-Fi Sea Shanty',
      });
      navigator.mediaSession.playbackState = engine.getState()?.playing ? 'playing' : 'paused';
    } catch (_) {}
  }

  function ensurePlayback() {
    if (!engine) return;
    engine.play();
    startKeepalive();
    updateMediaSessionMetadata();
  }

  if (!cfg.file || !cfg.name) {
    document.body.classList.add('is-error');
    setTitle('Song Not Found');
    return;
  }

  setTitle(cfg.name);

  try {
    const preset = await fetch(`../../presets/${cfg.file}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${cfg.file}`);
      return r.json();
    });
    engine = ProceduralMusic.create({ preset });
    window.__PROC_ENGINE = engine;
    engine.setKey(preset.defaults?.key ?? 'Dm');
    engine.setPhaseLoop(null);
    ensurePlayback();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && engine?.getState?.()?.playing) {
        engine.resumeAudioContext?.().then(() => startKeepalive()).catch(() => {});
      }
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && engine?.getState?.()?.playing) {
        engine.resumeAudioContext?.().then(() => startKeepalive()).catch(() => {});
      }
    });
    window.addEventListener('pointerdown', ensurePlayback, { passive: true });
    window.addEventListener('keydown', ensurePlayback);
    updateMediaSessionMetadata();
  } catch (err) {
    console.error('Standalone song player failed', err);
    stopKeepalive();
    document.body.classList.add('is-error');
    setTitle(cfg.name);
  }
})();
