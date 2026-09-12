// Audio-engine: Web Audio met bussen (hoofd, effecten, ruis), geluidslagen die loopen,
// een ruisgenerator, radio via <audio> en een timer met uitfaden.
(function () {
  class Engine {
    constructor() {
      this.ctx = null;
      this.layers = new Map(); // id -> Layer
      this.volumes = { master: 0.8, main: 1, fx: 1, noise: 0.5, radio: 0.8 };
      this.muted = false;
      this.noise = { on: false, color: 'roze', tone: 6000, hp: 40, gain: 0.5, nodes: null };
      this.radio = { el: null, station: null, playing: false };
      this.playing = false;
      this.listeners = new Set();
    }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(type, data) { for (const fn of this.listeners) fn(type, data); }

    ensure() {
      if (!this.ctx) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
        this.ctx = ctx;
        // Keten: bussen -> mix -> timer -> hoofdvolume -> dempen -> luidspreker.
        // De uitzending naar Sonos takt af op `tapPoint` (na de timer, vóór volume en dempen), zodat
        // uitfaden ook daar geldt maar het volume van je pc de uitzending niet stiller maakt.
        this.mix = ctx.createGain();
        this.fade = ctx.createGain();   // timer-uitfaden
        this.master = ctx.createGain(); // hoofdvolume
        this.mute = ctx.createGain();   // dempen
        this.mix.connect(this.fade).connect(this.master).connect(this.mute).connect(ctx.destination);
        this.tapPoint = this.fade;
        this.bus = {};
        for (const b of ['main', 'fx', 'noise']) {
          this.bus[b] = ctx.createGain();
          this.bus[b].connect(this.mix);
        }
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    applyVolumes() {
      if (this.ctx) {
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(this.volumes.master, t, 0.03);
        this.bus.main.gain.setTargetAtTime(this.volumes.main, t, 0.03);
        this.bus.fx.gain.setTargetAtTime(this.volumes.fx, t, 0.03);
        this.bus.noise.gain.setTargetAtTime(this.volumes.noise, t, 0.03);
        this.mute.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      }
      if (this.radio.el) this.radio.el.volume = this.muted ? 0 : Math.min(1, this.volumes.master * this.volumes.radio);
      this.emit('volumes');
    }
    setVolume(bus, v) { this.volumes[bus] = Math.max(0, Math.min(1, v)); this.applyVolumes(); }
    setMuted(m) { this.muted = m; this.applyVolumes(); this.emit('state'); }

    // ---- Lagen -------------------------------------------------------------
    /** Start (of update) een laag. origin: 'main' (vanaf Sferen) of 'fx' (vanaf Mixer). */
    async addLayer(sound, { gain = 0.7, origin = 'fx' } = {}) {
      this.ensure();
      let layer = this.layers.get(sound.id);
      if (layer) { layer.origin = origin; layer.setGain(gain); if (this.playing) layer.play(); this.emit('layers'); return layer; }
      layer = sound.synth ? new SynthLayer(this, sound, origin) : new Layer(this, sound, origin);
      this.layers.set(sound.id, layer);
      layer.setGain(gain);
      this.emit('layers');
      if (this.playing || this.layers.size === 1) { this.playing = true; await layer.play(); this.emit('state'); }
      return layer;
    }
    removeLayer(id) {
      const l = this.layers.get(id);
      if (!l) return;
      l.destroy();
      this.layers.delete(id);
      if (!this.layers.size && !this.noise.on && !this.radio.playing) { this.playing = false; }
      this.emit('layers'); this.emit('state');
    }
    /** Vervangt alle lagen die vanaf Sferen gestart zijn door dit geluid. */
    async playMain(sound, gain = 0.8) {
      for (const [id, l] of [...this.layers]) if (l.origin === 'main' && id !== sound.id) this.removeLayer(id);
      this.playing = true;
      await this.addLayer(sound, { gain, origin: 'main' });
      this.emit('state');
    }
    clearMain() { for (const [id, l] of [...this.layers]) if (l.origin === 'main') this.removeLayer(id); }
    clearAll() { for (const id of [...this.layers.keys()]) this.removeLayer(id); }
    mainLayers() { return [...this.layers.values()].filter((l) => l.origin === 'main'); }

    async play() {
      this.ensure();
      this.playing = true;
      await Promise.all([...this.layers.values()].map((l) => l.play()));
      if (this.noise.on) this.startNoise();
      if (this.radio.station && this.radio.el) this.radio.el.play().catch(() => {});
      this.emit('state');
    }
    pause() {
      this.playing = false;
      for (const l of this.layers.values()) l.pause();
      this.stopNoiseNodes();
      if (this.radio.el) this.radio.el.pause();
      this.emit('state');
    }
    toggle() { return this.playing ? this.pause() : this.play(); }
    hasContent() { return this.layers.size > 0 || this.noise.on || !!this.radio.station; }

    // ---- Ruisgenerator -------------------------------------------------------
    noiseBuffer(color) {
      this._buffers = this._buffers || {};
      if (this._buffers[color]) return this._buffers[color];
      const ctx = this.ctx; const sr = ctx.sampleRate; const len = sr * 5;
      const buf = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, prevW = 0, prevB = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          let v;
          if (color === 'wit' || color === 'grijs') v = w;
          else if (color === 'roze') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            v = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else if (color === 'bruin') { last = (last + 0.02 * w) / 1.02; v = last * 3.5; }
          else if (color === 'blauw') { v = (w - prevW) * 0.5; prevW = w; }
          else { const bl = (w - prevW) * 0.5; prevW = w; v = (bl - prevB) * 0.5; prevB = bl; } // violet
          d[i] = v;
        }
        // normaliseren
        let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
        const k = peak ? 0.7 / peak : 1; for (let i = 0; i < len; i++) d[i] *= k;
      }
      this._buffers[color] = buf;
      return buf;
    }
    startNoise() {
      this.ensure();
      this.stopNoiseNodes();
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(this.noise.color); src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = this.noise.hp;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.noise.tone;
      const g = ctx.createGain(); g.gain.value = 0;
      let chain = src.connect(hp).connect(lp);
      if (this.noise.color === 'grijs') { // grofweg gelijk voor het oor: middentonen dempen
        const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 2500; peak.Q.value = 0.7; peak.gain.value = -12;
        const lows = ctx.createBiquadFilter(); lows.type = 'lowshelf'; lows.frequency.value = 200; lows.gain.value = 8;
        chain = chain.connect(peak).connect(lows);
      }
      chain.connect(g).connect(this.bus.noise);
      src.start();
      g.gain.setTargetAtTime(this.noise.gain, ctx.currentTime, 0.4);
      this.noise.nodes = { src, hp, lp, g };
    }
    stopNoiseNodes() {
      const n = this.noise.nodes; if (!n) return;
      this.noise.nodes = null;
      const t = this.ctx.currentTime;
      n.g.gain.setTargetAtTime(0, t, 0.25);
      setTimeout(() => { try { n.src.stop(); } catch {} n.src.disconnect(); }, 1200);
    }
    setNoise(patch) {
      const colorChanged = patch.color && patch.color !== this.noise.color;
      Object.assign(this.noise, patch);
      if (this.noise.on) {
        this.ensure();
        if (!this.playing) { this.play(); } // ruis aanzetten start het geluid altijd, ook als er niets anders speelt
        else if (!this.noise.nodes || colorChanged) { this.startNoise(); }
        else {
          const t = this.ctx.currentTime;
          this.noise.nodes.lp.frequency.setTargetAtTime(this.noise.tone, t, 0.05);
          this.noise.nodes.hp.frequency.setTargetAtTime(this.noise.hp, t, 0.05);
          this.noise.nodes.g.gain.setTargetAtTime(this.noise.gain, t, 0.05);
        }
      } else this.stopNoiseNodes();
      this.emit('noise'); this.emit('state');
    }
    hasContentExcept(what) { return (what !== 'layers' && this.layers.size > 0) || (what !== 'radio' && !!this.radio.station); }

    // ---- Radio ---------------------------------------------------------------
    playRadio(station) {
      if (!this.radio.el) {
        const el = new Audio(); el.preload = 'none';
        el.addEventListener('playing', () => { this.radio.playing = true; this.emit('radio'); this.emit('state'); });
        el.addEventListener('pause', () => { this.radio.playing = false; this.emit('radio'); });
        el.addEventListener('error', () => { this.radio.playing = false; this.emit('radio-error', station); this.emit('radio'); });
        el.addEventListener('waiting', () => this.emit('radio'));
        this.radio.el = el;
      }
      this.radio.station = station;
      this.radio.el.src = station.url;
      this.radio.el.volume = this.muted ? 0 : Math.min(1, this.volumes.master * this.volumes.radio);
      this.playing = true;
      this.radio.el.play().catch(() => this.emit('radio-error', station));
      this.emit('radio'); this.emit('state');
    }
    stopRadio() {
      if (this.radio.el) { this.radio.el.pause(); this.radio.el.removeAttribute('src'); this.radio.el.load(); }
      this.radio.station = null; this.radio.playing = false;
      if (!this.layers.size && !this.noise.on) this.playing = false;
      this.emit('radio'); this.emit('state');
    }

    // ---- Timer (uitfaden) ----------------------------------------------------
    fadeOut(seconds) {
      return new Promise((resolve) => {
        if (!this.ctx) return resolve();
        const t = this.ctx.currentTime;
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setValueAtTime(this.fade.gain.value, t);
        this.fade.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.5, seconds));
        if (this.radio.el) {
          const start = this.radio.el.volume; const t0 = performance.now();
          const iv = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
            this.radio.el.volume = start * (1 - k);
            if (k >= 1) clearInterval(iv);
          }, 200);
        }
        setTimeout(() => { this.pause(); this.applyVolumes(); resolve(); }, Math.max(0.5, seconds) * 1000 + 100);
      });
    }
  }

  /** Eén loopend geluid (via <audio> zodat lange bestanden weinig geheugen kosten). */
  class Layer {
    constructor(engine, sound, origin) {
      this.engine = engine; this.sound = sound; this.origin = origin; this.gainValue = 0.7;
      const ctx = engine.ctx;
      this.el = new Audio(sound.file); this.el.loop = true; this.el.preload = 'auto'; this.el.crossOrigin = 'anonymous';
      this.src = ctx.createMediaElementSource(this.el);
      this.gain = ctx.createGain(); this.gain.gain.value = 0;
      this.src.connect(this.gain).connect(origin === 'main' ? engine.bus.main : engine.bus.fx);
      this.ready = new Promise((res) => { this.el.addEventListener('canplay', res, { once: true }); this.el.addEventListener('error', res, { once: true }); });
      this.el.addEventListener('error', () => engine.emit('layer-error', sound));
      this.startedOnce = false;
    }
    setGain(v) {
      this.gainValue = Math.max(0, Math.min(1, v));
      if (this.el.paused) return;
      this.gain.gain.setTargetAtTime(this.gainValue, this.engine.ctx.currentTime, 0.05);
    }
    async play() {
      if (!this.el.paused) return;
      // willekeurig startpunt zodat meerdere lagen niet synchroon beginnen
      try { if (!this.startedOnce && this.el.duration && isFinite(this.el.duration)) this.el.currentTime = Math.random() * this.el.duration * 0.8; } catch {}
      this.startedOnce = true;
      this.gain.gain.cancelScheduledValues(this.engine.ctx.currentTime);
      this.gain.gain.setValueAtTime(0, this.engine.ctx.currentTime);
      try { await this.el.play(); } catch (e) { return; }
      this.gain.gain.setTargetAtTime(this.gainValue, this.engine.ctx.currentTime, 0.6);
    }
    pause() {
      if (this.el.paused) return;
      const t = this.engine.ctx.currentTime;
      this.gain.gain.setTargetAtTime(0, t, 0.2);
      const el = this.el;
      setTimeout(() => { if (this.engine.layers.get(this.sound.id) === this && !this.engine.playing) el.pause(); else if (!this.engine.layers.has(this.sound.id)) el.pause(); }, 900);
    }
    destroy() {
      const t = this.engine.ctx.currentTime;
      this.gain.gain.setTargetAtTime(0, t, 0.15);
      const { el, src, gain } = this;
      setTimeout(() => { el.pause(); el.removeAttribute('src'); el.load(); try { src.disconnect(); gain.disconnect(); } catch {} }, 700);
    }
  }

  /**
   * Eén laag die Thrum zelf maakt met Web Audio (zie synth.js). Kost geen bestand en herhaalt nooit.
   * De generator wordt bij pauze afgebroken zodat hij geen rekentijd meer kost.
   */
  class SynthLayer {
    constructor(engine, sound, origin) {
      this.engine = engine; this.sound = sound; this.origin = origin; this.gainValue = 0.7;
      const ctx = engine.ctx;
      this.gain = ctx.createGain(); this.gain.gain.value = 0;
      this.gain.connect(origin === 'main' ? engine.bus.main : engine.bus.fx);
      this.gen = null; this.stopTimer = null;
      this.ready = Promise.resolve();
    }
    get running() { return !!this.gen; }
    setGain(v) {
      this.gainValue = Math.max(0, Math.min(1, v));
      if (this.gen) this.gain.gain.setTargetAtTime(this.gainValue, this.engine.ctx.currentTime, 0.05);
    }
    async play() {
      clearTimeout(this.stopTimer); this.stopTimer = null;
      const t = this.engine.ctx.currentTime;
      if (!this.gen) {
        try { this.gen = window.ThrumSynth.create(this.sound.synth, this.engine.ctx, this.gain); }
        catch (e) { this.engine.emit('layer-error', this.sound); return; }
        this.gain.gain.cancelScheduledValues(t); this.gain.gain.setValueAtTime(0, t);
      }
      this.gain.gain.setTargetAtTime(this.gainValue, t, 0.8);
    }
    pause() {
      if (!this.gen) return;
      this.gain.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.3);
      this.stopTimer = setTimeout(() => { this.gen?.stop(); this.gen = null; }, 1600);
    }
    destroy() {
      clearTimeout(this.stopTimer);
      this.gain.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.15);
      const gen = this.gen, gain = this.gain; this.gen = null;
      setTimeout(() => { gen?.stop(); try { gain.disconnect(); } catch {} }, 900);
    }
  }

  window.ThrumEngine = Engine;
})();
