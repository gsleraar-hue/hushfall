// Zet Nebula om in een radiozender voor het eigen netwerk: de gemengde audio wordt live naar MP3
// omgezet en naar de ingebouwde server gestuurd, waar een Sonos hem ophaalt.
(function () {
  class Stream {
    constructor(engine) {
      this.engine = engine;
      this.worker = null; this.tap = null; this.silent = null;
      this.active = false; this.bytesSent = 0;
      this.listeners = new Set();
    }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(type, data) { for (const fn of this.listeners) fn(type, data); }

    /** Begint met uitzenden. Vanaf hier loopt de audio ook door als er lokaal niets speelt. */
    async start() {
      if (this.active) return true;
      const ctx = this.engine.ensure();
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet niet beschikbaar');
        if (!this._workletLoaded) { await ctx.audioWorklet.addModule('tap-processor.js'); this._workletLoaded = true; }
        this.tap = new AudioWorkletNode(ctx, 'nebula-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { blockSize: 4096 } });
        // Aftakken ná de timer (uitfaden werkt dus ook op de Sonos) en vóór het hoofdvolume en dempen,
        // zodat het volume van je pc de uitzending niet stiller maakt.
        this.engine.tapPoint.connect(this.tap);
        // Een worklet levert alleen blokken zolang hij ergens naartoe gaat: naar een stille uitgang.
        this.silent = ctx.createGain(); this.silent.gain.value = 0;
        this.tap.connect(this.silent).connect(ctx.destination);

        this.worker = new Worker('mp3-worker.js');
        this.worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'stats') { this.bytesSent = m.bytesSent; this.emit('stats', m); }
          if (m.type === 'error') this.emit('error', m.message);
        };
        this.worker.postMessage({ type: 'start', sampleRate: ctx.sampleRate, bitrate: 128, pushUrl: 'stream/push' });
        this.tap.port.onmessage = (e) => {
          if (!this.worker) return;
          const { left, right } = e.data;
          this.worker.postMessage({ type: 'pcm', left, right }, [left.buffer, right.buffer]);
        };
        this.statsTimer = setInterval(() => this.worker && this.worker.postMessage({ type: 'stats' }), 2000);
        this.active = true;
        this.emit('state');
        return true;
      } catch (e) {
        this.stop();
        this.emit('error', e.message);
        return false;
      }
    }
    stop() {
      clearInterval(this.statsTimer);
      if (this.tap) { try { this.tap.port.postMessage('stop'); this.engine.tapPoint.disconnect(this.tap); this.tap.disconnect(); } catch {} this.tap = null; }
      if (this.silent) { try { this.silent.disconnect(); } catch {} this.silent = null; }
      if (this.worker) { const w = this.worker; this.worker = null; w.postMessage({ type: 'stop' }); setTimeout(() => w.terminate(), 1500); }
      this.active = false;
      this.emit('state');
    }
  }
  window.NebulaStream = Stream;
})();
