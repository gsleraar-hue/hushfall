// Nebula's eigen geluiden: alles hier wordt live gemaakt met Web Audio. Geen bestanden, geen
// herhaling: regen, wind, vuur, vogels, krekels, café, en generatieve muziek (ambient, lo-fi jazz,
// speeldoos, kerstklokken). Elke generator geeft { stop() } terug en speelt naar `out`.
(function () {
  const R = Math.random;
  const rnd = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Gedeelde buffers per AudioContext ------------------------------------------
  const cache = new WeakMap();
  function buffers(ctx) {
    if (cache.has(ctx)) return cache.get(ctx);
    const sr = ctx.sampleRate, len = sr * 4;
    const make = (fill) => { const b = ctx.createBuffer(1, len, sr); const d = b.getChannelData(0); fill(d); let p = 0; for (let i = 0; i < len; i++) p = Math.max(p, Math.abs(d[i])); const k = p ? 0.8 / p : 1; for (let i = 0; i < len; i++) d[i] *= k; return b; };
    const white = make((d) => { for (let i = 0; i < len; i++) d[i] = R() * 2 - 1; });
    const pink = make((d) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < len; i++) { const w = R() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; } });
    const brown = make((d) => { let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (R() * 2 - 1)) / 1.02; d[i] = l; } });
    // Impulsresponsen met één kanaal. Convolutie is verreweg de duurste bewerking in Web Audio en de
    // kosten lopen recht op met de lengte én het aantal kanalen: een kerkgalm van 8 seconden in stereo
    // kostte gemeten 0.36 van een processorkern, mono nog 0.22 en mono van 5 seconden 0.17. Met één
    // kanaal blijft het stereobeeld van het drooggeluid gewoon staan; alleen de staart is mono, en dat
    // hoor je bij een galmstaart niet. Alles draait op één audiothread, dus dit is de grens die telt.
    const impulse = (sec, decay) => { const n = Math.floor(sr * sec); const b = ctx.createBuffer(1, n, sr); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, decay); return b; };
    // irKerk: een grote stenen kerk galmt lang na en dooft traag uit; daar is gregoriaans op geschreven.
    const o = { white, pink, brown, irLong: impulse(3, 3.2), irRoom: impulse(1.1, 2.6), irKerk: impulse(5, 2.1) };
    cache.set(ctx, o);
    return o;
  }

  // ---- Planner: roept fn(t) aan met audiotijd, ruim vooruit zodat ook een verborgen venster doorloopt --
  class Sched {
    constructor(ctx) { this.ctx = ctx; this.tasks = []; this.iv = setInterval(() => this.tick(), 200); }
    every(gap, fn, delay = 0.05) { const task = { t: this.ctx.currentTime + delay, gap, fn }; this.tasks.push(task); this.tick(); return task; }
    tick() { const horizon = this.ctx.currentTime + 1.8; for (const task of this.tasks) { let guard = 0; while (task.t < horizon && guard++ < 400) { try { task.fn(task.t); } catch (e) { /* stil */ } task.t += Math.max(0.004, typeof task.gap === 'function' ? task.gap(task.t) : task.gap); } } }
    stop() { clearInterval(this.iv); this.tasks = []; }
  }

  // ---- Bouwstenen --------------------------------------------------------------------
  function loopNoise(ctx, color) { const s = ctx.createBufferSource(); s.buffer = buffers(ctx)[color]; s.loop = true; s.start(); return s; }
  function filt(ctx, type, freq, Q = 1) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (Q != null) f.Q.value = Q; return f; }
  function gainNode(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function panNode(ctx, p = 0) { const n = ctx.createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n; }
  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  /** Korte ruisflard met filter en envelop. */
  function burst(ctx, out, { t, dur = 0.05, color = 'white', type = 'bandpass', freq = 2000, Q = 1, gain = 0.3, attack = 0.003, pan = 0, rate = 1, freqEnd = null }) {
    const b = buffers(ctx)[color];
    const src = ctx.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const f = filt(ctx, type, freq, Q); if (freqEnd) f.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    const g = gainNode(ctx, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + attack + dur);
    chain(src, f, g, panNode(ctx, pan), out);
    src.start(t, R() * (b.duration - dur - attack - 0.1)); src.stop(t + attack + dur + 0.05);
  }
  /** Toon met harmonischen en envelop (voor bellen, piano-achtig, pads). */
  function tone(ctx, out, { t, freq, dur = 1, type = 'sine', gain = 0.2, attack = 0.01, release = null, pan = 0, partials = [[1, 1]], detune = 0, glideTo = null, lowpass = null }) {
    const g = gainNode(ctx, 0); const rel = release ?? dur * 0.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + Math.max(0, dur - attack)); g.gain.exponentialRampToValueAtTime(0.0004, t + dur + rel);
    let dest = g;
    if (lowpass) { const lp = filt(ctx, 'lowpass', lowpass, 0.7); lp.connect(g); dest = lp; }
    for (const [ratio, amp] of partials) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * ratio; o.detune.value = detune;
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo * ratio, t + dur);
      const pg = gainNode(ctx, amp); o.connect(pg).connect(dest); o.start(t); o.stop(t + dur + rel + 0.05);
    }
    chain(g, panNode(ctx, pan), out);
  }
  /** Druppel: klik plus een resonantie die snel in toonhoogte zakt. Zo klinkt water op een oppervlak. */
  function plink(ctx, out, { t, freq, gain = 0.08, pan = 0, decay = 0.07 }) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.55), t + decay);
    const g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0004, t + decay);
    const p = panNode(ctx, pan); chain(o, g, p, out); o.start(t); o.stop(t + decay + 0.02);
    burst(ctx, out, { t, dur: 0.004, color: 'white', type: 'highpass', freq: freq * 1.6, Q: 0.7, gain: gain * 0.7, attack: 0.0008, pan });
  }
  /** Knap van brandend hout: scherpe klik met een korte, lage naklank. */
  function crackle(ctx, out, { t, gain = 0.15, pan = 0, big = false }) {
    burst(ctx, out, { t, dur: big ? 0.012 : 0.005, color: 'white', type: 'highpass', freq: big ? 1800 : 3500, Q: 0.8, gain, attack: 0.0006, pan });
    const f = big ? rnd(90, 190) : rnd(200, 520);
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.03);
    const g = gainNode(ctx, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * (big ? 1.1 : 0.5), t + 0.002); g.gain.exponentialRampToValueAtTime(0.0004, t + (big ? 0.09 : 0.035));
    chain(o, g, panNode(ctx, pan), out); o.start(t); o.stop(t + 0.12);
  }
  /** Vogeltoon: glijdende grondtoon met tweede harmonische, vibrato en een ademhapje aan het begin. */
  function birdNote(ctx, out, { t, f0, f1, dur, gain = 0.08, pan = 0, vib = 0, harm = 0.14 }) {
    const g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.25));
    g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.02);
    const p = panNode(ctx, pan); chain(g, p, out);
    let lg = null;
    if (vib) { const lfo = ctx.createOscillator(); lfo.frequency.value = vib; lg = gainNode(ctx, f0 * 0.03); chain(lfo, lg); lfo.start(t); lfo.stop(t + dur + 0.05); }
    for (const [mult, amp] of [[1, 1], [2, harm], [3, harm * 0.3]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0 * mult, t); o.frequency.exponentialRampToValueAtTime(Math.max(120, f1 * mult), t + dur);
      if (lg) lg.connect(o.frequency);
      const og = gainNode(ctx, amp); chain(o, og, g); o.start(t); o.stop(t + dur + 0.05);
    }
    burst(ctx, out, { t, dur: 0.008, color: 'white', freq: f0 * 1.2, Q: 4, gain: gain * 0.25, attack: 0.001, pan });
  }
  /**
   * Galm naar een uitgang. Een convolutiegalm is verreweg de duurste knoop in Web Audio, dus per
   * uitgang en soort wordt er precies één gemaakt en hergebruikt. Zonder dat kregen generatoren die
   * galm in een planner aanmaakten er elke keer een bij, wat het geluid langzaam liet haperen.
   */
  const revCache = new WeakMap();
  function reverb(ctx, out, kind = 'irLong', wet = 0.35) {
    let perOut = revCache.get(out);
    if (!perOut) { perOut = new Map(); revCache.set(out, perOut); }
    const sleutel = `${kind}:${wet.toFixed(2)}`;
    if (perOut.has(sleutel)) return perOut.get(sleutel);
    const conv = ctx.createConvolver(); conv.buffer = buffers(ctx)[kind];
    const dry = gainNode(ctx, 1 - wet * 0.5), w = gainNode(ctx, wet); const inp = gainNode(ctx, 1);
    inp.connect(dry).connect(out); inp.connect(conv).connect(w).connect(out);
    perOut.set(sleutel, inp);
    return inp;
  }
  /**
   * Speelt een reeks noten één voor één af via de planner. Een hele melodie in één keer aanmaken gaf
   * een piek van honderden audioknopen tegelijk, en dat hoor je als hapering. Zo blijft de belasting vlak.
   * `maakReeks` levert de volgende reeks, `speel(t, item)` geeft terug hoelang tot de volgende noot.
   */
  function speelReeks(sched, maakReeks, speel, pauzeNa = () => 4, start = 1.5) {
    let rij = [], volgende = start;
    sched.every(() => volgende, (t) => {
      if (!rij.length) rij = maakReeks() || [];
      if (!rij.length) { volgende = 2; return; }
      const duur = speel(t, rij.shift()) || 0.4;
      volgende = duur + (rij.length ? 0 : pauzeNa());
    }, start);
  }
  /** Zachte willekeurige wandeling van een AudioParam. */
  function wander(ctx, sched, param, min, max, every = 2, smooth = 1.2) {
    let v = rnd(min, max);
    sched.every(() => rnd(every * 0.6, every * 1.4), (t) => { v = clamp(v + rnd(-1, 1) * (max - min) * 0.25, min, max); param.setTargetAtTime(v, t, smooth); });
  }
  const stopAll = (nodes, sched, ctx) => () => { sched?.stop(); for (const n of nodes) { try { n.stop?.(); } catch {} try { n.disconnect?.(); } catch {} } };

  // ---- Natuur en omgeving -----------------------------------------------------------------
  function rain(ctx, out, { intensity = 0.5 }) {
    const sched = new Sched(ctx); const nodes = [];
    // Verre regen is één dichte massa druppels: een brede sisband plus een zachtere lage body.
    const hiss = loopNoise(ctx, 'white'); const hHp = filt(ctx, 'highpass', 1400 + 900 * intensity, 0.6); const hLp = filt(ctx, 'lowpass', 7000 + 4000 * intensity, 0.6);
    const hissGain = gainNode(ctx, 0.06 + 0.14 * intensity); chain(hiss, hHp, hLp, hissGain, out); nodes.push(hiss);
    const body = loopNoise(ctx, 'pink'); const bBp = filt(ctx, 'bandpass', 700 + 400 * intensity, 0.5);
    const bodyGain = gainNode(ctx, 0.1 + 0.2 * intensity); chain(body, bBp, bodyGain, out); nodes.push(body);
    wander(ctx, sched, hissGain.gain, hissGain.gain.value * 0.75, hissGain.gain.value * 1.25, 4, 3);
    wander(ctx, sched, bodyGain.gain, bodyGain.gain.value * 0.8, bodyGain.gain.value * 1.2, 5, 3.5);
    wander(ctx, sched, bBp.frequency, 500, 1300, 6, 4);
    if (intensity > 0.55) { const rumble = loopNoise(ctx, 'brown'); chain(rumble, filt(ctx, 'lowpass', 200, 0.6), gainNode(ctx, 0.18 * intensity), out); nodes.push(rumble); }
    // Druppels dichtbij: elk een eigen resonantie, dus nooit twee dezelfde tikjes.
    sched.every(() => rnd(0.03, 0.14) / (0.35 + intensity), (t) => plink(ctx, out, { t, freq: rnd(900, 3600), gain: rnd(0.02, 0.07) * (0.7 + intensity * 0.6), pan: rnd(-1, 1), decay: rnd(0.03, 0.09) }));
    // Zware druppels van een dakrand of blad
    sched.every(() => rnd(0.5, 2.4), (t) => plink(ctx, out, { t, freq: rnd(300, 900), gain: rnd(0.05, 0.12), pan: rnd(-0.8, 0.8), decay: rnd(0.09, 0.18) }));
    // Vlagen: de hele regen zwelt even aan
    sched.every(() => rnd(8, 25), (t) => { const d = rnd(3, 8); for (const g of [hissGain.gain, bodyGain.gain]) { const base = g.value; g.setTargetAtTime(base * rnd(1.3, 1.7), t, d * 0.3); g.setTargetAtTime(base, t + d, d * 0.4); } });
    return { stop: stopAll(nodes, sched, ctx) };
  }
  function thunder(ctx, out, { rainIntensity = 0.55 }) {
    const r = rain(ctx, out, { intensity: rainIntensity });
    const sched = new Sched(ctx);
    /**
     * Donder rolt. Het bliksemkanaal is kilometers lang en het geluid kaatst tegen de wolken, dus
     * je hoort een reeks onregelmatige vlagen die elkaar overlappen. Eén gladde uitdovende bons
     * klinkt als een overvliegend vliegtuig, niet als onweer.
     */
    const roll = (t) => {
      const ver = R();                       // 0 = vlakbij, 1 = ver weg
      const pan = rnd(-0.7, 0.7);
      if (ver < 0.35) {                      // vlakbij: eerst de scherpe klap
        burst(ctx, out, { t, dur: 0.04, color: 'white', type: 'highpass', freq: 1600, Q: 0.7, gain: 0.28 * (1 - ver), attack: 0.001, pan });
        burst(ctx, out, { t: t + 0.005, dur: rnd(0.3, 0.8), color: 'white', type: 'lowpass', freq: 2400, Q: 0.6, gain: 0.32 * (1 - ver), attack: 0.004, pan, freqEnd: 300 });
      }
      let tt = t + (ver < 0.35 ? rnd(0.15, 0.5) : 0);
      const vlagen = Math.round(rnd(3, 7));
      for (let i = 0; i < vlagen; i++) {
        const kracht = (1 - ver * 0.8) * rnd(0.35, 1) * (1 - i / (vlagen + 2));
        const dur = rnd(0.8, 2.6);
        const src = ctx.createBufferSource(); src.buffer = buffers(ctx).brown; src.playbackRate.value = rnd(0.4, 0.85);
        const lp = filt(ctx, 'lowpass', (90 + 260 * (1 - ver)) * rnd(0.6, 1.4), 0.9); const g = gainNode(ctx, 0);
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.05 + 0.55 * kracht, tt + rnd(0.15, 0.8));
        g.gain.exponentialRampToValueAtTime(0.0005, tt + dur);
        chain(src, lp, g, panNode(ctx, clamp(pan + rnd(-0.25, 0.25), -1, 1)), out); src.start(tt, R() * 2); src.stop(tt + dur + 0.1);
        tt += rnd(0.25, 1.3);
      }
    };
    sched.every(() => rnd(14, 55), roll, rnd(3, 12));
    return { stop: () => { r.stop(); sched.stop(); } };
  }
  /**
   * Wind. Alles hangt aan één windstoot: het volume, de kleur, het fluiten om een rand en hoe hard
   * de bladeren ritselen. Windstoten komen in golven van een paar seconden en zakken tussendoor bijna
   * weg. Dat verschil tussen stoot en stilte maakt dat je wind hoort en geen ruis.
   */
  function wind(ctx, out, { strength = 0.5, trees = true }) {
    const sched = new Sched(ctx); const nodes = [];
    let stoot = 0.35; // 0..1

    // Lage druk: het "duwen" van de wind.
    const body = loopNoise(ctx, 'brown'); const bodyLp = filt(ctx, 'lowpass', 320, 1); const bodyG = gainNode(ctx, 0.05);
    chain(body, bodyLp, bodyG, out); nodes.push(body);
    // Luchtstroom, links en rechts iets anders zodat het breed klinkt.
    const zij = [-0.7, 0.7].map((pan) => {
      const n = loopNoise(ctx, 'pink'); const bp = filt(ctx, 'bandpass', 700, 0.9); const g = gainNode(ctx, 0.02);
      chain(n, bp, g, panNode(ctx, pan), out); nodes.push(n);
      return { bp, g, faze: rnd(0, 1) };
    });
    // Fluiten: twee smalle resonanties die alleen bij een stevige stoot opkomen.
    const fluit = [0, 1].map(() => {
      const n = loopNoise(ctx, 'white'); const bp = filt(ctx, 'bandpass', 1100, 22); const g = gainNode(ctx, 0);
      chain(n, bp, g, panNode(ctx, rnd(-0.6, 0.6)), out); nodes.push(n);
      return { bp, g };
    });

    // De windstoot zelf: een dronken wandeling met soms een flinke uithaal.
    sched.every(() => rnd(1.4, 4.5), (t) => {
      const uithaal = R() < 0.18;
      stoot = clamp(stoot + (uithaal ? rnd(0.3, 0.65) : rnd(-0.5, 0.5)), 0.04, 1);
      const g = Math.pow(stoot, 1.5);
      const tijd = uithaal ? rnd(0.5, 1.1) : rnd(1.1, 2.4);
      bodyG.gain.setTargetAtTime((0.02 + 0.16 * g) * (0.5 + strength), t, tijd);
      bodyLp.frequency.setTargetAtTime(200 + 700 * g, t, tijd * 1.2);
      for (const z of zij) {
        z.g.gain.setTargetAtTime((0.008 + 0.1 * g) * (0.45 + strength) * rnd(0.8, 1.2), t, tijd * rnd(0.9, 1.3));
        z.bp.frequency.setTargetAtTime((450 + 1700 * g) * rnd(0.85, 1.2), t, tijd * 1.4);
        z.bp.Q.setTargetAtTime(0.7 + 1.6 * g, t, tijd);
      }
      // Fluiten hoort pas bij een echte stoot, en glijdt mee in toonhoogte.
      fluit.forEach((f, i) => {
        const sterk = Math.max(0, g - 0.45) * (0.5 + strength);
        f.g.gain.setTargetAtTime(sterk * (i ? 0.05 : 0.08), t, tijd * 0.8);
        const fr = (620 + 1500 * g) * (i ? rnd(1.4, 2.1) : rnd(0.85, 1.15));
        f.bp.frequency.setTargetAtTime(fr, t, tijd * 1.5);
      });
    });

    // Ritselende bladeren: dichtheid en helderheid volgen de stoot, in vlaagjes.
    if (trees) {
      sched.every(() => rnd(0.15, 0.9) / (0.15 + stoot * 1.6), (t) => {
        const n = Math.round(rnd(3, 14) * (0.3 + stoot));
        const pan = rnd(-1, 1); const helder = 2200 + 5000 * stoot;
        for (let i = 0; i < n; i++) {
          burst(ctx, out, {
            t: t + i * rnd(0.004, 0.05), dur: rnd(0.008, 0.045), color: 'white', type: 'bandpass',
            freq: helder * rnd(0.6, 1.5), Q: rnd(1.5, 4), gain: rnd(0.004, 0.028) * (0.3 + stoot) * (0.5 + strength), pan: pan + rnd(-0.15, 0.15),
          });
        }
      });
      // Een tak die zwiept bij een uithaal.
      sched.every(() => rnd(12, 40), (t) => {
        if (stoot < 0.5) return;
        burst(ctx, out, { t, dur: rnd(0.25, 0.6), color: 'pink', type: 'bandpass', freq: rnd(300, 700), Q: 3, gain: rnd(0.05, 0.12), attack: 0.06, pan: rnd(-0.7, 0.7), freqEnd: rnd(200, 500) });
      });
    }
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /**
   * Branding. Een golf is geen zwelling van ruis maar een reeks gebeurtenissen: eerst het aanrollen,
   * dan de klap waarmee hij breekt, dan het fijne bruisen van het schuim dat seconden natrilt, en
   * tot slot het water dat over het zand terugtrekt. Dat bruisen is het belangrijkst: duizenden
   * belletjes die knetteren, en niet een gladde ruisband — anders klinkt de zee als radiostoring.
   * Golven komen bovendien in sets: na een paar kleine komt er een grote.
   */
  function waves(ctx, out, { size = 0.6 }) {
    const sched = new Sched(ctx);
    const low = loopNoise(ctx, 'brown'); const lp = filt(ctx, 'lowpass', 700, 0.6); const lg = gainNode(ctx, 0.05); chain(low, lp, lg, out);
    const foam = loopNoise(ctx, 'white'); const hp = filt(ctx, 'highpass', 1800, 0.5); const fg = gainNode(ctx, 0.0);
    const fpan = panNode(ctx, 0); chain(foam, hp, fg, fpan, out);
    // Bruis: smaller dan het schuim en veel sneller flakkerend. De envelop per golf en het
    // geflakker staan los van elkaar, vandaar twee versterkers achter elkaar.
    const bruis = loopNoise(ctx, 'white'); const bBp = filt(ctx, 'bandpass', 3200, 0.9);
    const bruisFlut = gainNode(ctx, 0.5); const bruisEnv = gainNode(ctx, 0.004);
    chain(bruis, bBp, bruisFlut, bruisEnv, out);
    const bed = loopNoise(ctx, 'pink'); chain(bed, filt(ctx, 'lowpass', 1200, 0.5), gainNode(ctx, 0.06), out);
    sched.every(() => rnd(0.025, 0.08), (t) => {
      bruisFlut.gain.setTargetAtTime(0.25 + 0.75 * Math.pow(R(), 1.3), t, 0.022);
      bBp.frequency.setTargetAtTime(rnd(2200, 4800), t, 0.05);
    });

    let inSet = 0, setLengte = Math.round(rnd(5, 8));
    const wave = (t) => {
      inSet++;
      const groot = inSet % setLengte === 0;              // om de zoveel golven een grote
      if (groot) setLengte = Math.round(rnd(5, 8));
      const kracht = (groot ? rnd(0.85, 1.15) : rnd(0.45, 0.85)) * (0.5 + size * 0.7);
      const period = groot ? rnd(11, 16) : rnd(7, 12);
      const rise = period * rnd(0.3, 0.42), fall = period - rise, tb = t + rise;
      const p = rnd(-0.6, 0.6);
      // Het schuim schuift met de golf mee over het strand.
      fpan.pan.setValueAtTime(p, t); fpan.pan.linearRampToValueAtTime(-p * rnd(0.3, 0.9), t + period * 0.75);
      // Aanrollen.
      lg.gain.setTargetAtTime(0.12 + 0.5 * kracht, t, rise * 0.45); lg.gain.setTargetAtTime(0.05, tb, fall * 0.35);
      lp.frequency.setTargetAtTime(400 + 800 * kracht, t, rise * 0.5); lp.frequency.setTargetAtTime(600, tb, fall * 0.4);
      // De klap: een brede ruis die van hoog naar laag zakt, met een dof gedreun eronder.
      burst(ctx, out, { t: tb, dur: rnd(0.5, 1.2), color: 'white', type: 'lowpass', freq: 4200 * kracht + 800, Q: 0.6, gain: 0.085 * kracht, attack: rnd(0.05, 0.15), pan: p, freqEnd: 650 });
      burst(ctx, out, { t: tb + 0.02, dur: rnd(0.9, 1.7), color: 'brown', type: 'lowpass', freq: rnd(140, 230), Q: 1.1, gain: 0.11 * kracht, attack: 0.09, pan: p * 0.4 });
      // Schuim en bruis sterven daarna langzaam weg.
      fg.gain.setTargetAtTime(0.06 + 0.2 * kracht, tb - rise * 0.2, rise * 0.28);
      fg.gain.setTargetAtTime(0.0, tb + fall * 0.3, fall * 0.4);
      bruisEnv.gain.setTargetAtTime(0.1 * kracht, tb, 0.25);
      bruisEnv.gain.setTargetAtTime(0.004, tb + rnd(1, 2.2), fall * 0.4);
      // Het water dat over het zand terugtrekt: ruis die juist naar boven schuift.
      burst(ctx, out, { t: tb + fall * 0.3, dur: rnd(1.2, 2.6), color: 'pink', type: 'bandpass', freq: 800, Q: 0.8, gain: 0.045 * kracht, attack: rnd(0.3, 0.7), pan: -p * 0.7, freqEnd: rnd(2000, 3400) });
      return period;
    };
    let next = 8; sched.every(() => next, (t) => { next = wave(t); });
    return { stop: stopAll([low, foam, bruis, bed], sched, ctx) };
  }
  /**
   * Stromend water. Water bestaat uit heel veel losse belletjes: elk belletje is een resonantie die
   * omhoog glijdt terwijl hij uitdooft. Daaronder een bewegend bed voor het sissen van de stroom en
   * een lage bodem voor het volume van het water.
   */
  function stream(ctx, out, { speed = 0.6 }) {
    const sched = new Sched(ctx);
    const n1 = loopNoise(ctx, 'white'); const b1 = filt(ctx, 'bandpass', 900 + 800 * speed, 1.1); const g1 = gainNode(ctx, 0.1); chain(n1, b1, g1, panNode(ctx, -0.25), out);
    const n2 = loopNoise(ctx, 'white'); const b2 = filt(ctx, 'bandpass', 2600 + 1500 * speed, 1.4); const g2 = gainNode(ctx, 0.05); chain(n2, b2, g2, panNode(ctx, 0.3), out);
    const n3 = loopNoise(ctx, 'brown'); chain(n3, filt(ctx, 'lowpass', 260, 0.7), gainNode(ctx, 0.09), out);
    wander(ctx, sched, b1.frequency, 700, 1500 + 800 * speed, 1.2, 0.8);
    wander(ctx, sched, g1.gain, 0.06, 0.14, 1.4, 1);
    wander(ctx, sched, g2.gain, 0.025, 0.08, 1.5, 1);
    /** Eén belletje: een korte toon die omhoog glijdt terwijl hij wegsterft. */
    const bel = (t, freq, gain, pan) => {
      const dur = rnd(0.02, 0.075);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * rnd(1.4, 2.6), t + dur); // stijgende toon: dat maakt het water
      const g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
      chain(o, g, panNode(ctx, pan), out); o.start(t); o.stop(t + dur + 0.02);
    };
    // Veel belletjes, in clusters zoals waar het water over een steen valt.
    sched.every(() => rnd(0.03, 0.16) / (0.4 + speed), (t) => {
      const pan = rnd(-0.85, 0.85); const n = R() < 0.4 ? Math.round(rnd(2, 6)) : 1;
      for (let i = 0; i < n; i++) bel(t + i * rnd(0.006, 0.035), rnd(420, 1800), rnd(0.012, 0.05), pan + rnd(-0.1, 0.1));
    });
    // Diepere "glug" van een draaikolk of holte.
    sched.every(() => rnd(0.8, 4) / (0.4 + speed), (t) => { const n = Math.round(rnd(2, 5)); for (let i = 0; i < n; i++) bel(t + i * rnd(0.04, 0.13), rnd(150, 420), rnd(0.03, 0.08), rnd(-0.5, 0.5)); });
    // Af en toe klotst er water op.
    sched.every(() => rnd(3, 12), (t) => burst(ctx, out, { t, dur: rnd(0.08, 0.3), color: 'white', type: 'bandpass', freq: rnd(1200, 3000), Q: 1.6, gain: rnd(0.03, 0.08), attack: 0.01, pan: rnd(-0.7, 0.7), freqEnd: rnd(600, 2000) }));
    return { stop: stopAll([n1, n2, n3], sched, ctx) };
  }
  /**
   * Vuur. Een echte knap is geen toon maar een korte ruisexplosie: vocht dat het hout openbreekt.
   * Een gestemde knap met een glijdende toonhoogte klinkt onherroepelijk als popcorn, dus hier zit
   * geen enkele oscillator in. Verder heeft vuur drie lagen die tegelijk moeten kloppen: het lage
   * ademen van de brandende lucht, een fijn sissend geknetter dat vrijwel nooit stilvalt, en daar
   * bovenop de losse knappen. Van die knappen is het overgrote deel nauwelijks hoorbaar; alleen af
   * en toe komt er een die je echt opmerkt. Alles gaat door dezelfde haardresonantie, zodat het uit
   * één ruimte lijkt te komen. De activiteit komt in golven, zoals bij hout dat oplaait en inzakt.
   */
  function fire(ctx, out, { size = 0.6 }) {
    const sched = new Sched(ctx); const nodes = [];
    let activiteit = 0.6; // 0..1, bepaalt hoe druk het vuur is

    // De haard: een holle resonantie laag en een demping van het schelle, zodat knappen niet
    // los in de ruimte hangen maar in dezelfde stookplaats klinken.
    const haard = gainNode(ctx, 1);
    const holte = filt(ctx, 'peaking', 150 + 130 * size, 1.1); holte.gain.value = 5;
    const zacht = filt(ctx, 'peaking', 2600, 1.3); zacht.gain.value = -4;
    chain(haard, holte, zacht, out);

    // Brandende lucht: laag, smal en met snel flakkeren. Geen brede ruis.
    const roar = loopNoise(ctx, 'brown');
    const roarLp = filt(ctx, 'lowpass', 240 + 140 * size, 1.1);
    const roarG = gainNode(ctx, 0.1);
    chain(roar, roarLp, roarG, out); nodes.push(roar);
    // Middenlaag die het vuur "lichaam" geeft, ook flakkerend.
    const bodyN = loopNoise(ctx, 'pink');
    const bodyBp = filt(ctx, 'bandpass', 520, 1.4);
    const bodyG = gainNode(ctx, 0.03);
    chain(bodyN, bodyBp, bodyG, out); nodes.push(bodyN);
    // Geknetter: duizenden minuscule knapjes versmelten in het echt tot een fijn sissen. Dat kun je
    // niet knap voor knap maken, dus het is een smalle ruisband die heel onregelmatig aan- en
    // afzwelt. Zonder deze laag blijven er losse ploffen over, en dat is precies het popcorneffect.
    const knetter = loopNoise(ctx, 'pink');
    const knetterBp = filt(ctx, 'bandpass', 2600, 0.8);
    const knetterG = gainNode(ctx, 0.012);
    chain(knetter, knetterBp, knetterG, haard); nodes.push(knetter);

    // Flakkeren: kleine sprongen een paar keer per seconde. Dit maakt het levend.
    sched.every(() => rnd(0.07, 0.2), (t) => {
      const f = rnd(0.45, 1.35) * (0.55 + activiteit * 0.7);
      roarG.gain.setTargetAtTime((0.07 + 0.1 * size) * f, t, 0.05);
      bodyG.gain.setTargetAtTime((0.02 + 0.035 * size) * f, t, 0.06);
      roarLp.frequency.setTargetAtTime((230 + 150 * size) * rnd(0.8, 1.3), t, 0.09);
    });
    // Het geknetter fladdert sneller en grilliger dan de vlam zelf.
    sched.every(() => rnd(0.03, 0.11), (t) => {
      knetterG.gain.setTargetAtTime((0.006 + 0.014 * size) * Math.pow(R(), 1.6) * (0.5 + activiteit), t, 0.025);
      knetterBp.frequency.setTargetAtTime(rnd(1500, 4200), t, 0.05);
    });
    // Oplaaien en inzakken over tientallen seconden.
    sched.every(() => rnd(6, 18), (t) => {
      activiteit = clamp(activiteit + rnd(-0.45, 0.45), 0.15, 1);
      bodyBp.frequency.setTargetAtTime(380 + 500 * activiteit, t, 3);
    });

    /**
     * Eén knap, uitsluitend uit ruis. Zachte knapjes zijn hoog en heel kort; hoe zwaarder de knap,
     * hoe lager en langer, met er vlak achteraan een doffe houten bons.
     */
    const knap = (t, kracht, pan) => {
      const midden = clamp((5200 - 3600 * kracht) * rnd(0.55, 1.5), 300, 7500);
      burst(ctx, haard, { t, dur: 0.003 + 0.028 * kracht, color: 'white', type: 'bandpass', freq: midden, Q: rnd(0.9, 3.2), gain: 0.06 + 0.45 * kracht, attack: 0.0004, pan });
      if (kracht > 0.28) {  // de bons in het hout die je bij een zware knap meehoort
        burst(ctx, haard, { t: t + 0.0015, dur: 0.03 + 0.1 * kracht, color: 'brown', type: 'lowpass', freq: rnd(90, 240), Q: 1.3, gain: 0.1 * kracht, attack: 0.0012, pan });
      }
      if (kracht > 0.6 && R() < 0.6) {  // en soms een vonk die wegspringt
        burst(ctx, haard, { t: t + rnd(0.02, 0.09), dur: 0.004, color: 'white', type: 'highpass', freq: rnd(4000, 8000), Q: 0.7, gain: 0.06 * kracht, attack: 0.0004, pan: pan + rnd(-0.3, 0.3) });
      }
    };

    // Losse knappen. Machtsverdeling: de meeste zijn heel zacht, af en toe zit er een stevige
    // tussen. Gelijk harde knappen achter elkaar is precies wat popcorn doet.
    sched.every(() => rnd(0.06, 0.42) / (0.35 + size * 0.5 + activiteit * 0.7), (t) => {
      const pan = rnd(-0.65, 0.65);
      const n = R() < 0.3 ? Math.round(rnd(2, 5)) : 1;
      for (let i = 0; i < n; i++) knap(t + i * rnd(0.015, 0.08), Math.pow(R(), 2.6) * (0.35 + size * 0.35), pan + rnd(-0.1, 0.1));
    });
    // De knap die je echt hoort, met een tel of tien ertussen.
    sched.every(() => rnd(3.5, 12) / (0.4 + size * 0.6 + activiteit * 0.5), (t) => knap(t, rnd(0.5, 1) * (0.6 + size * 0.4), rnd(-0.5, 0.5)));
    // Sissen van vocht dat verdampt: korte, smalle jets, geen constante hoge ruis.
    sched.every(() => rnd(2.5, 10) / (0.5 + activiteit), (t) => {
      const f = rnd(2200, 5200);
      burst(ctx, haard, { t, dur: rnd(0.15, 0.9), color: 'white', type: 'bandpass', freq: f, Q: rnd(2.5, 6), gain: rnd(0.03, 0.09), attack: rnd(0.02, 0.12), pan: rnd(-0.5, 0.5), freqEnd: f * rnd(0.6, 1.5) });
    });
    // Instortend hout: een lage bons met wat gerommel.
    sched.every(() => rnd(25, 70), (t) => {
      knap(t, 1, rnd(-0.3, 0.3));
      for (let i = 0; i < 5; i++) knap(t + 0.05 + i * rnd(0.03, 0.12), rnd(0.2, 0.5), rnd(-0.5, 0.5));
      roarG.gain.setTargetAtTime((0.07 + 0.1 * size) * 1.6, t, 0.3); roarG.gain.setTargetAtTime(0.07 + 0.1 * size, t + 2, 1.5);
    });
    return { stop: stopAll(nodes, sched, ctx) };
  }
  function birds(ctx, out, { density = 0.6, forest = true }) {
    const sched = new Sched(ctx); const nodes = [];
    if (forest) { const bed = loopNoise(ctx, 'pink'); chain(bed, filt(ctx, 'bandpass', 600, 0.5), gainNode(ctx, 0.035), out); nodes.push(bed); }
    // Vogels verder weg klinken zachter, doffer en met meer ruimte eromheen.
    const far = gainNode(ctx, 1); const farLp = filt(ctx, 'lowpass', 3000, 0.7); chain(far, farLp, reverb(ctx, out, 'irLong', 0.5));
    // Elke "soort" heeft een eigen toonhoogte, ritme en zangvorm, zodat je losse vogels blijft horen.
    const species = Array.from({ length: 5 }, () => ({
      base: rnd(1700, 4600), span: rnd(200, 1600), n: Math.round(rnd(2, 6)), len: rnd(0.05, 0.18), gap: rnd(0.05, 0.2),
      pan: rnd(-0.9, 0.9), style: pick(['trill', 'sweepUp', 'sweepDown', 'twoNote', 'chirp']), vib: R() < 0.5 ? rnd(18, 45) : 0,
      far: R() < 0.4, harm: rnd(0.06, 0.3),
    }));
    const phrase = (t) => {
      const s = pick(species); let tt = t; const vol = rnd(0.18, 0.4) * (s.far ? 0.4 : 1);
      const dst = s.far ? far : out;
      const count = s.style === 'trill' ? Math.round(rnd(6, 16)) : s.style === 'twoNote' ? 2 : s.n;
      for (let i = 0; i < count; i++) {
        const jitter = rnd(0.9, 1.1);
        let f0 = s.base + rnd(-0.2, 1) * s.span, f1;
        if (s.style === 'sweepUp') f1 = f0 * rnd(1.25, 1.9);
        else if (s.style === 'sweepDown') f1 = f0 * rnd(0.5, 0.8);
        else if (s.style === 'twoNote') { f0 = s.base * (i ? 0.75 : 1); f1 = f0 * rnd(0.97, 1.03); }
        else f1 = f0 * rnd(0.9, 1.15);
        const len = (s.style === 'trill' ? rnd(0.025, 0.055) : s.len * jitter) * (s.style === 'twoNote' ? 3 : 1);
        birdNote(ctx, dst, { t: tt, f0, f1, dur: len, gain: vol * rnd(0.75, 1), pan: s.pan + rnd(-0.12, 0.12), vib: s.vib, harm: s.harm });
        tt += len + (s.style === 'trill' ? rnd(0.012, 0.03) : s.gap * jitter);
      }
    };
    sched.every(() => rnd(0.8, 5) / (0.3 + density), phrase);
    return { stop: stopAll(nodes, sched, ctx) };
  }
  function night(ctx, out, { crickets = 0.7, frogs = false, owl = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const bed = loopNoise(ctx, 'pink'); chain(bed, filt(ctx, 'lowpass', 500, 0.5), gainNode(ctx, 0.03), out); nodes.push(bed);
    const voices = Array.from({ length: Math.round(2 + crickets * 5) }, () => ({ f: rnd(3600, 5600), rate: rnd(18, 34), pan: rnd(-1, 1), gain: rnd(0.035, 0.085), chirp: rnd(0.25, 0.7), pause: rnd(0.3, 1.4) }));
    for (const v of voices) {
      sched.every(() => v.chirp + v.pause * rnd(0.7, 1.3), (t) => {
        const pulses = Math.max(1, Math.floor(v.chirp * v.rate)), puls = 1 / v.rate;
        // Een krekel schuurt zijn vleugels in één doorgaande beweging en onderbreekt die alleen;
        // daarom één oscillator per tsjirp met het ritme in de versterker. Een oscillator per pulsje
        // leverde honderden audioknopen per seconde op, en dat hoor je als hapering.
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = v.f * rnd(0.99, 1.01);
        const g = gainNode(ctx, 0);
        chain(o, g, panNode(ctx, v.pan), out);
        for (let i = 0; i < pulses; i++) {
          const tp = t + i * puls;
          g.gain.setValueAtTime(0, tp);
          g.gain.linearRampToValueAtTime(v.gain * rnd(0.85, 1.15), tp + puls * 0.12);
          g.gain.exponentialRampToValueAtTime(0.0005, tp + puls * 0.55);
        }
        o.start(t); o.stop(t + pulses * puls + 0.05);
      }, rnd(0, 1.5));
    }
    if (frogs) sched.every(() => rnd(0.4, 2.5), (t) => { const n = Math.round(rnd(2, 6)); for (let i = 0; i < n; i++) tone(ctx, out, { t: t + i * rnd(0.09, 0.14), freq: rnd(320, 520), glideTo: rnd(250, 400), dur: 0.05, release: 0.05, gain: rnd(0.03, 0.08), attack: 0.005, pan: rnd(-0.8, 0.8), type: 'triangle', partials: [[1, 1], [2, 0.3]] }); });
    if (owl) sched.every(() => rnd(25, 80), (t) => { for (const [d, f, l] of [[0, 380, 0.5], [0.75, 340, 0.9]]) tone(ctx, out, { t: t + d, freq: f, glideTo: f * 0.93, dur: l, release: 0.25, gain: 0.06, attack: 0.08, pan: rnd(-0.5, 0.5), lowpass: 900, partials: [[1, 1], [2, 0.15]] }); }, rnd(6, 20));
    return { stop: stopAll(nodes, sched, ctx) };
  }
  // Klinkers als formanten (de drie resonanties waarmee je oor een klinker herkent).
  const KLINKERS = [
    [700, 1220, 2600], // a
    [530, 1840, 2480], // e
    [390, 1990, 2550], // i
    [490, 900, 2400],  // o
    [350, 800, 2400],  // oe
    [580, 1400, 2500], // uh
    [440, 1600, 2500], // ij-achtig
  ];
  /**
   * De bronklank van een menselijke stem. Een zaagtand valt 6 dB per octaaf af, echte stembanden
   * ongeveer twee keer zo snel. Dat verschil is precies het blikkerige, nasale randje dat je bij
   * formantsynthese hoort. Deze golfvorm heeft het juiste verloop en wordt één keer per audiocontext
   * gemaakt en door alle stemmen gedeeld, dus hij kost geen extra audioknopen.
   */
  const stemGolven = new WeakMap();
  function stemGolf(ctx) {
    let w = stemGolven.get(ctx);
    if (w) return w;
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = Math.pow(k, -1.7);
    w = ctx.createPeriodicWave(re, im);
    stemGolven.set(ctx, w);
    return w;
  }
  /**
   * De mond van één spreker: een stembandbron die blijft doorlopen en drie formantfilters die van
   * klinker naar klinker glijden. Iemand die praat bouwt zijn mond niet per lettergreep opnieuw op,
   * dus dit klopt beter (je hoort de overgang tussen klinkers) én het is veel goedkoper: een
   * lettergreep is nu alleen nog automatisering, geen nieuwe audioknopen. Bij acht pratende mensen
   * scheelt dat het verschil tussen 250 en 50 knopen per seconde.
   */
  function mond(ctx, out, { pan = 0, dof = 3500, f0 = 120 }) {
    const som = gainNode(ctx, 1); const env = gainNode(ctx, 0); const dofLp = filt(ctx, 'lowpass', dof, 0.8);
    chain(som, env, dofLp, panNode(ctx, pan), out);
    const src = ctx.createOscillator(); src.setPeriodicWave(stemGolf(ctx)); src.frequency.value = f0;
    const bp = [0, 1, 2].map((i) => {
      const b = filt(ctx, 'bandpass', [500, 1400, 2500][i], i === 0 ? 7 : 9);
      chain(b, gainNode(ctx, [1, 0.5, 0.22][i]), som); src.connect(b); return b;
    });
    chain(src, gainNode(ctx, 0.12), som);  // vult de dalen tussen de formanten; anders klinkt het als een vocoder
    src.start();
    return { src, env, bp, uit: out, stop() { try { src.stop(); } catch {} try { src.disconnect(); } catch {} } };
  }
  /**
   * Eén lettergreep uit een mond: de klinker waar de formanten naartoe glijden, een toonhoogte-
   * contour en een envelop. Optioneel een ruisje vooraf als medeklinker, want zonder consonanten
   * klinkt spraak als gezoem.
   */
  function lettergreep(ctx, m, { t, f0, dur, klinker, gain = 0.1, sluit = false, pan = 0 }) {
    m.src.frequency.setValueAtTime(f0 * rnd(0.97, 1.03), t);
    m.src.frequency.linearRampToValueAtTime(f0 * rnd(0.9, 1.08), t + dur); // contour binnen de lettergreep
    for (let i = 0; i < 3; i++) m.bp[i].frequency.setTargetAtTime(klinker[i] * rnd(0.95, 1.05), Math.max(0, t - 0.04), 0.035);
    const aan = sluit ? 0.008 : 0.03; // consonant-achtige start of zachte inzet
    m.env.gain.setValueAtTime(0, t);
    m.env.gain.linearRampToValueAtTime(gain, t + aan);
    m.env.gain.setValueAtTime(gain, t + dur * 0.65);
    m.env.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    if (sluit) burst(ctx, m.uit, { t: Math.max(0, t - 0.02), dur: rnd(0.02, 0.05), color: 'white', type: 'bandpass', freq: rnd(3000, 6500), Q: 1.6, gain: gain * rnd(0.3, 0.7), attack: 0.004, pan });
  }
  /**
   * Café. Het geroezemoes bestaat uit echte stemmen: elke spreker heeft een eigen toonhoogte en
   * spreektempo, praat een zin en zwijgt dan even. Verder kopjes, bestek, stoelen en de machine.
   */
  function cafe(ctx, out, { busy = 0.6, music = false }) {
    const sched = new Sched(ctx); const nodes = [];
    // Zaalgeluid: laag en zacht, alleen als bodem.
    const room = loopNoise(ctx, 'brown'); chain(room, filt(ctx, 'lowpass', 220, 0.7), gainNode(ctx, 0.05), out); nodes.push(room);
    const verte = loopNoise(ctx, 'pink'); const vbp = filt(ctx, 'bandpass', 600, 0.7); const vg = gainNode(ctx, 0.02 + 0.03 * busy);
    chain(verte, vbp, vg, out); nodes.push(verte); // ruis van tientallen mensen te ver weg om te horen
    wander(ctx, sched, vg.gain, 0.015, 0.03 + 0.045 * busy, 2, 1.5);

    // Sprekers: dichtbij hoor je ze duidelijk, verder weg zachter en doffer.
    const galm = reverb(ctx, out, 'irRoom', 0.35);
    // Iedere spreker houdt zijn eigen mond: die staat er één keer, en de lettergrepen zijn daarna
    // alleen nog automatisering. Zie mond().
    const sprekers = Array.from({ length: Math.round(3 + busy * 6) }, (_, i) => {
      const nabij = i < 2 ? rnd(0.75, 1) : rnd(0.2, 0.6);
      const f0 = R() < 0.45 ? rnd(165, 240) : rnd(95, 140); // hogere en lagere stemmen
      const pan = rnd(-0.95, 0.95);
      return {
        m: mond(ctx, galm, { pan, dof: 900 + 2600 * nabij, f0 }), f0, pan, nabij,
        tempo: rnd(3.2, 5.6), gain: (0.05 + 0.16 * nabij) * (0.7 + busy * 0.5),
      };
    });
    for (const s of sprekers) nodes.push(s.m);
    for (const s of sprekers) {
      // Een zin van een paar lettergrepen, dan een pauze waarin een ander aan het woord is.
      sched.every(() => rnd(1.2, 4.5) / (0.35 + busy), (t) => {
        const n = Math.round(rnd(2, 9)); let tt = t;
        const hoogte = s.f0 * rnd(0.9, 1.15);
        for (let i = 0; i < n; i++) {
          const dur = rnd(0.09, 0.2);
          const zak = 1 - (i / Math.max(1, n - 1)) * rnd(0.05, 0.22); // toonhoogte zakt naar het eind
          lettergreep(ctx, s.m, {
            t: tt, f0: hoogte * zak * rnd(0.96, 1.05), dur, klinker: pick(KLINKERS),
            gain: s.gain * rnd(0.7, 1.15) * (i === 0 ? 1.1 : 1), pan: s.pan, sluit: R() < 0.45,
          });
          tt += dur + (1 / s.tempo) * rnd(0.5, 1.3);
        }
      }, rnd(0, 3));
    }
    // Lachje: een reeks korte klinkers op dalende toon.
    sched.every(() => rnd(18, 60) / (0.4 + busy), (t) => {
      const s = pick(sprekers); const f = s.f0 * rnd(1.1, 1.5); const n = Math.round(rnd(3, 6));
      for (let i = 0; i < n; i++) lettergreep(ctx, s.m, { t: t + i * rnd(0.13, 0.19), f0: f * (1 - i * 0.06), dur: 0.075, klinker: KLINKERS[0], gain: s.gain * 1.2, pan: s.pan, sluit: true });
    });
    // Kopjes op schoteltjes, bestek, stoelen, de machine.
    sched.every(() => rnd(2.5, 9) / (0.4 + busy), (t) => tone(ctx, galm, { t, freq: rnd(2400, 4600), dur: 0.008, release: rnd(0.12, 0.3), gain: rnd(0.03, 0.08), attack: 0.001, pan: rnd(-0.9, 0.9), partials: [[1, 1], [2.76, 0.45], [5.4, 0.18]] }));
    sched.every(() => rnd(6, 20), (t) => { const n = Math.round(rnd(2, 5)); for (let i = 0; i < n; i++) burst(ctx, galm, { t: t + i * rnd(0.04, 0.13), dur: 0.02, color: 'white', type: 'bandpass', freq: rnd(4000, 8000), Q: 2.5, gain: rnd(0.02, 0.05), attack: 0.001, pan: rnd(-0.8, 0.8) }); }); // bestek
    sched.every(() => rnd(25, 70), (t) => burst(ctx, galm, { t, dur: rnd(0.3, 0.8), color: 'pink', type: 'bandpass', freq: rnd(180, 420), Q: 4, gain: rnd(0.05, 0.11), attack: 0.02, pan: rnd(-0.7, 0.7), freqEnd: rnd(150, 300) })); // stoel schuift
    sched.every(() => rnd(30, 90), (t) => { // espressomachine: stoom en dan de molen
      burst(ctx, galm, { t, dur: rnd(1.2, 2.6), color: 'white', type: 'highpass', freq: 2800, Q: 0.6, gain: rnd(0.05, 0.09), attack: 0.25, pan: rnd(-0.5, 0.5) });
      if (R() < 0.5) { const d = rnd(2, 4); burst(ctx, galm, { t: t + rnd(2, 4), dur: d, color: 'pink', type: 'bandpass', freq: 320, Q: 2.2, gain: 0.06, attack: 0.15, pan: rnd(-0.4, 0.4) }); }
    });
    // Zachte achtergrondmuziek in de zaak (alleen als daarom gevraagd wordt).
    if (music) { const zacht = filt(ctx, 'lowpass', 2200, 0.7); chain(zacht, gainNode(ctx, 0.5), galm); nodes.push(lofiJazz(ctx, zacht, { bpm: 78, drums: true, crackle: false })); }
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /**
   * Ventilator. De motorbrom is niet één zuivere toon maar het net (50 Hz) met zijn boventonen; een
   * kale sinus klinkt als een testtoon. Daarbovenop het luchtgeruis, dat mee-ademt met de bladen die
   * langs de behuizing gaan, en een heel trage slingering omdat geen enkele motor precies constant
   * draait.
   */
  function fan(ctx, out, { speed = 0.5 }) {
    const sched = new Sched(ctx); const nodes = [];
    const n = loopNoise(ctx, 'brown'); const lp = filt(ctx, 'lowpass', 400 + 500 * speed, 0.7); const g = gainNode(ctx, 0.35);
    chain(n, lp, g, out); nodes.push(n);
    for (const [f, amp] of [[50, 0.018], [100, 0.05], [150, 0.014], [200, 0.008]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * rnd(0.998, 1.002);
      const og = gainNode(ctx, amp); chain(o, og, out); o.start(); nodes.push(o);
      wander(ctx, sched, og.gain, amp * 0.7, amp * 1.3, 9, 6);
    }
    // De bladen die langs de behuizing gaan: dat is de zoevende modulatie op het luchtgeruis.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 12 + 14 * speed;
    const lg = gainNode(ctx, 0.06); lfo.connect(lg).connect(g.gain); lfo.start(); nodes.push(lfo);
    wander(ctx, sched, lfo.frequency, (12 + 14 * speed) * 0.97, (12 + 14 * speed) * 1.03, 12, 8);
    wander(ctx, sched, lp.frequency, (400 + 500 * speed) * 0.85, (400 + 500 * speed) * 1.18, 8, 5);
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /**
   * Verkeer. Aan een passerende auto herken je drie dingen: het bandengeruis wordt niet geleidelijk
   * maar heel snel luider vlak voor hij langskomt (het volume gaat met de afstand), de toonhoogte
   * zakt op het moment dat hij voorbij is (dopplereffect), en er zit een lage motorbrom onder die
   * eerder aankomt dan het geruis. Zonder die drie is het een aanzwellende ruisveeg.
   */
  function traffic(ctx, out, { density = 0.5 }) {
    const sched = new Sched(ctx); const nodes = [];
    const bed = loopNoise(ctx, 'brown'); const bedLp = filt(ctx, 'lowpass', 260, 0.6); const bedG = gainNode(ctx, 0.3);
    chain(bed, bedLp, bedG, out); nodes.push(bed);
    const hiss = loopNoise(ctx, 'pink'); chain(hiss, filt(ctx, 'bandpass', 1200, 0.5), gainNode(ctx, 0.04), out); nodes.push(hiss);
    wander(ctx, sched, bedG.gain, 0.2, 0.4, 7, 5);
    wander(ctx, sched, bedLp.frequency, 190, 340, 9, 6);
    sched.every(() => rnd(1.5, 9) / (0.3 + density), (t) => {
      const d = rnd(2, 5.5), dir = R() < 0.5 ? -1 : 1, mid = t + d / 2;
      const dichtbij = rnd(0.35, 1);                       // hoe dicht hij langs je komt
      const piek = (0.06 + 0.2 * dichtbij) * rnd(0.7, 1.2);
      const src = ctx.createBufferSource(); src.buffer = buffers(ctx).pink;
      src.playbackRate.setValueAtTime(1.05 + 0.05 * dichtbij, t);
      src.playbackRate.setValueAtTime(1.05 + 0.05 * dichtbij, mid - d * 0.08);
      src.playbackRate.linearRampToValueAtTime(0.95 - 0.05 * dichtbij, mid + d * 0.08); // doppler
      const bp = filt(ctx, 'bandpass', 300, 0.8); const g = gainNode(ctx, 0); const p = panNode(ctx, -dir);
      bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(rnd(800, 1600) * dichtbij + 400, mid); bp.frequency.linearRampToValueAtTime(250, t + d);
      // Volume met de afstand: lang zacht, dan snel omhoog en er net zo snel weer af.
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(piek * 0.18, mid - d * 0.3);
      g.gain.linearRampToValueAtTime(piek * 0.55, mid - d * 0.12);
      g.gain.linearRampToValueAtTime(piek, mid);
      g.gain.linearRampToValueAtTime(piek * 0.5, mid + d * 0.14);
      g.gain.linearRampToValueAtTime(piek * 0.15, mid + d * 0.32);
      g.gain.linearRampToValueAtTime(0, t + d);
      p.pan.setValueAtTime(-dir, t); p.pan.linearRampToValueAtTime(dir, t + d);
      chain(src, bp, g, p, out); src.start(t, R() * 2); src.stop(t + d + 0.05);
      // Motor: lager, en je hoort hem al aankomen voor het bandengeruis er is.
      burst(ctx, out, { t, dur: d * 0.9, color: 'brown', type: 'lowpass', freq: rnd(90, 190), Q: 1.6, gain: piek * rnd(0.5, 0.9), attack: d * 0.45, pan: -dir * 0.5 });
    });
    // Een claxon of een sirene ver weg: zeldzaam, maar het maakt er een stad van.
    sched.every(() => rnd(40, 150) / (0.3 + density), (t) => {
      const p = rnd(-0.8, 0.8);
      if (R() < 0.7) {                                     // korte claxon, twee tonen
        const f = rnd(360, 520);
        for (const [ratio, amp] of [[1, 1], [2, 0.45], [3, 0.2], [1.19, 0.6]]) {
          tone(ctx, out, { t, freq: f * ratio, dur: rnd(0.2, 0.6), gain: 0.014 * amp, attack: 0.02, release: 0.08, pan: p, lowpass: 2200 });
        }
      } else {                                             // sirene die langzaam wegtrekt
        const o = ctx.createOscillator(); o.type = 'triangle'; const g = gainNode(ctx, 0);
        const lp = filt(ctx, 'lowpass', 1400, 0.8); const dur = rnd(6, 13);
        let tt = t; let hoog = true;
        while (tt < t + dur) { o.frequency.setValueAtTime(hoog ? rnd(620, 700) : rnd(430, 480), tt); hoog = !hoog; tt += rnd(0.5, 0.9); }
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
        chain(o, lp, g, panNode(ctx, p), out); o.start(t); o.stop(t + dur + 0.1);
      }
    }, 25);
    return { stop: stopAll(nodes, sched, ctx) };
  }
  function clock(ctx, out, {}) {
    const sched = new Sched(ctx); let tock = false;
    const room = loopNoise(ctx, 'brown'); chain(room, filt(ctx, 'lowpass', 150, 0.5), gainNode(ctx, 0.05), out);
    sched.every(1, (t) => {
      tock = !tock;
      burst(ctx, out, { t, dur: 0.012, color: 'white', freq: tock ? 2600 : 3400, Q: 6, gain: 0.55, attack: 0.001, pan: 0.15 });
      tone(ctx, out, { t, freq: tock ? 900 : 1300, dur: 0.005, release: 0.03, gain: 0.16, attack: 0.001, pan: 0.15 });
      // De houten kast waar het uurwerk in hangt klinkt mee; zonder die bons is de tik elektronisch.
      burst(ctx, out, { t, dur: rnd(0.03, 0.06), color: 'brown', type: 'lowpass', freq: tock ? 190 : 240, Q: 1.6, gain: 0.09, attack: 0.0015, pan: 0.15 });
    });
    return { stop: stopAll([room], sched, ctx) };
  }
  function typing(ctx, out, { speed = 0.6 }) {
    const sched = new Sched(ctx);
    const room = loopNoise(ctx, 'pink'); chain(room, filt(ctx, 'lowpass', 400, 0.5), gainNode(ctx, 0.03), out);
    sched.every(() => rnd(0.6, 3.5) / (0.5 + speed), (t) => {
      const n = Math.round(rnd(3, 14)); let tt = t;
      for (let i = 0; i < n; i++) {
        const space = R() < 0.14;
        const p = rnd(-0.4, 0.4), kracht = rnd(0.12, 0.3);
        burst(ctx, out, { t: tt, dur: rnd(0.008, 0.02), color: 'white', freq: space ? 900 : rnd(2500, 5500), Q: space ? 2 : 4, gain: kracht, attack: 0.001, pan: p });
        // Een toets maakt twee tikken: de aanslag en het terugveren. Alleen de aanslag klinkt digitaal.
        burst(ctx, out, { t: tt + rnd(0.04, 0.1), dur: rnd(0.005, 0.012), color: 'white', freq: rnd(1800, 4000), Q: 3, gain: kracht * rnd(0.25, 0.5), attack: 0.0008, pan: p });
        if (space) tone(ctx, out, { t: tt, freq: 180, dur: 0.01, release: 0.05, gain: 0.08, attack: 0.001 });
        tt += rnd(0.06, 0.16) / (0.5 + speed);
      }
    });
    return { stop: stopAll([room], sched, ctx) };
  }

  // ---- Muziek: hulpmiddelen ------------------------------------------------------------------
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], penta: [0, 2, 4, 7, 9], mpenta: [0, 3, 5, 7, 10] };
  const deg = (scale, root, d, oct = 0) => root + scale[((d % scale.length) + scale.length) % scale.length] + 12 * (Math.floor(d / scale.length) + oct);
  const chordNotes = (scale, root, d, size = 4, oct = 0) => Array.from({ length: size }, (_, i) => deg(scale, root, d + 2 * i, oct));

  /** Zwevende akkoorden: langzame pads met veel galm, wisselende voicings, af en toe een hoge toon. */
  function pads(ctx, out, { scale = 'major', root = 48, warmth = 0.5, sparkle = true, drone = false, chordLen = [9, 15], voices = 4 }) {
    const sched = new Sched(ctx); const sc = SCALES[scale];
    const rev = reverb(ctx, out, 'irLong', 0.55); const lp = filt(ctx, 'lowpass', 900 + 600 * warmth, 0.6); lp.connect(rev);
    wander(ctx, sched, lp.frequency, 600 + 400 * warmth, 1800 + 800 * warmth, 6, 4);
    const prog = scale === 'minor' || scale === 'dorian' ? [0, 5, 3, 4, 0, 2, 5, 6] : [0, 3, 4, 5, 0, 1, 3, 4];
    let idx = 0, len = 10;
    const nodes = [];
    if (drone) { for (const [ratio, amp, det] of [[1, 0.09, -5], [1, 0.09, 5], [2, 0.03, 0], [0.5, 0.06, 0]]) { const o = ctx.createOscillator(); o.type = ratio >= 1 ? 'sawtooth' : 'sine'; o.frequency.value = midi(root) * ratio; o.detune.value = det; const dlp = filt(ctx, 'lowpass', 300, 1); const g = gainNode(ctx, amp); chain(o, dlp, g, rev); o.start(); nodes.push(o); wander(ctx, sched, dlp.frequency, 150, 700, 5, 3); } }
    sched.every(() => len, (t) => {
      len = rnd(chordLen[0], chordLen[1]);
      const d = prog[idx % prog.length] + (R() < 0.15 ? Math.round(rnd(-1, 1)) : 0); idx++;
      const notes = chordNotes(sc, root, d, voices, 0); if (R() < 0.5) notes[notes.length - 1] += 12; if (R() < 0.3) notes.unshift(notes[0] - 12);
      notes.forEach((n, i) => {
        const f = midi(n); const gain = (i === 0 ? 0.11 : 0.075) * (drone ? 0.6 : 1); const pan = (i / (notes.length - 1) - 0.5) * 1.2;
        for (const [det, type] of [[-6, 'triangle'], [6, 'sine'], [0, 'sine']]) {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det + rnd(-2, 2);
          const g = gainNode(ctx, 0); const a = rnd(2.2, 4), rel = rnd(4, 6.5);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain / 3, t + a); g.gain.setValueAtTime(gain / 3, t + len); g.gain.exponentialRampToValueAtTime(0.0004, t + len + rel);
          chain(o, g, panNode(ctx, pan), lp); o.start(t); o.stop(t + len + rel + 0.1);
        }
      });
    }, 0.1);
    if (sparkle) sched.every(() => rnd(2.5, 9), (t) => { const n = deg(sc, root, Math.floor(rnd(0, sc.length)), 2 + Math.round(R())); tone(ctx, rev, { t, freq: midi(n), dur: rnd(0.4, 1.5), release: rnd(2.5, 4), gain: rnd(0.02, 0.05), attack: rnd(0.05, 0.6), pan: rnd(-0.8, 0.8), partials: [[1, 1], [2, 0.12], [3, 0.04]] }); }, 4);
    return { stop: stopAll(nodes, sched, ctx) };
  }

  /** Lo-fi jazz: elektrische piano met septiemakkoorden, wandelende bas, geborstelde drums, vinylkraak. */
  function lofiJazz(ctx, out, { bpm = 76, key = null, drums = true, minor = false, crackle = true }) {
    const sched = new Sched(ctx); const beat = 60 / bpm; const swing = 0.62;
    const root = key ?? 48 + Math.floor(rnd(0, 12)); const sc = minor ? SCALES.dorian : SCALES.major;
    const rev = reverb(ctx, out, 'irRoom', 0.3);
    const tape = filt(ctx, 'lowpass', 2600, 0.5); tape.connect(rev);
    const wob = ctx.createOscillator(); wob.frequency.value = 0.45; const wobG = gainNode(ctx, 6); wob.connect(wobG); wob.start(); // bandwobble in cents
    const ep = (t, n, dur, gain, pan = 0) => { const f = midi(n); for (const [ratio, amp] of [[1, 1], [2, 0.32], [3, 0.08], [4.02, 0.04]]) { const o = ctx.createOscillator(); o.frequency.value = f * ratio; wobG.connect(o.detune); const g = gainNode(ctx, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0004, t + dur); chain(o, g, panNode(ctx, pan), tape); o.start(t); o.stop(t + dur + 0.05); } };
    const bass = (t, n, dur) => tone(ctx, tape, { t, freq: midi(n), dur: dur * 0.8, release: 0.15, gain: 0.16, attack: 0.02, type: 'triangle', partials: [[1, 1], [2, 0.15]], lowpass: 500 });
    const progs = minor ? [[0, 3, 4, 0], [0, 5, 3, 4], [1, 4, 0, 0]] : [[1, 4, 0, 0], [0, 5, 1, 4], [3, 2, 1, 4], [0, 2, 1, 4]];
    let prog = pick(progs), bar = 0;
    let nodes = [wob];
    if (crackle) { const hiss = loopNoise(ctx, 'pink'); chain(hiss, filt(ctx, 'highpass', 4000, 0.5), gainNode(ctx, 0.012), out); nodes.push(hiss); sched.every(() => rnd(0.05, 0.6), (t) => burst(ctx, out, { t, dur: rnd(0.003, 0.012), freq: rnd(2000, 6000), Q: 2, type: 'highpass', gain: rnd(0.02, 0.09), attack: 0.001, pan: rnd(-0.3, 0.3) })); }
    sched.every(() => beat * 4, (t) => {
      const d = prog[bar % 4]; if (bar % 4 === 3 && R() < 0.5) prog = pick(progs); bar++;
      const chord = chordNotes(sc, root, d, 4, 1); if (R() < 0.5) chord.push(deg(sc, root, d + 8, 1)); // 7e en 9e
      // comping: akkoord op 1 en (met swing) op de 'en' van 2 of op 3
      const hits = [0, R() < 0.5 ? 1 + swing : 2, ...(R() < 0.4 ? [3 + swing * 0.9] : [])];
      for (const h of hits) { const tt = t + h * beat + rnd(-0.01, 0.01); chord.forEach((n, i) => ep(tt + i * rnd(0.004, 0.02), n, rnd(1.2, 2.2), 0.05 + 0.02 * R(), (i / chord.length - 0.5) * 0.8)); }
      // melodie-fragment
      if (R() < 0.6) { let tt = t + pick([0.5, 1, 2, 2.5]) * beat; const n0 = deg(sc, root, d + pick([2, 4, 6, 7]), 2); let n = n0; for (let i = 0; i < Math.round(rnd(2, 5)); i++) { ep(tt, n, rnd(0.5, 1.4), 0.07, rnd(-0.3, 0.3)); tt += beat * pick([0.5, 0.5, 1, swing]); n = deg(sc, root, d + pick([1, 2, 3, 4, 5, 6, 7]), 2); } }
      // bas: grondtoon op 1, kwint of doorgang op 3
      const rootN = deg(sc, root, d, -1); bass(t, rootN, beat * 2); bass(t + 2 * beat, R() < 0.5 ? rootN + 7 : deg(sc, root, d + (R() < 0.5 ? 1 : -1), -1), beat * 2);
      if (R() < 0.3) bass(t + 3.5 * beat, rootN + 5, beat * 0.5);
      if (drums) {
        for (const b of [0, 2, ...(R() < 0.35 ? [2.5 + swing * 0.3] : [])]) tone(ctx, out, { t: t + b * beat, freq: 62, glideTo: 40, dur: 0.06, release: 0.2, gain: 0.22, attack: 0.002 });
        for (const b of [1, 3]) burst(ctx, out, { t: t + b * beat, dur: 0.11, color: 'white', freq: 1800, Q: 0.7, gain: 0.07, attack: 0.004, pan: 0.2 });
        for (let e = 0; e < 8; e++) { const off = e % 2 ? swing - 0.5 : 0; burst(ctx, out, { t: t + (e / 2 + off) * beat, dur: 0.03, color: 'white', freq: 8000, Q: 0.8, type: 'highpass', gain: e % 2 ? 0.02 : 0.035, attack: 0.001, pan: -0.3 }); }
      }
    }, 0.1);
    return { stop: stopAll(nodes, sched, ctx) };
  }

  // ---- Jazz: harmonie en instrumenten -------------------------------------------------------------
  // Akkoordsoorten als halve tonen boven de akkoordgrondtoon.
  const AKKOORD = {
    maj7: [0, 4, 7, 11], maj9: [0, 4, 11, 14], '69': [0, 4, 9, 14],
    m7: [0, 3, 7, 10], m9: [0, 3, 10, 14], m6: [0, 3, 7, 9],
    7: [0, 4, 7, 10], 9: [0, 4, 10, 14], '13': [0, 4, 10, 21], alt: [0, 4, 10, 15],
    m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  };
  // Veelgebruikte jazzschema's als [halve tonen boven de toonaard, akkoordsoort] per maat.
  const CHANGES = {
    iiVI: [[2, 'm9'], [7, 9], [0, 'maj9'], [0, '69']],
    turnaround: [[0, 'maj7'], [9, 'm7'], [2, 'm9'], [7, 'alt']],
    mineur: [[2, 'm7b5'], [7, 'alt'], [0, 'm9'], [0, 'm6']],
    blues: [[0, 9], [5, 9], [0, 9], [0, 7], [5, 9], [5, 9], [0, 9], [9, 7], [2, 'm9'], [7, 9], [0, 9], [7, 'alt']],
    bossa: [[0, 'maj9'], [0, 'maj9'], [2, 'm9'], [7, 9]],
    bossaMin: [[0, 'm9'], [0, 'm9'], [5, 'm7'], [7, 9]],
    ballade: [[0, 'maj9'], [5, 'maj7'], [2, 'm9'], [7, 9], [9, 'm7'], [2, 'm9'], [7, 9], [0, 'maj9']],
    modaal: [[0, 'm9'], [0, 'm9'], [5, 'm9'], [5, 'm9']],
  };
  /** Noten van een akkoord, mooi verdeeld rond een gewenste hoogte. */
  function voicing(basis, soort, rond = 60) {
    const tonen = AKKOORD[soort] || AKKOORD.m7;
    let noten = tonen.map((s) => basis + s);
    while (noten[0] < rond - 8) noten = noten.map((n) => n + 12);
    while (noten[0] > rond + 8) noten = noten.map((n) => n - 12);
    return noten;
  }
  /** Een blazende leadstem (sax-achtig): riettoon met vibrato, portamento en ademruis. */
  function reedNote(ctx, out, { t, freq, next = null, dur, gain = 0.1, pan = 0, vib = 5.4, breath = 0.5 }) {
    const env = gainNode(ctx, 0);
    const aan = Math.min(0.07, dur * 0.35), af = Math.min(0.25, dur * 0.5);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + aan);
    env.gain.setTargetAtTime(gain * 0.82, t + aan, dur * 0.5);
    env.gain.setValueAtTime(gain * 0.8, t + Math.max(aan, dur - af));
    env.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.05);
    // Riet klinkt door een resonantie rond 1 kHz; daarboven zakt hij af.
    const form = filt(ctx, 'bandpass', 1000 + rnd(-200, 400), 1.1);
    const lp = filt(ctx, 'lowpass', 2600 + rnd(-400, 900), 0.8);
    const som = gainNode(ctx, 1);
    chain(som, form, lp, env, panNode(ctx, pan), out);
    // Vibrato zet pas in als de noot even duurt, zoals een blazer doet.
    const lfo = ctx.createOscillator(); lfo.frequency.value = vib + rnd(-0.5, 0.5);
    const lfoG = gainNode(ctx, 0);
    lfoG.gain.setValueAtTime(0, t); lfoG.gain.linearRampToValueAtTime(Math.min(14, dur * 22), t + Math.min(0.45, dur * 0.6));
    chain(lfo, lfoG); lfo.start(t); lfo.stop(t + dur + 0.1);
    for (const [type, det, amp] of [['sawtooth', -4, 1], ['sawtooth', 5, 0.7], ['square', 0, 0.18]]) {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.setValueAtTime(freq, t);
      if (next) o.frequency.setTargetAtTime(next, t + dur * 0.82, 0.03); // doorglijden naar de volgende noot
      lfoG.connect(o.detune);
      const g = gainNode(ctx, amp); chain(o, g, som); o.start(t); o.stop(t + dur + 0.12);
    }
    if (breath) { // lucht langs het mondstuk
      burst(ctx, out, { t, dur: Math.min(0.12, dur), color: 'white', type: 'bandpass', freq: rnd(2200, 3600), Q: 1.2, gain: gain * 0.5 * breath, attack: 0.012, pan });
      burst(ctx, out, { t, dur: dur * 0.9, color: 'pink', type: 'bandpass', freq: rnd(1400, 2400), Q: 0.9, gain: gain * 0.12 * breath, attack: aan, pan });
    }
  }
  /** Vibrafoon: zachte belklank met tremolo. */
  const vibeNote = (ctx, out, { t, freq, gain = 0.09, pan = 0, dur = 2.2 }) => {
    const trem = ctx.createOscillator(); trem.frequency.value = rnd(4.5, 6); const tg = gainNode(ctx, 0.28);
    const body = gainNode(ctx, 0); chain(trem, tg, body.gain); trem.start(t); trem.stop(t + dur + 0.2);
    body.gain.setValueAtTime(0, t); body.gain.linearRampToValueAtTime(gain, t + 0.006); body.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    chain(body, panNode(ctx, pan), out);
    for (const [ratio, amp, len] of [[1, 1, 1], [4, 0.3, 0.5], [9.2, 0.08, 0.28]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio;
      const g = gainNode(ctx, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0003, t + dur * len);
      chain(o, g, body); o.start(t); o.stop(t + dur + 0.1);
    }
  };
  /** Vleugel: aanslag met veel boventonen die sneller uitdoven dan de grondtoon. */
  const grandNote = (ctx, out, { t, freq, gain = 0.09, pan = 0, dur = 2.6 }) => {
    burst(ctx, out, { t, dur: 0.008, color: 'white', type: 'bandpass', freq: Math.min(9000, freq * 8), Q: 1.1, gain: gain * 0.28, attack: 0.0008, pan });
    const bus = panNode(ctx, pan); bus.connect(out); // één panner per noot in plaats van per boventoon
    for (const [ratio, amp, len] of [[1, 1, 1], [2, 0.42, 0.72], [3, 0.16, 0.5], [4, 0.08, 0.34], [5.05, 0.045, 0.22]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio * rnd(0.9985, 1.0015);
      const g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0003, t + dur * len);
      chain(o, g, bus); o.start(t); o.stop(t + dur * len + 0.06);
    }
  };
  /** Nylonsnaar: aanslag plus snel uitdovende boventonen. */
  const nylonNote = (ctx, out, { t, freq, gain = 0.09, pan = 0, dur = 1.6 }) => {
    burst(ctx, out, { t, dur: 0.012, color: 'white', type: 'bandpass', freq: freq * 4, Q: 1.4, gain: gain * 0.5, attack: 0.001, pan });
    const bus = panNode(ctx, pan); bus.connect(out);
    for (const [ratio, amp, len] of [[1, 1, 1], [2, 0.42, 0.6], [3, 0.2, 0.4], [4, 0.1, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio * rnd(0.999, 1.001);
      const g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0003, t + dur * len);
      chain(o, g, bus); o.start(t); o.stop(t + dur + 0.05);
    }
  };
  /** Contrabas: warme, korte toon met een vleugje aanzet. */
  const uprightNote = (ctx, out, { t, freq, dur = 0.5, gain = 0.2, pan = -0.1 }) => {
    burst(ctx, out, { t, dur: 0.02, color: 'pink', type: 'bandpass', freq: freq * 6, Q: 1.2, gain: gain * 0.22, attack: 0.002, pan });
    tone(ctx, out, { t, freq, dur: dur * 0.75, release: 0.22, gain, attack: 0.014, pan, type: 'triangle', partials: [[1, 1], [2, 0.22], [3, 0.06]], lowpass: 420 });
  };
  /** Geborstelde drums: een strijkende beweging op de snaredrum plus zachte accenten. */
  function brushes(ctx, out, sched, beat, { swing = 0.62, ride = true, level = 1 }) {
    const nodes = [];
    const swirl = loopNoise(ctx, 'pink'); const sbp = filt(ctx, 'bandpass', 2000, 0.9); const sg = gainNode(ctx, 0.012 * level);
    chain(swirl, sbp, sg, panNode(ctx, 0.15), out); nodes.push(swirl);
    // De cirkelbeweging van het bezem: twee keer per maat zwelt hij aan.
    sched.every(() => beat * 2, (t) => {
      sg.gain.setTargetAtTime(0.026 * level, t, beat * 0.35);
      sg.gain.setTargetAtTime(0.01 * level, t + beat, beat * 0.5);
    });
    if (ride) sched.every(() => beat * 4, (t) => {
      for (let e = 0; e < 8; e++) {
        const off = e % 2 ? swing - 0.5 : 0;
        burst(ctx, out, { t: t + (e / 2 + off) * beat, dur: e % 2 ? 0.02 : 0.05, color: 'white', type: 'highpass', freq: 7000, Q: 0.8, gain: (e % 2 ? 0.016 : 0.03) * level, attack: 0.001, pan: -0.35 });
      }
      for (const b of [1, 3]) burst(ctx, out, { t: t + b * beat, dur: 0.06, color: 'white', type: 'bandpass', freq: 1600, Q: 0.8, gain: 0.035 * level, attack: 0.003, pan: 0.2 }); // bezem-accent
      if (R() < 0.5) tone(ctx, out, { t: t + rnd(0, 3) * beat, freq: 58, glideTo: 40, dur: 0.05, release: 0.18, gain: 0.14 * level, attack: 0.002 }); // schoptrommel
    });
    return nodes;
  }
  /**
   * Jazzcombo. Eén motor voor piano-trio, bossa en coffee-table jazz: dezelfde harmonie en ritmiek,
   * andere instrumenten en accenten. De melodie wordt per keer verzonnen uit de akkoordtonen.
   */
  function jazzCombo(ctx, out, {
    bpm = 96, changes = 'iiVI', feel = 'swing', lead = 'sax', comp = 'piano',
    key = null, bassLevel = 1, drumLevel = 1, leadDensity = 0.6, tape = false,
  }) {
    const sched = new Sched(ctx); const beat = 60 / bpm; const swing = feel === 'swing' ? 0.62 : 0.5;
    const root = key ?? 48 + Math.floor(rnd(0, 12));
    const rev = reverb(ctx, out, 'irRoom', feel === 'bossa' ? 0.22 : 0.3);
    const bus = tape ? filt(ctx, 'lowpass', 3000, 0.5) : gainNode(ctx, 1); bus.connect(rev);
    const nodes = [];
    if (tape) { const hiss = loopNoise(ctx, 'pink'); chain(hiss, filt(ctx, 'highpass', 4500, 0.5), gainNode(ctx, 0.01), out); nodes.push(hiss); }

    const ep = (t, n, dur, gain, pan = 0) => { // elektrische piano
      const f = midi(n); const p = panNode(ctx, pan); p.connect(bus);
      for (const [ratio, amp] of [[1, 1], [2, 0.3], [3, 0.07], [4.02, 0.03]]) {
        const o = ctx.createOscillator(); o.frequency.value = f * ratio;
        const g = gainNode(ctx, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
        chain(o, g, p); o.start(t); o.stop(t + dur + 0.05);
      }
    };
    const compVoice = (t, n, dur, gain, pan) => (
      comp === 'nylon' ? nylonNote(ctx, bus, { t, freq: midi(n), gain: gain * 1.5, pan, dur })
        : comp === 'vibes' ? vibeNote(ctx, bus, { t, freq: midi(n), gain: gain * 1.3, pan, dur: dur * 1.4 })
          : comp === 'grand' ? grandNote(ctx, bus, { t, freq: midi(n), gain: gain * 1.35, pan, dur: dur * 1.6 })
            : ep(t, n, dur, gain, pan));

    const prog = CHANGES[changes] || CHANGES.iiVI;
    let bar = 0, leadTot = -1; // leadTot: tot welke tijd de solo bezig is
    nodes.push(...brushes(ctx, out, sched, beat, { swing, ride: feel === 'swing', level: drumLevel * (feel === 'bossa' ? 0.7 : 1) }));
    if (feel === 'bossa') { // sjieke bossa-tik in plaats van ride
      sched.every(() => beat * 2, (t) => {
        for (const [b, g] of [[0, 0.03], [0.75, 0.022], [1.5, 0.03], [1.75, 0.02]]) burst(ctx, out, { t: t + b * beat, dur: 0.03, color: 'white', type: 'highpass', freq: 6000, Q: 0.7, gain: g * drumLevel, attack: 0.001, pan: 0.3 });
      });
    }

    sched.every(() => beat * 4, (t) => {
      const [offset, soort] = prog[bar % prog.length]; bar++;
      const basis = root + offset;
      const chord = voicing(basis, soort, comp === 'nylon' ? 57 : 60);
      // Comping: waar de akkoorden vallen bepaalt het gevoel.
      const hits = feel === 'bossa'
        ? [0, 1.5, 2.5, 3.5]
        : feel === 'ballad' ? [0, 2] : [0, R() < 0.55 ? 1 + swing : 2, ...(R() < 0.35 ? [3 + swing * 0.9] : [])];
      for (const h of hits) {
        const tt = t + h * beat + rnd(-0.012, 0.012);
        const dur = feel === 'bossa' ? beat * 1.2 : rnd(1.1, 2.1);
        chord.forEach((n, i) => compVoice(tt + i * rnd(0.003, 0.018), n, dur, (0.04 + 0.02 * R()) * (feel === 'ballad' ? 1.2 : 1), (i / chord.length - 0.5) * 0.8));
      }
      // Bas: grondtoon, dan kwint of een doorgangsnoot naar het volgende akkoord.
      const laag = basis - 24 + (basis - 24 < 33 ? 12 : 0);
      const volgend = root + prog[bar % prog.length][0] - 24;
      if (feel === 'bossa') { uprightNote(ctx, bus, { t, freq: midi(laag), dur: beat * 1.4, gain: 0.19 * bassLevel }); uprightNote(ctx, bus, { t: t + beat * 1.5, freq: midi(laag + 7), dur: beat * 1.2, gain: 0.15 * bassLevel }); uprightNote(ctx, bus, { t: t + beat * 2.5, freq: midi(laag), dur: beat, gain: 0.16 * bassLevel }); }
      else if (feel === 'ballad') { uprightNote(ctx, bus, { t, freq: midi(laag), dur: beat * 2, gain: 0.18 * bassLevel }); uprightNote(ctx, bus, { t: t + beat * 2, freq: midi(laag + 7), dur: beat * 2, gain: 0.14 * bassLevel }); }
      else for (let b = 0; b < 4; b++) { // wandelende bas
        const stap = b === 0 ? 0 : b === 3 ? (volgend > laag ? -1 : 1) * pick([1, 2]) : pick([0, 2, 3, 4, 5, 7, 7, 9]);
        uprightNote(ctx, bus, { t: t + b * beat, freq: midi(laag + (b === 3 ? 12 + stap : stap)), dur: beat * 0.92, gain: (b % 2 ? 0.15 : 0.19) * bassLevel });
      }
      // Solo: frasen van een paar noten, met stiltes ertussen.
      if (lead !== 'none' && t > leadTot && R() < leadDensity) {
        const tonen = AKKOORD[soort] || AKKOORD.m7;
        const kleur = [...tonen, tonen[1] + 2, tonen[2] + 2, tonen[0] + 14]; // akkoordtonen plus wat kleur
        let tt = t + pick([0, 0.5, 1, 1.5, 2]) * beat;
        const n = Math.round(rnd(3, 8)); const octaaf = lead === 'sax' ? 24 : 24;
        let vorige = basis + octaaf + pick(kleur);
        const pan = lead === 'sax' ? rnd(-0.25, 0.25) : rnd(-0.4, 0.4);
        for (let i = 0; i < n; i++) {
          const stapDuur = pick([0.5, 0.5, 0.75, 1, 1, 1.5]) * beat * (feel === 'swing' && R() < 0.5 ? swing / 0.5 : 1);
          const dichtbij = kleur.map((k) => basis + octaaf + k).concat(kleur.map((k) => basis + octaaf + 12 + k));
          const doel = dichtbij.reduce((a, b) => (Math.abs(b - vorige) < Math.abs(a - vorige) && b !== vorige ? b : a), dichtbij[0]);
          const noot = R() < 0.65 ? doel : pick(dichtbij);
          const volg = i < n - 1 ? midi(noot + pick([-2, -1, 1, 2])) : null;
          if (lead === 'sax') reedNote(ctx, bus, { t: tt, freq: midi(noot), next: volg, dur: stapDuur * rnd(0.7, 1.05), gain: 0.085 * rnd(0.85, 1.15), pan });
          else if (lead === 'vibes') vibeNote(ctx, bus, { t: tt, freq: midi(noot), gain: 0.075, pan, dur: rnd(1.4, 2.6) });
          else if (lead === 'grand') { grandNote(ctx, bus, { t: tt, freq: midi(noot), gain: 0.08, pan, dur: rnd(1.8, 3.2) }); if (R() < 0.3) grandNote(ctx, bus, { t: tt + rnd(0.01, 0.04), freq: midi(noot - pick([3, 4, 5, 7])), gain: 0.045, pan, dur: rnd(1.4, 2.4) }); }
          else nylonNote(ctx, bus, { t: tt, freq: midi(noot), gain: 0.07, pan, dur: rnd(0.8, 1.6) });
          vorige = noot; tt += stapDuur;
        }
        leadTot = tt + rnd(1, 4) * beat; // even zwijgen na de frase
      }
    }, 0.1);
    return { stop: stopAll(nodes, sched, ctx) };
  }

  // Publiek-domeinmelodieën (compositie), als [halve tonen t.o.v. grondtoon, tellen]
  const CAROLS = {
    stilleNacht: { name: 'Stille nacht', bpm: 66, notes: [[0, 1.5], [2, 0.5], [0, 1], [-3, 3], [0, 1.5], [2, 0.5], [0, 1], [-3, 3], [7, 2], [7, 1], [4, 3], [5, 2], [5, 1], [0, 3], [2, 2], [2, 1], [5, 1.5], [4, 0.5], [2, 1], [0, 1.5], [2, 0.5], [0, 1], [-3, 3], [2, 2], [2, 1], [5, 1.5], [4, 0.5], [2, 1], [0, 1.5], [2, 0.5], [0, 1], [-3, 3], [7, 2], [7, 1], [9, 1.5], [7, 0.5], [4, 1], [5, 3], [9, 3], [5, 1], [0, 1], [-3, 1], [0, 1.5], [-3, 0.5], [-7, 1], [-5, 3]] },
    oDenneboom: { name: 'O denneboom', bpm: 92, notes: [[-5, 1], [0, 1.5], [0, 0.5], [0, 2], [2, 1], [4, 1.5], [4, 0.5], [4, 2], [4, 1], [2, 1], [4, 1], [5, 2], [-1, 2], [2, 2], [0, 2], [7, 1], [7, 1], [4, 1.5], [9, 0.5], [7, 2], [5, 1], [5, 1], [4, 2], [4, 1], [4, 1], [2, 1.5], [4, 0.5], [5, 2], [-1, 2], [2, 2], [0, 2]] },
    jingleBells: { name: 'Jingle bells', bpm: 108, notes: [[4, 1], [4, 1], [4, 2], [4, 1], [4, 1], [4, 2], [4, 1], [7, 1], [0, 1.5], [2, 0.5], [4, 4], [5, 1], [5, 1], [5, 1.5], [5, 0.5], [5, 1], [4, 1], [4, 1], [4, 0.5], [4, 0.5], [4, 1], [2, 1], [2, 1], [4, 1], [2, 2], [7, 2]] },
    goodKing: { name: 'Good King Wenceslas', bpm: 96, notes: [[0, 1], [0, 1], [0, 1], [2, 1], [0, 1], [0, 1], [-5, 2], [-3, 1], [-5, 1], [-3, 1], [0, 1], [-3, 1], [-3, 1], [0, 2], [0, 1], [0, 1], [0, 1], [2, 1], [0, 1], [0, 1], [-5, 2], [-3, 1], [-5, 1], [-3, 1], [0, 1], [-3, 1], [-3, 1], [0, 2]] },
  };
  // ---- Filmmuziek ---------------------------------------------------------------------------------
  /** Echo met terugkoppeling, gedempt zodat elke herhaling doffer wordt. Voor arpeggio's en pads. */
  function echo(ctx, out, { tijd = 0.42, terug = 0.42, demping = 2600, wet = 0.4 }) {
    const inp = gainNode(ctx, 1), d = ctx.createDelay(3), fb = gainNode(ctx, terug), lp = filt(ctx, 'lowpass', demping, 0.7), w = gainNode(ctx, wet);
    inp.connect(out); inp.connect(d); d.connect(lp).connect(fb).connect(d); d.connect(w).connect(out);
    d.delayTime.value = tijd;
    return inp;
  }
  /**
   * Strijkers. Een sectie is nooit één toon: meerdere spelers zitten er net naast en zetten net niet
   * gelijk in. Langzame aanzet, zachte filteropening en een trage zwelling geven de "film"-klank.
   */
  function strijkerNoot(ctx, out, { t, freq, dur, gain = 0.05, pan = 0, spelers = 3, aanzet = 2.2, helder = 1 }) {
    const bus = gainNode(ctx, 0); const lp = filt(ctx, 'lowpass', 700 * helder, 0.8);
    chain(bus, lp, panNode(ctx, pan), out);
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(gain, t + aanzet);
    bus.gain.setTargetAtTime(gain * rnd(0.75, 1.15), t + aanzet, dur * 0.4);   // trage zwelling
    bus.gain.setValueAtTime(gain * 0.9, t + Math.max(aanzet, dur - 1.5));
    bus.gain.exponentialRampToValueAtTime(0.0004, t + dur + 1.8);
    lp.frequency.setValueAtTime(500 * helder, t);
    lp.frequency.linearRampToValueAtTime(rnd(900, 1700) * helder, t + dur * 0.6);
    lp.frequency.setTargetAtTime(600 * helder, t + dur * 0.75, dur * 0.3);
    for (let i = 0; i < spelers; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.detune.value = (i - (spelers - 1) / 2) * rnd(6, 13) + rnd(-4, 4);
      o.frequency.value = freq * rnd(0.9985, 1.0015);
      const g = gainNode(ctx, 0.9 / Math.sqrt(spelers));
      chain(o, g, bus); o.start(t + rnd(0, 0.12)); o.stop(t + dur + 2);
    }
    // Strijkgeruis: nauwelijks hoorbaar, maar het haalt het "synthetische" eraf.
    burst(ctx, out, { t, dur: Math.min(dur, aanzet * 1.5), color: 'pink', type: 'bandpass', freq: freq * 5, Q: 1.1, gain: gain * 0.16, attack: aanzet * 0.7, pan });
  }
  /** Analoge synthstem à la de grote pads uit de jaren tachtig: brede zaagtanden door een filter. */
  function analoogNoot(ctx, out, { t, freq, dur, gain = 0.05, pan = 0, res = 4, opening = 1 }) {
    const bus = gainNode(ctx, 0); const lp = filt(ctx, 'lowpass', 300, res);
    chain(bus, lp, panNode(ctx, pan), out);
    bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(gain, t + rnd(1.2, 2.6));
    bus.gain.setValueAtTime(gain, t + Math.max(2.6, dur - 2)); bus.gain.exponentialRampToValueAtTime(0.0004, t + dur + 2.2);
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(rnd(1100, 2600) * opening, t + dur * rnd(0.4, 0.7)); // trage filterveeg
    lp.frequency.setTargetAtTime(400, t + dur * 0.8, dur * 0.3);
    for (const det of [-11, -4, 5, 12]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det + rnd(-3, 3); o.frequency.value = freq;
      chain(o, gainNode(ctx, 0.42), bus); o.start(t); o.stop(t + dur + 2.4);
    }
    const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = freq / 2;
    chain(sub, gainNode(ctx, 0.5), bus); sub.start(t); sub.stop(t + dur + 2.4);
  }
  /**
   * Atmosferische filmmuziek. Eén motor, drie handschriften:
   *  - 'strijkers': trage strijkersakkoorden met een lage drone eronder en heel langzame wisselingen.
   *  - 'postminimal': een kort pianomotief dat blijft herhalen en langzaam verandert, onder strijkers.
   *  - 'analoog': brede synthpads met filterveeg, een arpeggio door de echo en een zingende lead.
   */
  function filmscore(ctx, out, { stijl = 'strijkers', modus = 'eolisch', grondtoon = 45, tempo = 1, drone = true, ruis = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const zaal = reverb(ctx, out, stijl === 'analoog' ? 'irKerk' : 'irLong', stijl === 'analoog' ? 0.55 : 0.5);
    const sc = MODI[modus] ? MODI[modus].toonladder : MODI.eolisch.toonladder;
    const trap = (i) => { const o = Math.floor(i / sc.length); return sc[((i % sc.length) + sc.length) % sc.length] + o * 12; };
    // Bandruis: het lichte suizen van tape onder de muziek, heel zacht.
    if (ruis) { const h = loopNoise(ctx, 'pink'); chain(h, filt(ctx, 'highpass', 2000, 0.5), gainNode(ctx, 0.008), out); nodes.push(h); }
    if (drone) { // lage aangehouden grondtoon, het fundament van dit soort muziek
      for (const [ratio, amp, det] of [[1, 0.05, -6], [1, 0.05, 7], [2, 0.02, 0]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(grondtoon - 24) * ratio; o.detune.value = det;
        const lp = filt(ctx, 'lowpass', 260, 1.1); const g = gainNode(ctx, amp);
        chain(o, lp, g, zaal); o.start(); nodes.push(o);
        wander(ctx, sched, g.gain, amp * 0.45, amp * 1.3, 12, 7);
        wander(ctx, sched, lp.frequency, 150, 520, 14, 8);
      }
    }
    // Akkoordenschema: weinig akkoorden, lang aangehouden. Dat is de kern van deze stijl.
    const schema = stijl === 'analoog' ? [0, 5, 3, 4] : [0, 5, 3, 0, 4, 2];
    let stap = 0, akkoord = [0, 2, 4];

    const nieuwAkkoord = (t, lengte) => {
      const g = schema[stap % schema.length]; stap++;
      akkoord = [g, g + 2, g + 4, ...(R() < 0.5 ? [g + 6] : [])];
      const noten = akkoord.map((x) => grondtoon + trap(x));
      if (R() < 0.4) noten.push(noten[0] + 12);
      noten.forEach((n, i) => {
        const pan = (i / Math.max(1, noten.length - 1) - 0.5) * 1.1;
        if (stijl === 'analoog') analoogNoot(ctx, zaal, { t, freq: midi(n), dur: lengte, gain: 0.045, pan, opening: rnd(0.7, 1.3) });
        else strijkerNoot(ctx, zaal, { t, freq: midi(n), dur: lengte, gain: i === 0 ? 0.055 : 0.042, pan, spelers: 3, aanzet: rnd(1.6, 3.4), helder: i > 1 ? 1.5 : 1 });
      });
      return noten;
    };
    let lengte = 12;
    sched.every(() => lengte, (t) => { lengte = rnd(9, 18) / tempo; nieuwAkkoord(t, lengte); }, 0.2);

    if (stijl === 'postminimal') {
      // Een kort motief dat blijft terugkomen; af en toe verschuift er één noot. Zo blijft het boeien
      // zonder op te dringen.
      const puls = 0.46 / tempo;
      let cel = Array.from({ length: 6 }, () => pick([0, 2, 4, 6, 7, 9]));
      let i = 0;
      sched.every(() => puls, (t) => {
        if (i % cel.length === 0 && R() < 0.25) cel[Math.floor(R() * cel.length)] = pick([0, 2, 4, 5, 6, 7, 9]);
        const stapIdx = cel[i % cel.length]; i++;
        const n = grondtoon + 24 + trap(akkoord[0] + stapIdx);
        grandNote(ctx, zaal, { t, freq: midi(n), gain: rnd(0.045, 0.07), pan: rnd(-0.35, 0.35), dur: rnd(2.4, 4) });
        if (i % 8 === 0 && R() < 0.5) grandNote(ctx, zaal, { t, freq: midi(n - 12), gain: 0.05, pan: rnd(-0.2, 0.2), dur: 4 });
      }, 2);
    }
    if (stijl === 'analoog') {
      // Arpeggio door de echo, en af en toe een zingende lead met portamento.
      const del = echo(ctx, zaal, { tijd: 0.375 / tempo, terug: 0.45, demping: 3000, wet: 0.45 });
      const puls = 0.1875 / tempo;
      let i = 0;
      sched.every(() => puls, (t) => {
        i++;
        if (i % 2 && R() < 0.7) return;
        const n = grondtoon + 24 + trap(akkoord[i % akkoord.length]);
        tone(ctx, del, { t, freq: midi(n), dur: 0.04, release: 0.5, gain: rnd(0.02, 0.045), attack: 0.004, pan: rnd(-0.5, 0.5), type: 'triangle', partials: [[1, 1], [2, 0.25]] });
      }, 4);
      sched.every(() => rnd(14, 30), (t) => {
        let vorige = null; let tt = t;
        for (let k = 0; k < Math.round(rnd(2, 5)); k++) {
          const n = grondtoon + 24 + trap(akkoord[Math.floor(R() * akkoord.length)] + pick([0, 0, 2, -2]));
          const dur = rnd(1.6, 3.4);
          reedNote(ctx, zaal, { t: tt, freq: midi(n), next: vorige, dur, gain: 0.05, pan: rnd(-0.2, 0.2), vib: 4.6, breath: 0.15 });
          vorige = midi(n); tt += dur * rnd(0.8, 1.1);
        }
      }, 8);
    }
    if (stijl === 'strijkers') {
      // Zwellingen: de sectie komt op en zakt weer weg, zoals in een filmscène.
      sched.every(() => rnd(20, 45), (t) => {
        const n = grondtoon + 12 + trap(akkoord[0] + pick([0, 4, 7]));
        strijkerNoot(ctx, zaal, { t, freq: midi(n), dur: rnd(8, 16), gain: 0.05, pan: rnd(-0.3, 0.3), spelers: 4, aanzet: rnd(4, 7), helder: 1.8 });
      }, 10);
      // Diepe koperzwelling, het handelsmerk van deze stijl.
      sched.every(() => rnd(30, 70), (t) => {
        const n = grondtoon - 12 + trap(akkoord[0]);
        const dur = rnd(6, 12);
        const bus = gainNode(ctx, 0); const lp = filt(ctx, 'lowpass', 400, 2);
        chain(bus, lp, zaal);
        bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(0.075, t + dur * 0.45); bus.gain.exponentialRampToValueAtTime(0.0004, t + dur);
        lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(200, t + dur);
        for (const det of [-8, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; o.frequency.value = midi(n); chain(o, gainNode(ctx, 0.5), bus); o.start(t); o.stop(t + dur + 0.4); }
      }, 20);
    }
    return { stop: stopAll(nodes, sched, ctx) };
  }

  /**
   * Viltpiano: tussen de hamers en de snaren zit vilt, dus de aanslag is zacht en de hoge boventonen
   * verdwijnen. Wat je er juist wél bij hoort is het mechaniek: de hamer die neerkomt, de demper die
   * loslaat. Dat maakt het intiem in plaats van als een concertvleugel.
   */
  function feltPianoNote(ctx, out, { t, freq, gain = 0.07, pan = 0, dur = 3.2, hard = 0.35, boventonen = 4, demper = true }) {
    const bus = panNode(ctx, pan); const zacht = filt(ctx, 'lowpass', 900 + 1600 * hard, 0.7);
    chain(zacht, bus, out);
    for (const [ratio, amp, len] of [[1, 1, 1], [2, 0.3, 0.7], [3, 0.1, 0.45], [4, 0.035, 0.3]].slice(0, boventonen)) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio * rnd(0.999, 1.001);
      const g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.012 + 0.02 * (1 - hard));
      g.gain.exponentialRampToValueAtTime(0.0003, t + dur * len);
      chain(o, g, zacht); o.start(t); o.stop(t + dur * len + 0.05);
    }
    // Hamer op de snaar: een doffe bons, geen tik.
    burst(ctx, out, { t, dur: 0.03, color: 'pink', type: 'lowpass', freq: 260 + 200 * hard, Q: 0.8, gain: gain * (0.5 + hard * 0.6), attack: 0.002, pan });
    // Demper die loslaat als de toon uitgestorven is.
    if (demper && R() < 0.5) burst(ctx, out, { t: t + dur * 0.85, dur: 0.05, color: 'pink', type: 'bandpass', freq: rnd(400, 1100), Q: 1.5, gain: gain * 0.14, attack: 0.008, pan });
  }
  /**
   * Cello. De klank zit hem in de kast: een paar resonanties rond 220, 300 en 450 hertz. En in de
   * strijkstok: hoe dichter bij de kam (sul ponticello), hoe glaziger en ruiziger. Dat verschuift
   * hier tijdens de noot, want dat is precies wat je in deze muziek hoort gebeuren.
   */
  function celloNoot(ctx, out, { t, freq, dur, gain = 0.06, pan = 0, strijk = 0.4, glisNaar = null, vib = 0.5, zwelling = true }) {
    const bus = gainNode(ctx, 0); const lp = filt(ctx, 'lowpass', 900, 0.8);
    // De kast van het instrument: twee vaste resonanties die de toon zijn houtklank geven.
    const kast1 = filt(ctx, 'peaking', 220, 3.5); kast1.gain.value = 5;
    const kast2 = filt(ctx, 'peaking', 450, 4.5); kast2.gain.value = 3;
    chain(bus, lp, kast1, kast2, panNode(ctx, pan), out);
    const aan = zwelling ? Math.min(4, dur * 0.4) : 0.35;
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(gain, t + aan);
    bus.gain.setTargetAtTime(gain * rnd(0.8, 1.2), t + aan, dur * 0.35);
    bus.gain.setValueAtTime(gain * 0.85, t + Math.max(aan, dur - 1.2));
    bus.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.9);
    // Strijkpositie verschuift: warm, dan glaziger, dan weer warm.
    const helder = 700 + 2600 * strijk;
    lp.frequency.setValueAtTime(500 + 400 * strijk, t);
    lp.frequency.linearRampToValueAtTime(helder, t + dur * rnd(0.4, 0.65));
    lp.frequency.setTargetAtTime(600 + 300 * strijk, t + dur * 0.8, dur * 0.25);
    const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(4.6, 6);
    const lg = gainNode(ctx, 0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib * 9, t + Math.min(1.5, dur * 0.5));
    chain(lfo, lg); lfo.start(t); lfo.stop(t + dur + 1);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(freq, t);
      if (glisNaar) o.frequency.linearRampToValueAtTime(glisNaar, t + dur * rnd(0.6, 0.9)); // glijden
      lg.connect(o.detune); chain(o, gainNode(ctx, 0.55), bus); o.start(t); o.stop(t + dur + 1);
    }
    // Strijkgeruis: hoorbaar bij de aanzet en meer naarmate je dichter bij de kam speelt.
    burst(ctx, out, { t, dur: Math.min(dur, 0.4 + dur * 0.3), color: 'pink', type: 'bandpass', freq: 1400 + 2200 * strijk, Q: 1, gain: gain * (0.18 + 0.4 * strijk), attack: aan * 0.6, pan });
  }
  /**
   * Kamermuziek in Noordse stijl: viltpiano dicht op de microfoon, een klein strijkkwartet erboven,
   * en cascades van hoge noten die als vanzelf uit het akkoord vallen (de "zelfspelende piano").
   */
  function kamermuziek(ctx, out, { modus = 'eolisch', grondtoon = 48, tempo = 1, stratus = 0.5, kwartet = true, ruis = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const kamer = reverb(ctx, out, 'irRoom', 0.32);
    const zaal = reverb(ctx, out, 'irLong', 0.28);
    const sc = (MODI[modus] || MODI.eolisch).toonladder;
    const trap = (i) => { const o = Math.floor(i / sc.length); return sc[((i % sc.length) + sc.length) % sc.length] + o * 12; };
    if (ruis) { const h = loopNoise(ctx, 'pink'); chain(h, filt(ctx, 'highpass', 3000, 0.5), gainNode(ctx, 0.006), out); nodes.push(h); }
    const schema = [0, 5, 3, 4, 0, 3, 5, 2];
    let idx = 0, akk = [0, 2, 4];
    // Akkoorden wisselen langzaam; het kwartet houdt ze aan.
    let lengte = 11;
    sched.every(() => lengte, (t) => {
      lengte = rnd(8, 15) / tempo;
      const g = schema[idx % schema.length]; idx++;
      akk = [g, g + 2, g + 4, ...(R() < 0.45 ? [g + 6] : [])];
      if (kwartet) akk.forEach((x, i) => {
        const n = grondtoon + 12 + trap(x) + (i > 1 ? 12 : 0);
        strijkerNoot(ctx, zaal, { t, freq: midi(n), dur: lengte, gain: i === 0 ? 0.04 : 0.03, pan: (i / akk.length - 0.5) * 1.2, spelers: 2, aanzet: rnd(2, 4), helder: 1.6 });
      });
      // Lage grondtoon van de piano onder het akkoord.
      feltPianoNote(ctx, kamer, { t: t + rnd(0, 0.05), freq: midi(grondtoon - 12 + trap(akk[0])), gain: 0.06, pan: -0.1, dur: rnd(5, 8), hard: 0.25 });
    }, 0.3);
    // De melodie: rustige losse noten met rubato, dus nooit strak op de tel. De cascades gaan noot
    // voor noot door de planner, want acht pianotonen in één keer aanmaken hoor je als hapering.
    speelReeks(sched,
      () => {
        const rij = [];
        for (let i = 0; i < Math.round(rnd(3, 7)); i++) {
          rij.push({ soort: 'melodie', stap: pick([0, 2, 4, 6, 7, 4, 2]) });
          if (R() < stratus) {  // het instrument speelt zelf door, hoog en steeds zachter
            let v = rnd(0.04, 0.055);
            for (let k = 0, n = Math.round(rnd(3, 8)); k < n; k++) { rij.push({ soort: 'cascade', gain: v }); v *= rnd(0.72, 0.9); }
          }
        }
        return rij;
      },
      (t, item) => {
        if (item.soort === 'cascade') {
          const hoog = grondtoon + 36 + trap(pick(akk) + pick([0, 2, 4]));
          feltPianoNote(ctx, kamer, { t, freq: midi(hoog), gain: item.gain, pan: rnd(-0.5, 0.5), dur: rnd(1.6, 3), hard: 0.5, boventonen: 2, demper: false });
          return rnd(0.12, 0.38) / tempo;
        }
        const n = grondtoon + 12 + trap(akk[0] + item.stap);
        feltPianoNote(ctx, kamer, { t, freq: midi(n), gain: rnd(0.05, 0.08), pan: rnd(-0.2, 0.2), dur: rnd(2.5, 4.5), hard: rnd(0.25, 0.45) });
        return rnd(1.1, 2.6) / tempo;
      },
      () => rnd(2, 5) / tempo, 2);
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /**
   * Cellodoek: donkere, aangehouden cellotonen die langzaam aanzwellen, met glissandi en soms een
   * tweede cello er vlak naast, zodat je de tonen tegen elkaar hoort zweven. In de industriële
   * variant komen er metalen resonanties en een verre machine bij.
   */
  function celloDoek(ctx, out, { modus = 'frygisch', grondtoon = 33, industrieel = false, stemmen = 2, stem = false }) {
    const sched = new Sched(ctx); const nodes = [];
    const zaal = reverb(ctx, out, industrieel ? 'irKerk' : 'irLong', 0.5);
    const sc = (MODI[modus] || MODI.frygisch).toonladder;
    const trap = (i) => { const o = Math.floor(i / sc.length); return sc[((i % sc.length) + sc.length) % sc.length] + o * 12; };
    // Bodem: een lage drone die er altijd onder ligt.
    for (const [ratio, amp, det] of [[1, 0.05, -5], [1, 0.045, 6], [2, 0.018, 0]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(grondtoon - 12) * ratio; o.detune.value = det;
      const lp = filt(ctx, 'lowpass', 200, 1.2); const g = gainNode(ctx, amp);
      chain(o, lp, g, zaal); o.start(); nodes.push(o);
      wander(ctx, sched, g.gain, amp * 0.4, amp * 1.4, 13, 8);
      wander(ctx, sched, lp.frequency, 110, 420, 15, 9);
    }
    if (industrieel) {
      // Verre machine en ruimte: laag gebrom dat traag van toonhoogte verandert.
      const brom = ctx.createOscillator(); brom.type = 'sawtooth'; brom.frequency.value = 47;
      const blp = filt(ctx, 'lowpass', 150, 3); const bg = gainNode(ctx, 0.03);
      chain(brom, blp, bg, out); brom.start(); nodes.push(brom);
      wander(ctx, sched, brom.frequency, 42, 58, 16, 9);
      wander(ctx, sched, bg.gain, 0.012, 0.04, 11, 7);
      const lucht = loopNoise(ctx, 'brown'); chain(lucht, filt(ctx, 'lowpass', 300, 0.7), gainNode(ctx, 0.05), out); nodes.push(lucht);
      // Metaal dat ergens wordt aangeslagen: inharmonisch, met een lange staart.
      sched.every(() => rnd(8, 26), (t) => {
        const f = rnd(90, 380); const p = rnd(-0.7, 0.7);
        for (const [ratio, amp, len] of [[1, 1, 1], [1.73, 0.5, 0.8], [2.41, 0.32, 0.6], [3.87, 0.18, 0.4], [5.2, 0.09, 0.25]]) {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio * rnd(0.99, 1.01);
          const g = gainNode(ctx, 0); const dur = rnd(4, 11) * len;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * amp, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
          chain(o, g, panNode(ctx, p), zaal); o.start(t); o.stop(t + dur + 0.1);
        }
        burst(ctx, zaal, { t, dur: 0.05, color: 'white', type: 'highpass', freq: 3000, Q: 0.7, gain: 0.06, attack: 0.001, pan: p });
      }, 6);
    }
    // De cello's zelf: lange tonen, soms twee vlak naast elkaar zodat ze zweven.
    speelReeks(sched,
      () => Array.from({ length: Math.round(rnd(2, 5)) }, () => pick([0, 1, 2, 3, 4, 5, 2, 0])),
      (t, stapIdx) => {
        const n = grondtoon + trap(stapIdx);
        const dur = rnd(9, 20);
        const glis = R() < 0.3 ? midi(n + pick([-2, -1, 1, 2])) : null;
        celloNoot(ctx, zaal, { t, freq: midi(n), dur, gain: 0.055, pan: rnd(-0.25, 0.25), strijk: rnd(0.2, 0.85), glisNaar: glis, vib: rnd(0.2, 0.7) });
        if (stemmen > 1 && R() < 0.55) { // tweede cello, dicht ernaast of een kwint eronder
          const tweede = R() < 0.45 ? n + pick([1, 2]) : n - pick([5, 7, 12]);
          celloNoot(ctx, zaal, { t: t + rnd(0.3, 2), freq: midi(tweede), dur: dur * rnd(0.7, 1), gain: 0.04, pan: rnd(-0.5, 0.5), strijk: rnd(0.15, 0.6), vib: 0.3 });
        }
        if (stem && R() < 0.3) { // een lage, woordloze stem erbij
          koorStem(ctx, zaal, { t: t + rnd(0.5, 3), freq: midi(n + 12), dur: dur * 0.6, gain: 0.035, pan: rnd(-0.2, 0.2), vowel: 1 });
        }
        return dur * rnd(0.55, 0.9);
      },
      () => rnd(4, 12), 2);
    return { stop: stopAll(nodes, sched, ctx) };
  }

  /**
   * Zachte verzadiging: het randje vuil waarmee een synth of een piano niet meer schoon klinkt. De
   * curve is het dure deel en wordt per audiocontext en per mate hergebruikt; de knoop zelf is goedkoop.
   */
  const vormCache = new WeakMap();
  function vervorming(ctx, mate = 0.5) {
    let per = vormCache.get(ctx); if (!per) { per = new Map(); vormCache.set(ctx, per); }
    const sleutel = mate.toFixed(2);
    let curve = per.get(sleutel);
    if (!curve) {
      const n = 2048; curve = new Float32Array(n); const k = 1 + mate * 60;
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
      per.set(sleutel, curve);
    }
    const ws = ctx.createWaveShaper(); ws.curve = curve; ws.oversample = '2x';
    return ws;
  }
  /**
   * Tape: een korte vertraging waarvan de tijd langzaam heen en weer kruipt, wat precies het
   * zeuren van een bandrecorder geeft, plus het ruisplafond van de band zelf. Dat ruisje is geen
   * slordigheid maar het kenmerk: zonder bandloop klinkt deze muziek steriel.
   */
  function tape(ctx, out, { wow = 0.0016, snelheid = 0.7, ruis = 0.004 }) {
    const inp = gainNode(ctx, 1); const d = ctx.createDelay(0.2); d.delayTime.value = 0.02;
    const lfo = ctx.createOscillator(); lfo.frequency.value = snelheid; const lg = gainNode(ctx, wow);
    chain(lfo, lg); lg.connect(d.delayTime); lfo.start();
    chain(inp, d, out);
    const sis = loopNoise(ctx, 'pink'); chain(sis, filt(ctx, 'highpass', 1600, 0.6), gainNode(ctx, ruis), out);
    return { in: inp, nodes: [lfo, sis] };
  }
  /**
   * Donkere elektronische filmmuziek: strak, koud en vuil, met een dreunende sub eronder.
   *
   * Het hart is de sequencer, en die is bewust monofoon gebouwd zoals een echte analoge sequencer:
   * één oscillator die nooit stopt, één filter, één versterker, en het patroon zit volledig in de
   * automatisering. Dat is niet alleen goedkoop (vier audioknopen voor het hele stuk in plaats van
   * vijf per noot bij zestienden), het klinkt ook juister — je hoort het glijden tussen de tonen en
   * de filter die over minuten opent, precies waar deze muziek het van moet hebben.
   *
   * Stijlen: 'sequencer' (onverstoorbaar arpeggio dat heel traag van kleur verandert), 'koudepiano'
   * (een simpel pianomotief, hard aangeslagen en net ontstemd, boven een lage drone) en
   * 'machine' (metaal en ruis in een fabriekshal, zonder melodie).
   */
  function donkereScore(ctx, out, { stijl = 'sequencer', modus = 'eolisch', grondtoon = 40, bpm = 100, vuil = 0.5, sub = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const tel = 60 / bpm;
    const sc = (MODI[modus] || MODI.eolisch).toonladder;
    const trap = (i) => { const o = Math.floor(i / sc.length); return sc[((i % sc.length) + sc.length) % sc.length] + o * 12; };
    // Een resonante filter en een verzadiger leveren een veel hetere uitgang dan de andere generatoren.
    // Zonder deze demping werd dit stuk door de compressor per laag platgedrukt, en dat hoor je pompen.
    // Alles gaat hier eerst doorheen, zodat `level` in de catalogus gewoon rond de 1 kan blijven.
    const uit = gainNode(ctx, 0.16); uit.connect(out);
    const ruimte = reverb(ctx, uit, 'irLong', 0.3);
    const band = tape(ctx, uit, { wow: 0.0014 + vuil * 0.002, snelheid: rnd(0.5, 0.9), ruis: 0.003 + vuil * 0.006 });
    nodes.push(...band.nodes);
    const vuilBus = vervorming(ctx, 0.25 + vuil * 0.5); vuilBus.connect(band.in);

    // Sub: de dreun onder alles. Hij komt op de tel en zakt weer weg, zodat het ademt in plaats van bromt.
    if (sub) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(grondtoon - 24);
      const g = gainNode(ctx, 0); const lp = filt(ctx, 'lowpass', 90, 1.2);
      chain(o, lp, g, uit); o.start(); nodes.push(o);
      sched.every(() => tel * 4, (t) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + tel * rnd(2.2, 3.4));
      });
      wander(ctx, sched, o.frequency, midi(grondtoon - 24) * 0.99, midi(grondtoon - 24) * 1.01, 9, 6);
    }

    if (stijl === 'sequencer') {
      // Twee oscillatoren die nooit stoppen, samen door één filter en één versterker: een analoge
      // monosynth. Alles wat je hoort gebeuren is automatisering op die vier knopen.
      const vca = gainNode(ctx, 0);
      const vcf = filt(ctx, 'lowpass', 600, 9);           // hoge resonantie: daar zit het karakter
      chain(vca, vcf, vervorming(ctx, 0.2 + vuil * 0.35), panNode(ctx, 0), vuilBus);
      const osc = [0, 1].map((i) => {
        const o = ctx.createOscillator(); o.type = i ? 'square' : 'sawtooth';
        o.detune.value = i ? rnd(5, 11) : rnd(-11, -5);
        chain(o, gainNode(ctx, i ? 0.35 : 0.6), vca); o.start(); nodes.push(o); return o;
      });
      // De filter kruipt over minuten open en weer dicht: dat is de hele ontwikkeling van het stuk.
      // Niet verder dichtknijpen dan 420 Hz, want dan valt het minutenlang zo goed als weg — met een
      // wijder bereik scheelde het gemeten een factor tien in volume tussen twee momenten.
      wander(ctx, sched, vcf.frequency, 420, 2400, 22, 14);
      wander(ctx, sched, vcf.Q, 5, 12, 17, 10);
      let patroon = Array.from({ length: 8 }, () => pick([0, 0, 2, 3, 4, 5, 7]));
      let i = 0;
      sched.every(() => tel / 2, (t) => {                  // zestienden bij een halve tel per stap
        const stap = patroon[i % patroon.length]; i++;
        if (i % (patroon.length * 4) === 0) patroon[Math.floor(R() * patroon.length)] = pick([0, 2, 3, 5, 7, 9]); // één noot verschuift
        const f = midi(grondtoon + 12 + trap(stap));
        for (const o of osc) o.frequency.setTargetAtTime(f, t, 0.004); // net geen sprong: dat glijdt
        const hard = (i % 4 === 1) ? 1 : rnd(0.45, 0.8);   // lichte nadruk op de tel
        vca.gain.setValueAtTime(0.0001, t);
        vca.gain.linearRampToValueAtTime(0.075 * hard, t + 0.006);
        vca.gain.exponentialRampToValueAtTime(0.0001, t + tel * rnd(0.3, 0.48));
      });
      // Een enkele lage aanhoudende toon eronder, die de tonaliteit vasthoudt.
      const pad = ctx.createOscillator(); pad.type = 'sawtooth'; pad.frequency.value = midi(grondtoon);
      const padLp = filt(ctx, 'lowpass', 300, 1.4); const padG = gainNode(ctx, 0.02);
      chain(pad, padLp, padG, ruimte); pad.start(); nodes.push(pad);
      wander(ctx, sched, padG.gain, 0.008, 0.03, 13, 8);
    }

    if (stijl === 'koudepiano') {
      // Piano met een harde aanslag en weinig naklank, dubbel gespeeld met een tweede die er net
      // naast staat. Die kleine onzuiverheid tussen de twee is wat het koud en onbehaaglijk maakt.
      const piano = (t, n, gain, pan, ontstem) => {
        const f = midi(n) * ontstem;
        const bus = panNode(ctx, pan); chain(bus, vuilBus);
        for (const [ratio, amp, len] of [[1, 1, 1], [2, 0.5, 0.55], [3, 0.22, 0.3], [4.1, 0.1, 0.2], [5.9, 0.04, 0.12]]) {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
          const g = gainNode(ctx, 0); const dur = rnd(1.6, 2.6) * len;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
          chain(o, g, bus); o.start(t); o.stop(t + dur + 0.05);
        }
        burst(ctx, bus, { t, dur: 0.012, color: 'white', type: 'bandpass', freq: rnd(1800, 4200), Q: 1.6, gain: gain * 0.5, attack: 0.0006 });
      };
      // Een kort motief dat eindeloos terugkomt en af en toe een noot verlegt.
      let motief = [0, 4, 3, 4, 2, 4, 0, -1];
      speelReeks(sched,
        () => { if (R() < 0.25) motief[Math.floor(R() * motief.length)] = pick([-1, 0, 2, 3, 4, 5]); return motief.slice(); },
        (t, stap) => {
          const n = grondtoon + 24 + trap(stap);
          piano(t, n, rnd(0.05, 0.075), -0.12, 1);
          piano(t + rnd(0.004, 0.02), n, rnd(0.03, 0.05), 0.14, rnd(0.9965, 1.0035)); // de tweede, net ernaast
          if (R() < 0.3) piano(t, n - 12, 0.035, 0, 1);
          return tel * pick([1, 1, 1, 1.5, 2]);
        },
        () => tel * rnd(2, 5), 2);
      // Lage strijkerslaag die er traag onder aanzwelt.
      speelReeks(sched,
        () => [0, 3, 2, 5],
        (t, stap) => { const dur = rnd(14, 26); strijkerNoot(ctx, ruimte, { t, freq: midi(grondtoon + trap(stap)), dur, gain: 0.032, pan: rnd(-0.3, 0.3), spelers: 3, aanzet: rnd(5, 9), helder: 0.75 }); return dur * 0.8; },
        () => rnd(6, 16), 4);
    }

    if (stijl === 'machine') {
      // Een fabriekshal: geen melodie, alleen ruimte, metaal en een motor die nooit helemaal gelijk loopt.
      const motor = loopNoise(ctx, 'brown'); const mLp = filt(ctx, 'lowpass', 170, 2.4); const mG = gainNode(ctx, 0.06);
      chain(motor, mLp, mG, vuilBus); nodes.push(motor);
      wander(ctx, sched, mLp.frequency, 110, 320, 7, 5);
      wander(ctx, sched, mG.gain, 0.03, 0.09, 5, 3.5);
      const zoem = ctx.createOscillator(); zoem.type = 'sawtooth'; zoem.frequency.value = midi(grondtoon - 12);
      const zLp = filt(ctx, 'lowpass', 260, 3); const zG = gainNode(ctx, 0.03);
      chain(zoem, zLp, zG, vuilBus); zoem.start(); nodes.push(zoem);
      wander(ctx, sched, zoem.detune, -25, 25, 11, 7);
      wander(ctx, sched, zLp.frequency, 180, 900, 13, 8);
      // Metaal dat wordt aangeslagen, op een raster dat net niet klopt.
      let slag = 0;
      sched.every(() => tel * pick([1, 1, 1.5, 2, 2, 3]), (t) => {
        slag++;
        if (R() < 0.25) return;                            // gaten in het ritme zijn belangrijker dan de slagen
        const f = rnd(140, 520), p = rnd(-0.75, 0.75), kracht = (slag % 4 === 1) ? rnd(0.7, 1) : rnd(0.2, 0.55);
        const bus = panNode(ctx, p); chain(bus, ruimte);
        for (const [ratio, amp, len] of [[1, 1, 1], [1.71, 0.55, 0.7], [2.43, 0.34, 0.5], [3.89, 0.16, 0.3]]) {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio * rnd(0.99, 1.01);
          const g = gainNode(ctx, 0); const dur = rnd(1.4, 4) * len;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * kracht * amp, t + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
          chain(o, g, bus); o.start(t); o.stop(t + dur + 0.05);
        }
        burst(ctx, bus, { t, dur: 0.03, color: 'white', type: 'highpass', freq: rnd(2500, 6000), Q: 0.8, gain: 0.05 * kracht, attack: 0.0006 });
      });
      // Stoom of perslucht die af en toe ontsnapt.
      sched.every(() => rnd(9, 26), (t) => burst(ctx, ruimte, { t, dur: rnd(0.4, 1.6), color: 'white', type: 'bandpass', freq: rnd(1800, 4500), Q: rnd(1.5, 4), gain: rnd(0.03, 0.07), attack: rnd(0.03, 0.2), pan: rnd(-0.7, 0.7), freqEnd: rnd(700, 2200) }));
    }
    return { stop: stopAll(nodes, sched, ctx) };
  }

  // ---- Middeleeuwse kerkmuziek ---------------------------------------------------------------------
  // Kerktoonsoorten: gregoriaans staat niet in majeur of mineur maar in een modus. De finalis is de
  // slottoon, de reciteertoon de noot waarop de tekst gezongen wordt.
  const MODI = {
    dorisch: { toonladder: [0, 2, 3, 5, 7, 9, 10], reciteer: 4 },     // op re
    frygisch: { toonladder: [0, 1, 3, 5, 7, 8, 10], reciteer: 5 },    // op mi, donkerder
    lydisch: { toonladder: [0, 2, 4, 6, 7, 9, 11], reciteer: 4 },     // op fa, licht
    mixolydisch: { toonladder: [0, 2, 4, 5, 7, 9, 10], reciteer: 4 }, // op sol
    eolisch: { toonladder: [0, 2, 3, 5, 7, 8, 10], reciteer: 4 },
  };
  const graad = (modus, i) => { const sc = MODI[modus].toonladder; const o = Math.floor(i / sc.length); return sc[((i % sc.length) + sc.length) % sc.length] + o * 12; };
  // Latijnse klinkers zoals ze in gezang klinken, met hun formanten.
  const ZANG_KLINKERS = { a: [700, 1150, 2600], e: [500, 1750, 2500], i: [320, 2100, 2900], o: [450, 850, 2500], u: [340, 700, 2350] };
  const ZANG_REEKS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'a', 'o'];

  /**
   * Eén gezongen noot door een groep zangers.
   *
   * Drie dingen bepalen of dit als een stem klinkt of als een synthesizer. Ten eerste de bron: een
   * kale zaagtand valt 6 dB per octaaf af, stembanden ongeveer 12. Dat verschil is precies het
   * blikkerige, nasale randje, dus de bron gaat eerst door een kanteling en een demping van de
   * hoogte. Ten tweede: niets aan een stem is exact. De toonhoogte zwerft continu een fractie
   * (jitter), elke zanger heeft zijn eigen vibratotempo, en de aanzet komt van iets onder de noot
   * omhoog gegleden. Ten derde vult een beetje ongefilterde bron de dalen tussen de formanten op;
   * zonder dat hoor je de drie banden los van elkaar, en dat is het vocoder-effect.
   */
  function zangNoot(ctx, out, { t, freq, dur, klinker = 'a', gain = 0.06, zangers = 4, pan = 0, vibrato = 0.35, glijNaar = null, adem = true }) {
    const F = ZANG_KLINKERS[klinker] || ZANG_KLINKERS.a;
    // De zangers zingen dezelfde klinker, dus één set formantfilters volstaat voor de hele noot.
    // Dat scheelt ruim vier keer zoveel audioknopen als een set per zanger, en dat hoor je: geen gehaper.
    const env = gainNode(ctx, 0);
    const aan = Math.min(0.24, dur * 0.35), af = Math.min(0.35, dur * 0.5);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain * 0.8, t + aan * 0.5);
    env.gain.linearRampToValueAtTime(gain, t + aan);                       // adem zwelt nog even door
    env.gain.setTargetAtTime(gain * rnd(0.86, 1.04), t + aan, dur * 0.45);  // en houdt nooit precies stil
    env.gain.setValueAtTime(gain * 0.92, t + Math.max(aan, dur - af));
    env.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.18);
    const som = gainNode(ctx, 1);
    chain(som, env, panNode(ctx, pan), out);
    const bp = F.map((f, i) => { const b = filt(ctx, 'bandpass', f * rnd(0.97, 1.03), i === 0 ? 5.5 : 8); chain(b, gainNode(ctx, [1, 0.45, 0.18][i]), som); return b; });
    // Bron: alle zangers samen, met een stukje dat de formanten overslaat zodat het spectrum tussen
    // de banden niet leeg is. Het juiste spectrale verloop zit al in de golfvorm (zie stemGolf).
    const bron = gainNode(ctx, 1);
    for (const b of bp) bron.connect(b);
    chain(bron, gainNode(ctx, 0.13), som);
    // Vibrato: twee tempo's, zodat de zangers niet allemaal in hetzelfde ritme trillen. Het zet laat
    // in en blijft klein, want middeleeuwse zang is vlak van toon.
    const trillers = [0, 1].map(() => {
      const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(4.3, 6.1);
      const lg = gainNode(ctx, 0); lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(vibrato * rnd(4, 10), t + Math.min(1, dur * 0.7));
      chain(lfo, lg); lfo.start(t); lfo.stop(t + dur + 0.3); return lg;
    });
    if (adem && R() < 0.3) {  // hoorbaar ademhalen vlak voor de inzet
      burst(ctx, som, { t: Math.max(0, t - 0.06), dur: rnd(0.12, 0.26), color: 'pink', type: 'bandpass', freq: F[1] * rnd(0.7, 1.2), Q: 1.1, gain: gain * 0.4, attack: 0.05, pan });
    }
    // Per zanger een eigen stem met eigen inzet, ontstemming, aanzet en toonhoogtezwerving.
    for (let z = 0; z < zangers; z++) {
      const tt = t + rnd(0, 0.06); // niet allemaal precies tegelijk
      const stem = gainNode(ctx, 0);
      stem.gain.setValueAtTime(0, tt);
      // Stemmen tellen niet recht op elkaar op (ze staan net naast elkaar), vandaar de wortel.
      stem.gain.linearRampToValueAtTime(rnd(0.8, 1.2) * 2 / Math.sqrt(zangers), tt + Math.min(0.16, dur * 0.35));
      const o = ctx.createOscillator(); o.setPeriodicWave(stemGolf(ctx)); o.detune.value = rnd(-11, 11);
      const f0 = freq * rnd(0.996, 1.004);
      o.frequency.setValueAtTime(f0 * rnd(0.93, 0.98), tt);                    // van onderaf inzetten
      o.frequency.exponentialRampToValueAtTime(f0, tt + rnd(0.06, 0.16));
      let jt = tt + 0.2;                                                        // en daarna blijven zwerven
      for (let k = 0; k < 10 && jt < tt + dur; k++) { o.frequency.setTargetAtTime(f0 * rnd(0.993, 1.007), jt, 0.09); jt += rnd(0.14, 0.4); }
      if (glijNaar) o.frequency.setTargetAtTime(glijNaar, tt + dur * 0.8, 0.05); // binden bij een melisme
      trillers[z % 2].connect(o.detune); chain(o, stem, bron); o.start(tt); o.stop(tt + dur + 0.3);
    }
  }
  /**
   * Bouwt een gregoriaanse frase: intonatie omhoog, tekst op de reciteertoon, en een cadens die
   * naar de finalis daalt. Geeft een lijst [graad, duur, klinker] terug.
   */
  function chantFrase(modus, { lengte = 8, melisma = 0.35, ambitus = 5 } = {}) {
    const r = MODI[modus].reciteer;
    const noten = [];
    const zet = (g, d, k) => noten.push([g, d, k || pick(ZANG_REEKS)]);
    // Intonatie: van de finalis stapsgewijs omhoog naar de reciteertoon.
    let g = 0;
    while (g < r) { zet(g, rnd(0.45, 0.8)); g += R() < 0.75 ? 1 : 2; }
    // Recitatie: de tekst wordt op één toon gezongen, met af en toe een buurnoot.
    for (let i = 0; i < lengte; i++) {
      zet(r, rnd(0.3, 0.55));
      if (R() < 0.22) zet(r + (R() < 0.6 ? 1 : -1), rnd(0.25, 0.4));
      if (R() < melisma * 0.35) { const op = R() < 0.5 ? 1 : -1; for (let m = 0; m < Math.round(rnd(2, 4)); m++) zet(r + op * (m % 2 ? 1 : 0) + (R() < 0.3 ? 1 : 0), rnd(0.16, 0.26)); }
    }
    // Cadens: dalen naar de finalis, met een melisme op de voorlaatste lettergreep.
    let d = r + (R() < 0.4 ? 1 : 0);
    if (R() < melisma) { for (const stap of [1, 0, -1, 0]) zet(Math.max(0, d + stap), rnd(0.18, 0.3)); }
    while (d > 1) { zet(d, rnd(0.35, 0.7)); d -= R() < 0.8 ? 1 : 2; }
    zet(1, rnd(0.4, 0.6)); zet(0, rnd(1.4, 2.4)); // slotnoot lang aanhouden
    return noten;
  }
  /**
   * Gregoriaans gezang. Eenstemmig mannenkoor in een grote kerk: vrije ritmiek, modaal, met stiltes
   * tussen de frasen waarin de galm wegsterft. Optioneel een bourdon of een tweede stem in kwinten
   * (organum, de vroegste meerstemmigheid).
   */
  function gregoriaans(ctx, out, { modus = 'dorisch', grondtoon = 45, tempo = 1, zangers = 5, bourdon = false, organum = false, hoog = false, sprongen = 0, kaars = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const kerk = reverb(ctx, out, 'irKerk', 0.72);
    // Stilte in een stenen kerk is niet leeg: er is een heel lage ruis en soms een kaars of een tocht.
    const stilte = loopNoise(ctx, 'brown'); chain(stilte, filt(ctx, 'lowpass', 120, 0.7), gainNode(ctx, 0.03), out); nodes.push(stilte);
    if (bourdon) { // aangehouden grondtoon, zoals een orgelpunt
      // Windvoorziening: de bourdon ademt en zweeft licht, zodat het geen stilstaande toon wordt.
      const wind = ctx.createOscillator(); wind.frequency.value = 0.14; const windG = gainNode(ctx, 3);
      chain(wind, windG); wind.start(); nodes.push(wind);
      wander(ctx, sched, windG.gain, 1.2, 5.5, 10, 6);
      wander(ctx, sched, wind.frequency, 0.09, 0.24, 13, 7);
      for (const [ratio, amp, det] of [[1, 0.05, -6], [1, 0.05, 7], [1.5, 0.022, 0], [2, 0.02, 4]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(grondtoon - 12) * ratio; o.detune.value = det;
        windG.connect(o.detune);
        const lp = filt(ctx, 'lowpass', 700, 0.9); const g = gainNode(ctx, amp);
        chain(o, lp, g, kerk); o.start(); nodes.push(o);
        wander(ctx, sched, g.gain, amp * 0.6, amp * 1.25, 7, 4);
        wander(ctx, sched, lp.frequency, 420, 1200, 11, 6); // het register kleurt langzaam mee
      }
    }
    const tel = 0.62 / tempo;
    speelReeks(sched,
      () => { // volgende frase klaarzetten
        const frase = chantFrase(modus, { lengte: Math.round(rnd(4, 12)), melisma: hoog ? 0.85 : 0.35 });
        return frase.map(([g, d, k], i) => ({ g, d, k, eerste: i === 0, laatste: i === frase.length - 1, volgendeGraad: frase[i + 1] ? frase[i + 1][0] : null }));
      },
      (t, noot) => {
        let n = grondtoon + graad(modus, noot.g) + (hoog ? 12 : 0);
        // Hildegard springt: aan het begin van een frase omhoog, daarna weer dalend.
        if (sprongen && noot.eerste && R() < sprongen) n += pick([5, 7, 12]);
        else if (sprongen && R() < sprongen * 0.25) n += pick([4, 5, 7]);
        const dur = noot.d * tel * rnd(0.9, 1.15);
        const volg = noot.volgendeGraad != null ? midi(grondtoon + graad(modus, noot.volgendeGraad) + (hoog ? 12 : 0)) : null;
        zangNoot(ctx, kerk, {
          t, freq: midi(n), dur, klinker: noot.k, gain: hoog ? 0.05 : 0.055, zangers,
          pan: rnd(-0.12, 0.12), vibrato: hoog ? 0.5 : 0.3, glijNaar: noot.d < 0.3 ? volg : null,
        });
        if (organum) zangNoot(ctx, kerk, { t, freq: midi(n - (noot.laatste ? 0 : 7)), dur, klinker: noot.k, gain: 0.04, zangers: Math.max(2, zangers - 2), pan: rnd(-0.3, 0.3), vibrato: 0.2 });
        return dur;
      },
      () => rnd(3.5, 7)); // adempauze; de galm sterft weg
    if (kaars) sched.every(() => rnd(20, 60), (t) => burst(ctx, out, { t, dur: rnd(0.02, 0.06), color: 'white', type: 'bandpass', freq: rnd(900, 2600), Q: 3, gain: rnd(0.01, 0.03), attack: 0.003, pan: rnd(-0.6, 0.6) })); // een kaars knapt
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /** Stille kapel: alleen een bourdon, verre klok en af en toe een kort gezongen fragment. */
  function kapel(ctx, out, { modus = 'dorisch', grondtoon = 45 }) {
    const sched = new Sched(ctx); const nodes = [];
    const kerk = reverb(ctx, out, 'irKerk', 0.75);
    const stilte = loopNoise(ctx, 'brown'); chain(stilte, filt(ctx, 'lowpass', 130, 0.7), gainNode(ctx, 0.035), out); nodes.push(stilte);
    // Windvoorziening: het balgwerk ademt, waardoor de hele bourdon licht zweeft.
    const wind = ctx.createOscillator(); wind.frequency.value = 0.12; const windG = gainNode(ctx, 3.5);
    chain(wind, windG); wind.start(); nodes.push(wind);
    wander(ctx, sched, windG.gain, 1.5, 6, 11, 6);
    wander(ctx, sched, wind.frequency, 0.08, 0.22, 14, 8);
    for (const [ratio, amp, det] of [[1, 0.055, -7], [1, 0.055, 8], [1.5, 0.025, 0], [2, 0.022, 5], [3, 0.008, -4]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(grondtoon - 12) * ratio; o.detune.value = det;
      windG.connect(o.detune);
      const lp = filt(ctx, 'lowpass', 600, 0.9); const g = gainNode(ctx, amp);
      chain(o, lp, g, kerk); o.start(); nodes.push(o);
      wander(ctx, sched, g.gain, amp * 0.5, amp * 1.3, 8, 5);
      wander(ctx, sched, lp.frequency, 350, 1100, 9, 6);
    }
    // Een enkele gezongen regel, ver weg. Noot voor noot via de planner: een hele frase in één
    // callback maken gaf een piek van honderden audioknopen, en dat hoor je als hapering.
    speelReeks(sched,
      () => chantFrase(modus, { lengte: Math.round(rnd(2, 5)), melisma: 0.4 }),
      (t, [g, d, k]) => {
        const dur = d * 0.7;
        zangNoot(ctx, kerk, { t, freq: midi(grondtoon + graad(modus, g)), dur, klinker: k, gain: 0.03, zangers: 3, pan: rnd(-0.2, 0.2) });
        return dur;
      },
      () => rnd(35, 80), 8);
    // Klok in de toren.
    sched.every(() => rnd(60, 140), (t) => {
      const n = Math.round(rnd(1, 4));
      for (let i = 0; i < n; i++) tone(ctx, kerk, { t: t + i * 2.6, freq: midi(45), dur: 0.06, release: 4.5, gain: 0.05, attack: 0.005, partials: [[1, 1], [2.01, 0.4], [2.98, 0.22], [4.15, 0.1], [5.4, 0.05]] });
    }, 20);
    sched.every(() => rnd(25, 70), (t) => burst(ctx, out, { t, dur: rnd(0.02, 0.06), color: 'white', type: 'bandpass', freq: rnd(900, 2600), Q: 3, gain: rnd(0.01, 0.03), attack: 0.003, pan: rnd(-0.6, 0.6) }));
    return { stop: stopAll(nodes, sched, ctx) };
  }

  // ---- Kerst -------------------------------------------------------------------------------------
  /** Kiest bij een melodienoot een passend akkoord (I, IV of V), zoals in een kerkgezang. */
  function hymneAkkoord(semi) {
    const kandidaten = [[0, [0, 4, 7]], [5, [5, 9, 12]], [7, [7, 11, 14]]];
    const pc = ((semi % 12) + 12) % 12;
    for (const [, tonen] of kandidaten) if (tonen.some((t) => ((t % 12) + 12) % 12 === pc)) return tonen;
    return [0, 4, 7];
  }
  /** Eén gezongen klinker: stem met formanten, langzame inzet en lichte vibrato. */
  function koorStem(ctx, out, { t, freq, dur, gain = 0.07, pan = 0, vowel = 0 }) {
    const klinker = [[700, 1150, 2600], [350, 800, 2400], [500, 1500, 2500]][vowel];
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain * 0.82, t + Math.min(0.2, dur * 0.2));
    env.gain.linearRampToValueAtTime(gain, t + Math.min(0.4, dur * 0.35));
    env.gain.setTargetAtTime(gain * rnd(0.88, 1.04), t + Math.min(0.4, dur * 0.35), dur * 0.4);
    env.gain.setValueAtTime(gain * 0.95, t + dur * 0.78);
    env.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.3);
    const som = gainNode(ctx, 1); chain(som, env, panNode(ctx, pan), out);
    // Zie stemGolf en zangNoot: het spectrale verloop zit in de bronvorm, en een beetje ongefilterde
    // bron vult de dalen tussen de formanten.
    const bron = gainNode(ctx, 1);
    klinker.forEach((f, i) => {
      const bp = filt(ctx, 'bandpass', f * rnd(0.96, 1.04), i === 0 ? 5.5 : 8);
      chain(bp, gainNode(ctx, [1, 0.45, 0.18][i]), som); bron.connect(bp);
    });
    chain(bron, gainNode(ctx, 0.13), som);
    const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(4.4, 6);
    const lg = gainNode(ctx, 0); lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(rnd(5, 11), t + Math.min(0.9, dur * 0.6));
    chain(lfo, lg); lfo.start(t); lfo.stop(t + dur + 0.3);
    // Twee licht ontstemde bronnen: dat maakt het een koor en niet één zanger.
    for (const det of [-6, 7]) {
      const o = ctx.createOscillator(); o.setPeriodicWave(stemGolf(ctx)); o.detune.value = det + rnd(-4, 4);
      const f0 = freq * rnd(0.997, 1.003);
      o.frequency.setValueAtTime(f0 * rnd(0.94, 0.985), t);            // van onderaf inzetten
      o.frequency.exponentialRampToValueAtTime(f0, t + rnd(0.07, 0.18));
      let jt = t + 0.25;
      for (let k = 0; k < 10 && jt < t + dur; k++) { o.frequency.setTargetAtTime(f0 * rnd(0.994, 1.006), jt, 0.1); jt += rnd(0.18, 0.5); }
      lg.connect(o.detune); o.connect(bron); o.start(t); o.stop(t + dur + 0.3);
    }
  }
  /** Kerstkoor: bekende kerstliederen, vierstemmig, in een kerkachtige ruimte. */
  function kerstkoor(ctx, out, { orgel = false }) {
    const sched = new Sched(ctx); const rev = reverb(ctx, out, 'irLong', 0.62);
    const nodes = [];
    if (orgel) { // zacht orgelregister eronder
      const p = pads(ctx, out, { scale: 'major', root: 43, warmth: 0.35, sparkle: false, chordLen: [10, 16], voices: 3 });
      nodes.push(p);
    }
    let order = Object.keys(CAROLS).sort(() => R() - 0.5), ci = 0;
    let root = 60, beat = 0.7;
    speelReeks(sched,
      () => { const c = CAROLS[order[ci % order.length]]; ci++; root = 60 + pick([0, -2, 2, -4]); beat = 60 / (c.bpm * 0.82); return c.notes.slice(); }, // koren zingen rustiger
      (t, [semi, beats]) => {
        const dur = beats * beat;
        koorStem(ctx, rev, { t, freq: midi(root + semi), dur, gain: 0.075, pan: rnd(-0.15, 0.15), vowel: 0 });
        hymneAkkoord(semi).forEach((s, i) => koorStem(ctx, rev, { t: t + rnd(0, 0.04), freq: midi(root + s - 12 - (i === 0 ? 12 : 0)), dur, gain: i === 0 ? 0.05 : 0.038, pan: (i - 1) * 0.45, vowel: i === 0 ? 1 : 2 }));
        return dur;
      },
      () => rnd(6, 12));
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /** Carillon: heldere klokkenspeltonen (inharmonisch, zoals echte klokken) op kerstliederen. */
  function carillon(ctx, out, { snow = true }) {
    const sched = new Sched(ctx); const rev = reverb(ctx, out, 'irLong', 0.6); const nodes = [];
    if (snow) { const w = wind(ctx, out, { strength: 0.25, trees: false }); nodes.push(w); }
    const bel = (t, n, gain) => {
      const f = midi(n);
      // De klepel die het brons raakt: een korte metaalklap voor de toon inzet. Zonder die aanslag
      // klinkt een klok als een orgelpijp.
      burst(ctx, rev, { t, dur: 0.025, color: 'white', type: 'bandpass', freq: f * rnd(4, 9), Q: 1.2, gain: gain * 0.45, attack: 0.0008, pan: rnd(-0.3, 0.3) });
      for (const [ratio, amp, len] of [[0.5, 0.35, 1], [1, 1, 0.9], [1.19, 0.3, 0.55], [1.5, 0.22, 0.45], [2, 0.4, 0.5], [2.5, 0.12, 0.3], [3.01, 0.09, 0.22]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
        const g = gainNode(ctx, 0); const dur = rnd(2.2, 4) * len;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
        chain(o, g, panNode(ctx, rnd(-0.3, 0.3)), rev); o.start(t); o.stop(t + dur + 0.05);
      }
    };
    let order = Object.keys(CAROLS).sort(() => R() - 0.5), ci = 0;
    let root = 72, beat = 0.6;
    speelReeks(sched,
      () => { const c = CAROLS[order[ci % order.length]]; ci++; root = 72 + pick([0, -2, 3]); beat = 60 / (c.bpm * 0.9); return c.notes.slice(); },
      (t, [semi, beats]) => { bel(t, root + semi, 0.075 + 0.02 * (beats >= 2)); if (R() < 0.3) bel(t + 0.02, root + semi - 12, 0.035); return beats * beat; },
      () => rnd(8, 16), 1);
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /** Arrenslee: sleebellen op het ritme van de draf, hoefslag in de sneeuw en de glijders. */
  function sleighRide(ctx, out, { speed = 1 }) {
    const sched = new Sched(ctx); const nodes = [];
    const beat = 0.42 / speed; // één draftel
    // Glijders door de sneeuw: zacht, breed ruisen dat meebeweegt.
    const glij = loopNoise(ctx, 'pink'); const gbp = filt(ctx, 'bandpass', 900, 0.8); const gg = gainNode(ctx, 0.03);
    chain(glij, gbp, gg, out); nodes.push(glij);
    wander(ctx, sched, gg.gain, 0.02, 0.05, 1.5, 1);
    const sneeuw = loopNoise(ctx, 'brown'); chain(sneeuw, filt(ctx, 'lowpass', 260, 0.7), gainNode(ctx, 0.04), out); nodes.push(sneeuw);
    /** Eén rinkel: een handvol belletjes met elk een eigen toon. */
    const rinkel = (t, kracht, pan) => {
      const n = Math.round(rnd(4, 7));
      for (let i = 0; i < n; i++) {
        const f = rnd(2400, 5200), tt = t + rnd(0, 0.03), dur = rnd(0.12, 0.3);
        // Eén panner per belletje in plaats van per boventoon: dat scheelt de helft van de knopen,
        // en bij vier rinkels per seconde telt dat op.
        const uit = panNode(ctx, clamp(pan + rnd(-0.25, 0.25), -1, 1)); uit.connect(out);
        for (const [ratio, amp] of [[1, 1], [2.74, 0.45]]) {
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
          const g = gainNode(ctx, 0);
          g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.02 * kracht * amp * rnd(0.6, 1.3), tt + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0003, tt + dur);
          chain(o, g, uit); o.start(tt); o.stop(tt + dur + 0.03);
        }
      }
    };
    /** Hoef in de sneeuw: doffe bons met een knerp erover. */
    const hoef = (t, kracht, pan) => {
      tone(ctx, out, { t, freq: rnd(90, 140), glideTo: rnd(50, 70), dur: 0.02, release: 0.09, gain: 0.1 * kracht, attack: 0.002, pan, type: 'triangle' });
      burst(ctx, out, { t, dur: rnd(0.03, 0.07), color: 'white', type: 'bandpass', freq: rnd(900, 2200), Q: 1.4, gain: 0.05 * kracht, attack: 0.002, pan });
    };
    // Draf: twee bellen per tel, hoefslagen in paren.
    sched.every(() => beat * 2, (t) => {
      rinkel(t, 1, -0.1); rinkel(t + beat * 0.5, 0.55, 0.15);
      rinkel(t + beat, 0.85, 0.1); rinkel(t + beat * 1.5, 0.5, -0.15);
      hoef(t, 1, -0.2); hoef(t + beat * 0.42, 0.7, 0.1);
      hoef(t + beat, 0.9, 0.2); hoef(t + beat * 1.45, 0.65, -0.1);
    });
    // Af en toe een kerkklok in de verte. De galm staat buiten de planner: dat is de duurste knoop.
    const verte = reverb(ctx, out, 'irLong', 0.7);
    sched.every(() => rnd(40, 90), (t) => {
      for (let i = 0; i < 3; i++) tone(ctx, verte, { t: t + i * 2.4, freq: midi(50), dur: 0.05, release: 3.5, gain: 0.05, attack: 0.005, partials: [[1, 1], [2.02, 0.4], [2.98, 0.2], [4.1, 0.08]] });
    });
    return { stop: stopAll(nodes, sched, ctx) };
  }
  /** Knerpende sneeuw: wandelen door verse sneeuw, met wind en soms een klok in de verte. */
  function snowWalk(ctx, out, { pace = 1, bells = true }) {
    const sched = new Sched(ctx); const nodes = [];
    const w = wind(ctx, out, { strength: 0.3, trees: false }); nodes.push(w);
    /**
     * Eén stap. Een voet in de sneeuw maakt twee geluiden: het neerkomen, waarbij de sneeuw
     * samengedrukt wordt en het hardst knerpt, en het optillen, een kortere en lichtere knerp
     * doordat de zool loskomt. Alleen het neerkomen klinkt als iemand die op knäckebröd stapt.
     */
    const stap = (t, kracht, pan) => {
      const n = Math.round(rnd(4, 9));
      for (let i = 0; i < n; i++) {
        burst(ctx, out, {
          t: t + i * rnd(0.004, 0.022), dur: rnd(0.006, 0.03), color: 'white', type: 'bandpass',
          freq: rnd(1200, 5000), Q: rnd(2, 6), gain: rnd(0.02, 0.09) * kracht, attack: 0.001, pan,
        });
      }
      tone(ctx, out, { t, freq: rnd(70, 110), glideTo: 45, dur: 0.015, release: 0.07, gain: 0.05 * kracht, attack: 0.002, pan, type: 'triangle' });
      const los = t + rnd(0.14, 0.24);
      for (let i = 0; i < Math.round(rnd(2, 4)); i++) {
        burst(ctx, out, { t: los + i * rnd(0.006, 0.02), dur: rnd(0.005, 0.018), color: 'white', type: 'bandpass', freq: rnd(2200, 6000), Q: rnd(2, 5), gain: rnd(0.01, 0.035) * kracht, attack: 0.001, pan });
      }
    };
    let links = true;
    sched.every(() => rnd(0.5, 0.68) / pace, (t) => { stap(t, rnd(0.7, 1.1), links ? -0.25 : 0.25); links = !links; });
    // De galm wordt buiten de planner gemaakt: convolutiegalm is de duurste knoop die er is.
    const verte = reverb(ctx, out, 'irLong', 0.75);
    if (bells) sched.every(() => rnd(50, 120), (t) => {
      for (let i = 0; i < 4; i++) tone(ctx, verte, { t: t + i * 2.2, freq: midi(53), dur: 0.05, release: 3.2, gain: 0.045, attack: 0.005, partials: [[1, 1], [2.01, 0.42], [3.02, 0.18], [4.2, 0.07]] });
    });
    return { stop: stopAll(nodes, sched, ctx) };
  }
  // Registraties: welke pijpenrijen een organist opentrekt. Per couplet wisselt dat, en dat hoor je.
  const REGISTRATIES = [
    { naam: 'prestant', stops: [[1, 1], [2, 0.42], [4, 0.12]], lucht: 0.2 },
    { naam: 'prestant met kwint', stops: [[1, 1], [2, 0.5], [3, 0.3], [4, 0.16]], lucht: 0.25 },
    { naam: 'plenum', stops: [[1, 1], [2, 0.55], [3, 0.34], [4, 0.24], [5, 0.12], [8, 0.07]], lucht: 0.32 },
    { naam: 'fluit', stops: [[1, 1], [2, 0.2], [4, 0.05]], lucht: 0.4 },
    { naam: 'tongwerk', stops: [[1, 1], [2, 0.6], [3, 0.45], [5, 0.2]], lucht: 0.22 },
    { naam: 'vox humana', stops: [[1, 1], [2, 0.3], [3, 0.5], [6, 0.12]], lucht: 0.3 },
  ];
  /**
   * Kerkorgel. Een orgel klinkt nooit twee coupletten hetzelfde: de organist trekt andere registers
   * open, de wind zakt licht weg als er veel pijpen spreken, en soms staat de tremulant aan.
   */
  function churchOrgan(ctx, out, {}) {
    const sched = new Sched(ctx); const rev = reverb(ctx, out, 'irLong', 0.7);
    let reg = pick(REGISTRATIES);
    // Windvoorziening: het balgwerk ademt, waardoor de hele registratie licht zweeft.
    const wind = ctx.createOscillator(); wind.frequency.value = 0.17; const windG = gainNode(ctx, 3.5);
    chain(wind, windG); wind.start();
    wander(ctx, sched, windG.gain, 1.5, 6, 9, 5);
    wander(ctx, sched, wind.frequency, 0.11, 0.3, 11, 6);
    // Tremulant: af en toe zet de organist hem aan.
    const trem = ctx.createOscillator(); trem.frequency.value = 5.2; const tremG = gainNode(ctx, 0);
    chain(trem, tremG); trem.start();

    const pijp = (t, n, dur, gain, pan = 0) => {
      const f = midi(n);
      const bus = gainNode(ctx, 1); const p = panNode(ctx, pan); chain(bus, p, rev);
      tremG.connect(bus.gain); // staat op 0 als de tremulant uit is
      for (const [ratio, amp] of reg.stops) {
        const o = ctx.createOscillator(); o.type = ratio % 2 === 0 ? 'sine' : 'triangle';
        o.frequency.value = f * ratio * rnd(0.9992, 1.0008);
        windG.connect(o.detune);
        const g = gainNode(ctx, 0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.05 + reg.lucht * 0.06);
        g.gain.setValueAtTime(gain * amp, t + dur); g.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.22);
        chain(o, g, bus); o.start(t); o.stop(t + dur + 0.3);
      }
      // Luchtaanzet: hoe hoorbaar de wind inzet hangt af van het register.
      burst(ctx, rev, { t, dur: 0.05, color: 'white', type: 'bandpass', freq: f * 6, Q: 1.5, gain: gain * reg.lucht, attack: 0.01, pan });
    };
    let order = Object.keys(CAROLS).sort(() => R() - 0.5), ci = 0;
    let root = 60, beat = 0.8, sterkte = 1;
    speelReeks(sched,
      () => { // nieuw couplet: andere registratie, andere toonhoogte, soms de tremulant erbij
        const c = CAROLS[order[ci % order.length]]; ci++;
        reg = pick(REGISTRATIES); root = 60 + pick([0, -2, -4, -5]); beat = 60 / (c.bpm * rnd(0.68, 0.82));
        sterkte = reg.naam === 'plenum' ? 1 : reg.naam === 'fluit' ? 0.75 : 0.88;
        const aan = R() < 0.3;
        tremG.gain.setTargetAtTime(aan ? 0.16 : 0, ctx.currentTime, 1.5);
        if (aan) trem.frequency.setTargetAtTime(rnd(4.4, 6.2), ctx.currentTime, 1);
        return c.notes.slice();
      },
      (t, [semi, beats]) => {
        const dur = beats * beat * 0.95;
        pijp(t, root + semi, dur, 0.055 * sterkte);
        hymneAkkoord(semi).forEach((s, i) => pijp(t, root + s - 12 - (i === 0 ? 12 : 0), dur, (i === 0 ? 0.045 : 0.03) * sterkte, (i - 1) * 0.4));
        return beats * beat;
      },
      () => rnd(10, 20), 1);
    return { stop: stopAll([wind, trem], sched, ctx) };
  }
  /** Kerstmarkt: mensen buiten, een draaiorgel, belletjes en wind. */
  function kerstmarkt(ctx, out, { busy = 0.7 }) {
    const sched = new Sched(ctx); const nodes = [];
    nodes.push(cafe(ctx, out, { busy })); // dezelfde pratende mensen, maar buiten
    nodes.push(wind(ctx, out, { strength: 0.2, trees: false }));
    // Draaiorgel: wat ontstemde pijpjes die een kerstlied spelen.
    const rev = reverb(ctx, out, 'irRoom', 0.3);
    const ver = filt(ctx, 'lowpass', 2400, 0.7); chain(ver, gainNode(ctx, 0.7), rev);
    const pijpje = (t, n, dur, gain) => {
      for (const [ratio, amp, det] of [[1, 1, -12], [1, 0.8, 14], [2, 0.35, 0], [3, 0.12, 8]]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n) * ratio; o.detune.value = det + rnd(-6, 6);
        const g = gainNode(ctx, 0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * amp, t + 0.03);
        g.gain.setValueAtTime(gain * amp, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
        chain(o, g, panNode(ctx, rnd(-0.2, 0.2)), ver); o.start(t); o.stop(t + dur + 0.05);
      }
    };
    let order = Object.keys(CAROLS).sort(() => R() - 0.5), ci = 0;
    let root = 67, beat = 0.55;
    speelReeks(sched,
      () => { const c = CAROLS[order[ci % order.length]]; ci++; root = 67 + pick([0, -2, 2]); beat = 60 / (c.bpm * 1.05); return c.notes.slice(); },
      (t, [semi, beats]) => { pijpje(t, root + semi, beats * beat * 0.9, 0.035); if (R() < 0.6) pijpje(t, root + semi - 12, beats * beat * 0.9, 0.022); return beats * beat; },
      () => rnd(12, 25), 3);
    // Belletjes bij een kraam en een verre kerkklok.
    sched.every(() => rnd(8, 25), (t) => { const n = Math.round(rnd(3, 8)); for (let i = 0; i < n; i++) tone(ctx, out, { t: t + i * rnd(0.05, 0.12), freq: rnd(3000, 5000), dur: 0.01, release: rnd(0.1, 0.25), gain: rnd(0.015, 0.035), attack: 0.001, pan: rnd(-0.8, 0.8), partials: [[1, 1], [2.7, 0.4]] }); });
    return { stop: stopAll(nodes, sched, ctx) };
  }

  /** Speeldoos: kerstmelodieën met heldere, snel uitdovende tonen; ertussen belletjes en een zachte pad. */
  function musicBox(ctx, out, { bells = true, pad = true }) {
    const sched = new Sched(ctx); const rev = reverb(ctx, out, 'irLong', 0.5);
    const voice = (t, n, dur, gain = 0.12, pan = 0) => {
      // Het tandje dat de kam aantikt. Zonder dat plukje is het een klokkenspel, geen speeldoos.
      burst(ctx, rev, { t, dur: 0.01, color: 'white', type: 'bandpass', freq: rnd(2200, 4500), Q: 2, gain: gain * 0.5, attack: 0.0006, pan });
      tone(ctx, rev, { t, freq: midi(n), dur: 0.02, release: Math.min(2.2, dur * 1.6 + 0.6), gain, attack: 0.002, pan, partials: [[1, 1], [3, 0.35], [5.1, 0.12], [8.9, 0.05]], type: 'sine' });
    };
    const nodes = [];
    // Het uurwerk zelf: de cilinder die ronddraait, zacht en met een lichte onregelmatigheid.
    const werk = loopNoise(ctx, 'pink'); const werkBp = filt(ctx, 'bandpass', 1800, 1.2); const werkG = gainNode(ctx, 0.008);
    chain(werk, werkBp, werkG, out); nodes.push({ stop: () => { try { werk.stop(); } catch {} werk.disconnect(); } });
    wander(ctx, sched, werkG.gain, 0.004, 0.012, 1.2, 0.6);
    if (pad) { const p = pads(ctx, out, { scale: 'major', root: 55, warmth: 0.3, sparkle: false, chordLen: [12, 18], voices: 3 }); nodes.push({ stop: p.stop }); }
    let order = Object.keys(CAROLS).sort(() => R() - 0.5), ci = 0;
    let root = 72, beat = 0.6, pan = 0;
    speelReeks(sched,
      () => { const c = CAROLS[order[ci % order.length]]; ci++; root = 72 + pick([0, 2, -2, 3]); beat = 60 / c.bpm; pan = rnd(-0.3, 0.3); return c.notes.slice(); },
      (t, [semi, beats]) => { voice(t, root + semi, beats * beat, 0.11 + 0.03 * (beats >= 2), pan); if (R() < 0.35) voice(t + 0.01, root + semi - 12, beats * beat, 0.04, -pan); return beats * beat; },
      () => rnd(5, 10), 2);
    if (bells) sched.every(() => rnd(0.22, 0.32), (t) => { if (R() < 0.85) burst(ctx, rev, { t, dur: 0.04, color: 'white', freq: rnd(7000, 10000), Q: 3, type: 'bandpass', gain: rnd(0.015, 0.035), attack: 0.002, pan: rnd(-0.5, 0.5) }); });
    return { stop: () => { sched.stop(); for (const n of nodes) n.stop(); } };
  }
  /** Kerstklokken: klokkenspel met inharmonische deeltonen, lange uitloop en sneeuwwind eronder. */
  function churchBells(ctx, out, { wind: withWind = true }) {
    const sched = new Sched(ctx); const rev = reverb(ctx, out, 'irLong', 0.6);
    const bells = [60, 62, 64, 67, 69].map((m) => midi(m - 12 + pick([0, 0, 12])));
    const strike = (t, f, gain = 0.14) => {
      const p = rnd(-0.6, 0.6);
      // De klap van de klepel op het brons, vlak voor de toon.
      burst(ctx, rev, { t, dur: 0.03, color: 'white', type: 'bandpass', freq: f * rnd(4, 8), Q: 1.1, gain: gain * 0.4, attack: 0.001, pan: p });
      tone(ctx, rev, { t, freq: f, dur: 0.03, release: rnd(3.5, 6), gain, attack: 0.003, pan: p, partials: [[0.5, 0.35], [1, 1], [1.183, 0.5], [1.506, 0.35], [2.0, 0.3], [2.514, 0.18], [2.662, 0.12], [3.011, 0.1], [4.166, 0.05]] });
    };
    let pattern = []; let pi = 0;
    sched.every(() => rnd(0.9, 2.2), (t) => { if (!pattern.length || pi >= pattern.length) { pattern = Array.from({ length: Math.round(rnd(4, 10)) }, () => pick(bells)); pi = 0; if (R() < 0.3) return; } strike(t, pattern[pi++], rnd(0.1, 0.16)); if (R() < 0.15) strike(t + rnd(0.05, 0.2), pick(bells), 0.08); }, 1);
    const nodes = [];
    if (withWind) { const w = wind(ctx, out, { strength: 0.25, trees: false }); nodes.push(w); }
    return { stop: () => { sched.stop(); for (const n of nodes) n.stop(); } };
  }
  /** Winterse piano: spaarzame pianoachtige tonen uit een pentatonische reeks boven een pad. */
  function piano(ctx, out, { scale = 'penta', root = 60, tempo = 1 }) {
    const sched = new Sched(ctx); const sc = SCALES[scale]; const rev = reverb(ctx, out, 'irLong', 0.45);
    const p = pads(ctx, out, { scale: scale === 'mpenta' ? 'minor' : 'major', root: root - 12, warmth: 0.4, sparkle: false, chordLen: [10, 16], voices: 3 });
    const note = (t, n, gain) => tone(ctx, rev, { t, freq: midi(n), dur: 0.05, release: rnd(2, 3.5), gain, attack: 0.004, pan: (n - root) / 24, partials: [[1, 1], [2, 0.5], [3, 0.2], [4, 0.1], [5, 0.05]], lowpass: 3200 });
    let last = 2;
    sched.every(() => rnd(1.2, 4.5) / tempo, (t) => {
      const steps = Math.round(rnd(1, 4)); let tt = t;
      for (let i = 0; i < steps; i++) { last = clamp(last + Math.round(rnd(-2.4, 2.4)), -2, sc.length * 2); note(tt, deg(sc, root, last, 0), rnd(0.05, 0.1)); if (R() < 0.25) note(tt + 0.02, deg(sc, root, last - 4, 0), 0.04); tt += rnd(0.35, 0.9) / tempo; }
    }, 2);
    return { stop: () => { sched.stop(); p.stop(); } };
  }

  // ---- Catalogus ------------------------------------------------------------------------------------
  // level: correctie zodat alles even hard klinkt. space: hoeveel ruimte-akoestiek eromheen (0 = droog).
  const G = (id, title, kind, desc, make, params = {}, level = 1, space = 0.12) => ({ id, title, kind, desc, make, params, level, space });
  const LIST = [
    G('regen-zacht', 'Soft rain', 'regen', 'Drizzle on the window, endlessly', rain, { intensity: 0.3 }, 0.95, 0.1),
    G('regen-stevig', 'Steady rain', 'regen', 'Rain on the roof and the street', rain, { intensity: 0.65 }, 0.61, 0.1),
    G('regen-stortbui', 'Downpour', 'regen', 'Heavy rain with a low rumble', rain, { intensity: 0.95 }, 0.4, 0.1),
    G('onweer-afstand', 'Distant thunder', 'onweer', 'Rain with thunder far away', thunder, { rainIntensity: 0.5 }, 0.64, 0.14),
    G('onweer-dichtbij', 'Storm overhead', 'onweer', 'Heavy weather with sharp cracks', thunder, { rainIntensity: 0.85 }, 0.52, 0.12),
    G('wind-bomen', 'Wind in the trees', 'wind', 'Rustling leaves and gusts', wind, { strength: 0.5, trees: true }, 2.4, 0.08),
    G('wind-storm', 'Gale', 'wind', 'Wind howling around the house', wind, { strength: 0.9, trees: false }, 0.96, 0.06),
    G('wind-bries', 'Light breeze', 'wind', 'Barely more than a breath', wind, { strength: 0.2, trees: true }, 2.14, 0.1),
    G('zee-strand', 'Waves on the shore', 'zee', 'Gentle surf', waves, { size: 0.5 }, 0.75, 0.1),
    G('zee-woelig', 'Rough sea', 'zee', 'Big waves against the rocks', waves, { size: 1 }, 0.62, 0.08),
    G('water-beek', 'Mountain stream', 'water', 'Fast, bubbling water', stream, { speed: 0.7 }, 1.9, 0.12),
    G('water-riviertje', 'Lazy river', 'water', 'Slow and wide', stream, { speed: 0.3 }, 2.1, 0.12),
    G('vuur-haard', 'Crackling fireplace', 'vuur', 'A wood fire that snaps and pops', fire, { size: 0.6 }, 1.9, 0.1),
    G('vuur-kampvuur', 'Big campfire', 'vuur', 'Plenty of flame, plenty of crackle', fire, { size: 1 }, 1.65, 0.08),
    G('vuur-kaarsen', 'Glowing embers', 'vuur', 'Softly glowing, the odd crack', fire, { size: 0.2 }, 3.56, 0.12),
    G('vogels-ochtend', 'Morning birds', 'vogels', 'Songbirds in the garden', birds, { density: 0.7, forest: true }, 3.05, 0.2),
    G('vogels-verspreid', 'Birds in the distance', 'vogels', 'The occasional call', birds, { density: 0.25, forest: true }, 2.6, 0.22),
    G('nacht-krekels', 'Crickets at night', 'nacht', 'Summer evening with crickets and an owl', night, { crickets: 0.7, owl: true }, 2.95, 0.18),
    G('nacht-kikkers', 'Frogs by the pond', 'nacht', 'Crickets and croaking frogs', night, { crickets: 0.4, frogs: true, owl: false }, 3.55, 0.18),
    G('cafe-rustig', 'Quiet café', 'cafe', 'Low murmur, one conversation, cups', cafe, { busy: 0.3 }, 3.79, 0.3),
    G('cafe-druk', 'Busy coffee house', 'cafe', 'A full room: talking, cutlery, the machine', cafe, { busy: 0.9 }, 2.95, 0.26),
    G('cafe-gesprekken', 'Table full of talk', 'cafe', 'People talking all around you', cafe, { busy: 0.6 }, 3.3, 0.28),
    G('cafe-jazz', 'Café with jazz', 'cafe', 'Chatter with soft jazz behind it', cafe, { busy: 0.55, music: true }, 1.32, 0.24),
    G('huis-ventilator', 'Fan', 'huis', 'An even hum', fan, { speed: 0.5 }, 0.5, 0.05),
    G('huis-klok', 'Ticking clock', 'huis', 'A clock in a quiet room', clock, {}, 2.8, 0.22),
    G('huis-typen', 'Typing', 'huis', 'Someone working, head down', typing, { speed: 0.6 }, 7, 0.16),
    G('stad-verkeer', 'Traffic in the distance', 'stad', 'Cars going past, the hum of a city', traffic, { density: 0.5 }, 0.67, 0.14),
    G('stad-nacht', 'City at night', 'stad', 'Little traffic, a lot of space', traffic, { density: 0.2 }, 0.73, 0.16),
    G('muziek-avondlicht', 'Evening light', 'muziek', 'Warm, drifting chords in a major key', pads, { scale: 'major', root: 48, warmth: 0.6 }, 1.31, 0),
    G('muziek-nevelbank', 'Fog bank', 'muziek', 'Slow minor pads with high sparkles', pads, { scale: 'dorian', root: 45, warmth: 0.45 }, 1.58, 0),
    G('muziek-ochtendmist', 'Morning mist', 'muziek', 'Light, open lydian harmony', pads, { scale: 'lydian', root: 50, warmth: 0.7 }, 1.36, 0),
    G('muziek-diepe-ruimte', 'Deep space', 'muziek', 'A drone with slowly breathing filters', pads, { scale: 'minor', root: 38, warmth: 0.3, drone: true, chordLen: [14, 24], voices: 3 }, 0.68, 0),
    G('muziek-schemering', 'Dusk', 'muziek', 'Dark minor chords, no sparkle', pads, { scale: 'minor', root: 43, warmth: 0.35, sparkle: false, chordLen: [11, 18] }, 0.99, 0),
    G('muziek-winterpiano', 'Winter piano', 'muziek', 'Sparse piano notes over a pad', piano, { scale: 'penta', root: 60, tempo: 1 }, 1.18, 0),
    G('muziek-nachtpiano', 'Piano at night', 'muziek', 'Slow minor notes with a long reverb', piano, { scale: 'mpenta', root: 57, tempo: 0.7 }, 1.32, 0),
    G('jazz-piano', 'Piano jazz', 'jazz', 'An unhurried grand with bass and brushes, never in the way', jazzCombo, { bpm: 84, changes: 'ballade', feel: 'ballad', lead: 'grand', comp: 'grand', leadDensity: 0.55, drumLevel: 0.7 }, 0.73, 0.06),
    G('jazz-pianotrio', 'Piano trio', 'jazz', 'Swinging trio: grand piano, walking bass and ride', jazzCombo, { bpm: 108, changes: 'turnaround', feel: 'swing', lead: 'grand', comp: 'grand' }, 0.58, 0.05),
    G('jazz-coffeetable', 'Coffee table jazz', 'jazz', 'Vibraphone and soft chords, never insistent', jazzCombo, { bpm: 88, changes: 'ballade', feel: 'ballad', lead: 'vibes', comp: 'vibes', drumLevel: 0.5, leadDensity: 0.5 }, 0.5, 0.06),
    G('jazz-sax', 'Saxophone trio', 'jazz', 'Breathy sax over piano, bass and drums', jazzCombo, { bpm: 112, changes: 'iiVI', feel: 'swing', lead: 'sax', comp: 'piano' }, 0.62, 0.05),
    G('jazz-blues', 'Late night blues', 'jazz', 'Twelve-bar blues with sax and organ-like piano', jazzCombo, { bpm: 88, changes: 'blues', feel: 'swing', lead: 'sax', comp: 'piano', tape: true }, 0.88, 0.06),
    G('jazz-bossa', 'Bossa nova', 'jazz', 'Nylon guitar, vibraphone and a soft click', jazzCombo, { bpm: 128, changes: 'bossa', feel: 'bossa', lead: 'vibes', comp: 'nylon' }, 0.8, 0.06),
    G('jazz-bossa-mineur', 'Bossa in a minor key', 'jazz', 'Warm guitar, minor chords, late in the evening', jazzCombo, { bpm: 120, changes: 'bossaMin', feel: 'bossa', lead: 'nylon', comp: 'nylon', drumLevel: 0.7 }, 0.91, 0.06),
    G('jazz-modaal', 'Modal jazz', 'jazz', 'Two chords, all the room in the world, a sax that speaks now and then', jazzCombo, { bpm: 84, changes: 'modaal', feel: 'swing', lead: 'sax', comp: 'piano', leadDensity: 0.4 }, 0.87, 0.06),
    G('jazz-lofi', 'Lo-fi jazz café', 'jazz', 'Electric piano, bass and brushed drums', lofiJazz, { bpm: 78, drums: true }, 0.9, 0.05),
    G('jazz-nacht', 'Jazz at night', 'jazz', 'Slow, minor, just piano and bass', lofiJazz, { bpm: 62, drums: false, minor: true }, 1.2, 0.06),
    G('jazz-zondag', 'Sunday morning jazz', 'jazz', 'Brisk and light, with vinyl crackle', lofiJazz, { bpm: 88, drums: true, minor: false }, 0.9, 0.05),
    G('film-strijkers', 'Slow strings', 'film', 'Big string chords that hang in the air for minutes', filmscore, { stijl: 'strijkers', modus: 'eolisch', grondtoon: 45, tempo: 0.9 }, 1.03, 0),
    G('film-elegie', 'Elegy', 'film', 'Darker, phrygian, with deep brass swells', filmscore, { stijl: 'strijkers', modus: 'frygisch', grondtoon: 41, tempo: 0.75 }, 1.17, 0),
    G('film-verstilling', 'Stillness', 'film', 'Little more than a drone and a single layer of strings', filmscore, { stijl: 'strijkers', modus: 'dorisch', grondtoon: 43, tempo: 0.6, ruis: false }, 1.13, 0),
    G('film-cirkels', 'Circles', 'film', 'A piano figure that keeps repeating and slowly shifts', filmscore, { stijl: 'postminimal', modus: 'eolisch', grondtoon: 45, tempo: 1 }, 1.2, 0),
    G('film-nachtcirkels', 'Night circles', 'film', 'The same idea, slower and in a minor key', filmscore, { stijl: 'postminimal', modus: 'frygisch', grondtoon: 43, tempo: 0.72 }, 1.3, 0),
    G('film-nachtvlucht', 'Night flight', 'film', 'Wide analogue pads, an arpeggio through the echo, a singing lead', filmscore, { stijl: 'analoog', modus: 'eolisch', grondtoon: 45, tempo: 0.95 }, 1.2, 0),
    G('film-horizon', 'Horizon', 'film', 'Lighter and wider, with a slow filter sweep', filmscore, { stijl: 'analoog', modus: 'lydisch', grondtoon: 47, tempo: 0.85 }, 0.96, 0),
    G('film-vilt', 'Felt piano', 'film', 'A piano with felt between the hammers, close enough to hear the mechanism', kamermuziek, { modus: 'eolisch', grondtoon: 48, tempo: 1, stratus: 0.35, kwartet: false }, 3.09, 0),
    G('film-cascade', 'Cascade', 'film', 'Felt piano with a quartet; high notes falling out of the chord', kamermuziek, { modus: 'eolisch', grondtoon: 48, tempo: 1, stratus: 0.7 }, 2.7, 0),
    G('film-eiland', 'Island', 'film', 'Lighter and wider, piano and strings giving each other room', kamermuziek, { modus: 'lydisch', grondtoon: 50, tempo: 0.8, stratus: 0.45 }, 2.5, 0),
    G('film-avondlicht', 'Evening light', 'film', 'Slow and darker, with long pauses between the phrases', kamermuziek, { modus: 'dorisch', grondtoon: 45, tempo: 0.65, stratus: 0.3 }, 2.65, 0),
    G('film-cellodoek', 'Cello cloth', 'film', 'A solo cello swelling slowly, with bow noise and sliding notes', celloDoek, { modus: 'frygisch', grondtoon: 33 }, 1.6, 0),
    G('film-cellodiepte', 'Depth', 'film', 'Two cellos close together, floating over a low drone', celloDoek, { modus: 'eolisch', grondtoon: 31, stemmen: 2, stem: true }, 0.99, 0),
    G('film-fabriek', 'Abandoned factory', 'film', 'Cello in a large concrete space, with distant machines and metal', celloDoek, { modus: 'frygisch', grondtoon: 30, industrieel: true }, 1.02, 0),
    G('film-drift', 'Drift', 'film', 'An unshakeable arpeggio that changes colour over minutes, with a throbbing sub', donkereScore, { stijl: 'sequencer', modus: 'eolisch', grondtoon: 40, bpm: 100, vuil: 0.45 }, 0.45, 0),
    G('film-puls', 'Pulse', 'film', 'Faster and colder, with a tight resonant filter', donkereScore, { stijl: 'sequencer', modus: 'frygisch', grondtoon: 38, bpm: 126, vuil: 0.6 }, 0.4, 0),
    G('film-onderstroom', 'Undertow', 'film', 'Slow and wide, with the sub as a heartbeat underneath', donkereScore, { stijl: 'sequencer', modus: 'dorisch', grondtoon: 36, bpm: 74, vuil: 0.35 }, 0.47, 0),
    G('film-koudepiano', 'Cold piano', 'film', 'A hard-struck piano figure, doubled slightly out of tune, over low strings', donkereScore, { stijl: 'koudepiano', modus: 'eolisch', grondtoon: 40, bpm: 88, vuil: 0.4 }, 0.66, 0),
    G('film-glasscherven', 'Broken glass', 'film', 'The same figure, higher and more fragile, with more tape hiss', donkereScore, { stijl: 'koudepiano', modus: 'frygisch', grondtoon: 43, bpm: 72, vuil: 0.6, sub: false }, 0.61, 0),
    G('film-machinehal', 'Machine hall', 'film', 'No melody: metal, compressed air and a motor that never quite keeps time', donkereScore, { stijl: 'machine', modus: 'frygisch', grondtoon: 36, bpm: 92, vuil: 0.7 }, 0.47, 0),
    G('greg-dorisch', 'Gregorian chant', 'gregoriaans', 'Men\'s choir in unison, dorian mode, a large church', gregoriaans, { modus: 'dorisch', grondtoon: 45, zangers: 6 }, 6.62, 0),
    G('greg-completen', 'Compline', 'gregoriaans', 'The last hour of the day: dark, phrygian and slow', gregoriaans, { modus: 'frygisch', grondtoon: 43, tempo: 0.8, zangers: 5, bourdon: true }, 1.05, 0),
    G('greg-vespers', 'Vespers', 'gregoriaans', 'Evening chant in mixolydian, over a pedal note', gregoriaans, { modus: 'mixolydisch', grondtoon: 46, tempo: 0.95, zangers: 6, bourdon: true }, 1.6, 0),
    G('greg-organum', 'Organum', 'gregoriaans', 'Early polyphony: a second voice in fifths', gregoriaans, { modus: 'dorisch', grondtoon: 45, tempo: 0.85, zangers: 4, organum: true, bourdon: true }, 1.29, 0),
    G('greg-hildegard', 'Hildegard von Bingen', 'gregoriaans', 'High women’s voices, wide leaps and long melismas over a drone', gregoriaans, { modus: 'dorisch', grondtoon: 50, tempo: 0.9, zangers: 4, hoog: true, sprongen: 0.7, bourdon: true }, 1.4, 0),
    G('greg-lydisch', 'Lauds', 'gregoriaans', 'Morning chant in the bright lydian mode', gregoriaans, { modus: 'lydisch', grondtoon: 48, tempo: 1.05, zangers: 5 }, 6, 0),
    G('greg-kapel', 'Silent chapel', 'gregoriaans', 'A drone, a distant bell and now and then a sung line', kapel, { modus: 'frygisch', grondtoon: 45 }, 1.1, 0),
    G('kerst-koor', 'Christmas choir', 'kerst', 'Four-part choir in a church, carols you know', kerstkoor, { orgel: true }, 1.05, 0),
    G('kerst-carillon', 'Carillon in the snow', 'kerst', 'Bells playing carols, with a soft wind', carillon, { snow: true }, 1.58, 0),
    G('kerst-slee', 'Sleigh ride', 'kerst', 'Sleigh bells, hooves in the snow and the runners', sleighRide, { speed: 1 }, 2.6, 0.12),
    G('kerst-sneeuw', 'Walking through snow', 'kerst', 'Snow crunching underfoot, wind and a bell far off', snowWalk, { pace: 1, bells: true }, 2.9, 0.14),
    G('kerst-orgel', 'Church organ', 'kerst', 'Carols on full registration, a long tail', churchOrgan, {}, 1.65, 0),
    G('kerst-markt', 'Christmas market', 'kerst', 'People outdoors, a barrel organ and little bells', kerstmarkt, { busy: 0.7 }, 1.86, 0.1),
    G('kerst-speeldoos', 'Christmas music box', 'kerst', 'A music box playing carols, with bells', musicBox, { bells: true, pad: true }, 0.87, 0),
    G('kerst-klokken', 'Christmas bells in the snow', 'kerst', 'Bells with a winter wind', churchBells, { wind: true }, 0.96, 0),
    G('kerst-speeldoos-stil', 'Quiet music box', 'kerst', 'Just the music box, without the bells', musicBox, { bells: false, pad: false }, 2.2, 0),
  ];

  /**
   * Lichte modus. Web Audio rekent alles op één enkele thread, en de ruimtegalm per laag is daarin
   * met afstand de duurste post. Op een drukke machine — of met een mix van vier, vijf geluiden —
   * kan dat over de grens gaan, en dan hoor je het geluid haperen. Hiermee laat je die galm weg:
   * het klinkt iets droger, maar je houdt ruimte over. Geldt voor geluiden die je daarna start.
   */
  let lichteModus = false;

  window.NebulaSynth = {
    list: LIST,
    setLicht(aan) { lichteModus = !!aan; },
    create(id, ctx, out) {
      const g = LIST.find((x) => x.id === id);
      if (!g) throw new Error('Onbekende generator ' + id);
      // Balans, een zachte compressor (voorkomt dat losse tikken uitspringen) en wat ruimte-akoestiek:
      // buitengeluiden zijn nooit kurkdroog, en dat scheelt veel in hoe echt het klinkt.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 2.4; comp.attack.value = 0.008; comp.release.value = 0.28;
      comp.connect(out);
      const galm = g.space > 0 && !lichteModus;
      const dest = galm ? reverb(ctx, comp, 'irRoom', g.space) : comp;
      // Zonder galm valt niet alleen de staart weg maar ook de demping van het drooggeluid, en dan
      // springt het geluid ruim 3 dB omhoog zodra je de lichte modus aanzet. Dat compenseren we,
      // zodat de schakelaar alleen de ruimte verandert en niet het volume.
      const droog = (g.space > 0 && lichteModus) ? 1 - g.space : 1;
      const lvl = gainNode(ctx, (g.level ?? 1) * droog); lvl.connect(dest);
      const gen = g.make(ctx, lvl, { ...g.params });
      return { stop: () => { gen.stop(); setTimeout(() => { for (const n of [lvl, comp]) { try { n.disconnect(); } catch {} } }, 300); } };
    },
  };
})();
