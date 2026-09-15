// Turns Hushfall into a radio station for your own network: the mixed audio is converted to MP3
// live and sent to the built-in server, where a Sonos picks it up.
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

    /** Starts broadcasting. From here on the audio keeps running even when nothing plays locally. */
    async start() {
      if (this.active) return true;
      const ctx = this.engine.ensure();
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet not available');
        if (!this._workletLoaded) { await ctx.audioWorklet.addModule('tap-processor.js'); this._workletLoaded = true; }
        this.tap = new AudioWorkletNode(ctx, 'hushfall-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { blockSize: 4096 } });
        // Branch off after the timer (so fading out works on the Sonos too) and before the master
        // volume and mute, so the volume of your pc does not quieten the broadcast.
        this.engine.tapPoint.connect(this.tap);
        // A worklet only delivers blocks while it goes somewhere: into a silent output.
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
  window.HushfallStream = Stream;
})();
