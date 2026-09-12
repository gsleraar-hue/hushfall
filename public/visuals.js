// Achtergrond: een schemerlucht in de kleuren van de soort, een horizon met zachte heuvels,
// langzame Ken Burns-beweging en deeltjes: elke soort heeft zijn eigen (regen, sneeuw, stof, vuurvliegjes,
// bellen, bladeren, vonken, sterren, windvlagen, deining, veren, stadslichten, stoom, rook, kaarslicht, filmkorrel).
(function () {
  // Deze deeltjes tekenen een kleurverloop per stuk per beeld en zijn daarmee het duurst.
  const GLOED = new Set(['kaarslicht', 'fireflies', 'lichten', 'stoom', 'rook']);
  class Visuals {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.colors = [[16, 13, 20], [42, 30, 52], [90, 60, 80]]; this.target = this.colors.map((c) => c.slice());
      this.accent = [140, 110, 150]; this.accentTarget = this.accent.slice();
      this.particles = 'dust'; this.density = 1; this.boost = 1; this.enabled = true;
      this.items = []; this.t0 = performance.now(); this.last = this.t0; this.flash = 0;
      this.hills = [0.72, 0.8, 0.88].map((base, i) => ({ base, amp: 0.05 - i * 0.012, seed: Math.random() * 100, speed: 0.004 + i * 0.003 }));
      this.resize(); window.addEventListener('resize', () => this.resize());
      // requestAnimationFrame stopt zodra het venster verborgen of bedekt is. Een tweede, langzame
      // klok houdt het beeld dan levend en start de vloeiende lus weer op zodra dat kan.
      this.raf = 0; this.lastPaint = 0;
      this.tick = (t) => { this.raf = requestAnimationFrame(this.tick); this.frame(t ?? performance.now()); };
      this.keepAlive = setInterval(() => {
        const stil = performance.now() - this.lastPaint;
        if (stil > (document.hidden ? 1000 : 400)) this.frame(performance.now()); // geminimaliseerd: rustiger
      }, 250);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.start(); });
      window.addEventListener('focus', () => this.start());
      this.start();
    }
    start() { if (this.raf) cancelAnimationFrame(this.raf); this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    destroy() { cancelAnimationFrame(this.raf); clearInterval(this.keepAlive); }
    resize() {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.items = [];
    }
    setScene({ colors, accent, particles }) {
      if (colors) this.target = colors.map(hex2rgb);
      if (accent) this.accentTarget = hex2rgb(accent);
      else if (colors) this.accentTarget = hex2rgb(colors[2]);
      if (particles !== undefined && particles !== this.particles) { this.particles = particles; this.items = []; }
    }
    setDensity(d) { this.density = d; this.items = []; }
    /** Extra deeltjes in de volledig-schermweergave, waar de lucht het enige is wat je ziet. */
    setBoost(b) { if (b === this.boost) return; this.boost = b; this.items = []; }
    setEnabled(e) { this.enabled = e; this.items = []; }

    frame(now) {
      this.lastPaint = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      const t = (now - this.t0) / 1000;
      const { ctx, w, h } = this;
      for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) this.colors[i][c] += (this.target[i][c] - this.colors[i][c]) * Math.min(1, dt * 1.2);
      for (let c = 0; c < 3; c++) this.accent[c] += (this.accentTarget[c] - this.accent[c]) * Math.min(1, dt * 1.2);
      const [c0, c1, c2] = this.colors; const ac = this.accent;
      const move = this.enabled ? 1 : 0;
      // lucht
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, rgb(mix(c0, [16, 13, 20], 0.4)));
      sky.addColorStop(0.55, rgb(c1));
      sky.addColorStop(0.78, rgb(mix(c2, c1, 0.3)));
      sky.addColorStop(1, rgb(c0));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      // zon/maan-gloed die langzaam beweegt
      const gx = w * (0.5 + 0.35 * Math.sin(t * 0.02 * move)), gy = h * 0.62;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.45);
      glow.addColorStop(0, rgba(c2, 0.55)); glow.addColorStop(1, rgba(c2, 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      // Tweede gloed in de accentkleur, op een andere baan en met een eigen adem. Twee kleuren die
      // langzaam langs elkaar schuiven maken het beeld levend; één vlak verloop blijft altijd hetzelfde.
      const ax = w * (0.5 + 0.42 * Math.sin(t * 0.013 * move + 2.1)), ay = h * (0.34 + 0.12 * Math.sin(t * 0.009 * move));
      const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(w, h) * 0.52);
      const puls = 0.16 + 0.07 * Math.sin(t * 0.05 * move);
      ag.addColorStop(0, rgba(ac, puls)); ag.addColorStop(0.55, rgba(ac, puls * 0.28)); ag.addColorStop(1, rgba(ac, 0));
      ctx.fillStyle = ag; ctx.fillRect(0, 0, w, h);
      // heuvels
      this.hills.forEach((hl, i) => {
        const y0 = h * hl.base, amp = h * hl.amp, ph = t * hl.speed * move + hl.seed;
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const u = x / w;
          const y = y0 - amp * (Math.sin(u * 3.1 + ph) * 0.6 + Math.sin(u * 7.3 + ph * 1.7) * 0.3 + Math.sin(u * 13.7 - ph) * 0.1);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const shade = mix(c0, [10, 8, 13], 0.35 + i * 0.3);
        ctx.fillStyle = rgb(shade); ctx.fill();
        if (i === 0) { ctx.strokeStyle = rgba(c2, 0.25); ctx.lineWidth = 1; ctx.stroke(); }
      });
      if (this.enabled && this.particles && this.particles !== 'none') this.drawParticles(dt, t);
      if (this.flash > 0) { ctx.fillStyle = `rgba(230,225,255,${this.flash * 0.45})`; ctx.fillRect(0, 0, w, h); this.flash -= dt * 3; }
    }

    drawParticles(dt, t) {
      const { ctx, w, h } = this; const type = this.particles; const ac = this.accent;
      const counts = {
        rain: 260, storm: 380, snow: 220, dust: 210, fireflies: 62, bubbles: 95, leaves: 72, embers: 130, sparkles: 120, stars: 240,
        wisps: 42, golven: 18, veren: 34, lichten: 52, stoom: 40, rook: 40, kaarslicht: 72, korrel: 330,
      };
      // Schaal met het vensteroppervlak. De bovengrens stond op 1.4, en daardoor werd het beeld juist
      // leger naarmate het venster groter werd: fullscreen op 2560x1440 vraagt 3.6x zoveel deeltjes
      // om even vol te lijken. In de volledig-schermweergave komt daar nog een extra factor bij,
      // want daar is de lucht het enige wat je ziet.
      const vlak = Math.min(2.8, Math.max(0.55, w * h / (1280 * 800)));
      // Plafond, zodat een groot scherm in volledig scherm met de schuif op 200% het tekenen niet
      // laat instorten. De dichte soorten (regen, storm, korrel) lopen hier tegenaan; de rustige
      // soorten blijven er ruim onder en schalen dus gewoon door met het oppervlak. Deeltjes met een
      // gloed kosten per stuk het meest (een kleurverloop per deeltje per beeld), dus die eerder.
      const plafond = GLOED.has(type) ? 400 : 900;
      const n = Math.min(plafond, Math.round((counts[type] || 80) * this.density * this.boost * vlak));
      while (this.items.length < n) this.items.push(this.spawn(type, true));
      if (this.items.length > n) this.items.length = n;
      if (type === 'storm' && Math.random() < dt * 0.06) this.flash = 1;
      ctx.save();
      for (let i = 0; i < this.items.length; i++) {
        const p = this.items[i];
        p.life += dt;
        switch (type) {
          case 'rain': case 'storm': {
            const sp = type === 'storm' ? 1.35 : 1;
            p.y += p.vy * dt * sp; p.x += p.vx * dt * sp;
            ctx.strokeStyle = `rgba(220,225,240,${p.a})`; ctx.lineWidth = p.s;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
            if (p.y > h + 20) this.items[i] = this.spawn(type); break;
          }
          case 'snow': {
            p.y += p.vy * dt; p.x += Math.sin(p.life * p.f + p.ph) * 18 * dt + p.vx * dt;
            ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
            if (p.y > h + 10) this.items[i] = this.spawn(type); break;
          }
          case 'dust': {
            // Stof dreef zo langzaam dat het stilstond; nu wervelt het zichtbaar mee in de lucht.
            p.vx += Math.sin(p.life * 0.6 + p.ph) * 9 * dt; p.vy += Math.cos(p.life * 0.45 + p.ph) * 7 * dt;
            p.vx *= 0.995; p.vy *= 0.995;
            p.x += p.vx * dt; p.y += p.vy * dt;
            const a = p.a * (0.35 + 0.65 * Math.sin(p.life * p.f + p.ph));
            ctx.fillStyle = `rgba(247,238,222,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
            if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) this.items[i] = this.spawn(type); break;
          }
          case 'fireflies': {
            p.vx += (Math.random() - 0.5) * 40 * dt; p.vy += (Math.random() - 0.5) * 40 * dt;
            p.vx *= 0.98; p.vy *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt;
            const a = Math.max(0, Math.sin(p.life * p.f + p.ph)) ** 3 * p.a;
            if (a > 0.02) {
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 6);
              g.addColorStop(0, `rgba(233,199,155,${a})`); g.addColorStop(1, 'rgba(233,199,155,0)');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 6, 0, 7); ctx.fill();
            }
            if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) this.items[i] = this.spawn(type); break;
          }
          case 'bubbles': {
            p.y -= p.vy * dt; p.x += Math.sin(p.life * p.f + p.ph) * 12 * dt;
            ctx.strokeStyle = `rgba(210,235,255,${p.a})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.stroke();
            ctx.fillStyle = `rgba(255,255,255,${p.a * 0.6})`; ctx.beginPath(); ctx.arc(p.x - p.s * 0.35, p.y - p.s * 0.35, p.s * 0.2, 0, 7); ctx.fill();
            if (p.y < -20) this.items[i] = this.spawn(type); break;
          }
          case 'leaves': {
            p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.life * p.f + p.ph) * 25) * dt; p.rot += p.vr * dt;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `rgba(${p.col},${p.a})`;
            ctx.beginPath(); ctx.ellipse(0, 0, p.s * 2.2, p.s, 0, 0, 7); ctx.fill(); ctx.restore();
            if (p.y > h + 20) this.items[i] = this.spawn(type); break;
          }
          case 'embers': {
            p.y -= p.vy * dt; p.x += (p.vx + Math.sin(p.life * p.f + p.ph) * 20) * dt;
            const a = p.a * Math.max(0, 1 - p.life / p.ttl);
            ctx.fillStyle = `rgba(255,${140 + Math.round(80 * Math.random())},60,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
            if (p.life > p.ttl || p.y < -10) this.items[i] = this.spawn(type); break;
          }
          case 'sparkles': {
            const k = Math.max(0, Math.sin(p.life * p.f)); p.y -= p.vy * dt * 0.3;
            if (k > 0.01) {
              ctx.strokeStyle = `rgba(244,235,221,${p.a * k})`; ctx.lineWidth = 1;
              const s = p.s * 3 * k;
              ctx.beginPath(); ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s); ctx.stroke();
            }
            if (p.life > p.ttl) this.items[i] = this.spawn(type); break;
          }
          case 'stars': {
            // Sterren stonden helemaal stil; nu drijft het veld heel traag en fonkelt het duidelijker.
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.x < -5) p.x = w + 5; else if (p.x > w + 5) p.x = -5;
            const a = p.a * (0.35 + 0.65 * Math.sin(p.life * p.f + p.ph) ** 2);
            ctx.fillStyle = `rgba(244,235,221,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
            if (p.s > 1.3 && a > p.a * 0.85) {   // de heldere sterren krijgen een kruisje licht
              ctx.strokeStyle = `rgba(244,235,221,${a * 0.35})`; ctx.lineWidth = 0.6;
              ctx.beginPath(); ctx.moveTo(p.x - p.s * 3, p.y); ctx.lineTo(p.x + p.s * 3, p.y);
              ctx.moveTo(p.x, p.y - p.s * 3); ctx.lineTo(p.x, p.y + p.s * 3); ctx.stroke();
            }
            break;
          }
          // Wind: lange, gebogen vlagen die door het beeld trekken en onderweg oplossen.
          case 'wisps': {
            p.x += p.vx * dt; p.y += p.vy * dt + Math.sin(p.life * p.f) * 6 * dt;
            const a = p.a * Math.max(0, Math.sin(Math.PI * Math.min(1, p.life / p.ttl)));
            if (a > 0.01) {
              ctx.strokeStyle = rgba(ac, a); ctx.lineWidth = p.s * 0.8; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(p.x, p.y);
              ctx.quadraticCurveTo(p.x + p.len * 0.5, p.y - p.bow, p.x + p.len, p.y);
              ctx.stroke();
            }
            if (p.life > p.ttl || p.x > w + p.len) this.items[i] = this.spawn(type); break;
          }
          // Zee: brede deiningslijnen die traag over elkaar heen schuiven.
          case 'golven': {
            p.ph += p.f * dt;
            ctx.strokeStyle = rgba(ac, p.a); ctx.lineWidth = p.s;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 14) {
              const y = p.y + Math.sin(x / p.golf + p.ph) * p.amp + Math.sin(x / (p.golf * 0.43) - p.ph * 1.3) * p.amp * 0.4;
              x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke(); break;
          }
          // Vogels: veertjes die zwevend en tollend naar beneden komen.
          case 'veren': {
            p.rot += p.vr * dt;
            p.x += (p.vx + Math.sin(p.life * p.f + p.ph) * 40) * dt;
            p.y += (p.vy + Math.cos(p.life * p.f * 0.7) * 8) * dt;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.sin(p.life * p.f) * 0.5);
            ctx.fillStyle = `rgba(240,240,225,${p.a})`;
            ctx.beginPath(); ctx.ellipse(0, 0, p.s * 3.2, p.s * 0.7, 0, 0, 7); ctx.fill();
            ctx.strokeStyle = `rgba(160,170,140,${p.a * 0.7})`; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(-p.s * 3.2, 0); ctx.lineTo(p.s * 3.2, 0); ctx.stroke();
            ctx.restore();
            if (p.y > h + 20) this.items[i] = this.spawn(type); break;
          }
          // Stad: onscherpe lichten die langsschuiven, zoals ruiten en koplampen door een lens.
          case 'lichten': {
            p.x += p.vx * dt; p.y += p.vy * dt;
            const a = p.a * (0.7 + 0.3 * Math.sin(p.life * p.f + p.ph));
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
            g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(0.4, `rgba(${p.col},${a * 0.35})`); g.addColorStop(1, `rgba(${p.col},0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
            if (p.x < -p.s || p.x > w + p.s) this.items[i] = this.spawn(type); break;
          }
          // Café: damp van kopjes die opstijgt, uitdijt en oplost.
          case 'stoom': case 'rook': {
            const traag = type === 'rook' ? 0.6 : 1;
            p.y -= p.vy * dt * traag; p.x += (p.vx + Math.sin(p.life * p.f + p.ph) * 14) * dt;
            const k = Math.min(1, p.life / p.ttl);
            const a = p.a * Math.sin(Math.PI * k) * 0.9;
            const r = p.s * (1 + k * 2.6);
            if (a > 0.005) {
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
              g.addColorStop(0, `rgba(235,225,210,${a})`); g.addColorStop(1, 'rgba(235,225,210,0)');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
            }
            if (p.life > p.ttl || p.y < -r) this.items[i] = this.spawn(type); break;
          }
          // Kerkmuziek: warme vlokjes die boven kaarsen opstijgen en flakkeren.
          case 'kaarslicht': {
            p.y -= p.vy * dt; p.x += (p.vx + Math.sin(p.life * p.f + p.ph) * 16) * dt;
            const k = Math.min(1, p.life / p.ttl);
            const a = p.a * Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(p.life * 9 + p.ph));
            if (a > 0.01) {
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 5);
              g.addColorStop(0, `rgba(255,206,130,${a})`); g.addColorStop(1, 'rgba(255,206,130,0)');
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 5, 0, 7); ctx.fill();
            }
            if (p.life > p.ttl || p.y < -10) this.items[i] = this.spawn(type); break;
          }
          // Film: korrel die per beeld verspringt, met af en toe een kras over het beeld.
          case 'korrel': {
            p.x += p.vx * dt; p.y += p.vy * dt;
            ctx.fillStyle = `rgba(240,235,225,${p.a * Math.random()})`;
            ctx.fillRect(p.x, p.y, p.s, p.s);
            if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) this.items[i] = this.spawn(type); break;
          }
        }
      }
      if (type === 'korrel' && Math.random() < dt * 1.6) {   // losse kras, zoals op oud filmmateriaal
        const x = Math.random() * w;
        ctx.strokeStyle = 'rgba(240,235,225,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, Math.random() * h * 0.4); ctx.lineTo(x + (Math.random() - 0.5) * 6, h * (0.5 + Math.random() * 0.5)); ctx.stroke();
      }
      ctx.restore();
    }
    spawn(type, anywhere) {
      const { w, h } = this; const r = Math.random;
      const base = { x: r() * w, y: r() * h, life: r() * 10, f: 0.5 + r() * 2, ph: r() * 6.3, a: 0.2 + r() * 0.6, s: 1 + r() * 2, vx: 0, vy: 0, rot: 0, vr: 0, ttl: 3 + r() * 4, col: '180,140,60' };
      switch (type) {
        case 'rain': case 'storm': return { ...base, y: anywhere ? r() * h : -20 - r() * 100, vy: 900 + r() * 500, vx: -60 - r() * 80, s: 0.6 + r() * 0.9, a: 0.15 + r() * 0.35 };
        case 'snow': return { ...base, y: anywhere ? r() * h : -10, vy: 25 + r() * 45, vx: -8 + r() * 16, s: 0.8 + r() * 2.2, a: 0.3 + r() * 0.6 };
        case 'dust': return { ...base, vx: -16 + r() * 32, vy: -14 + r() * 28, s: 0.8 + r() * 2.2, a: 0.3 + r() * 0.55 };
        case 'fireflies': return { ...base, y: r() * h * 0.85, vx: -10 + r() * 20, vy: -10 + r() * 20, s: 1.2 + r() * 1.2, f: 0.3 + r() * 1.2, a: 0.5 + r() * 0.5 };
        case 'bubbles': return { ...base, y: anywhere ? r() * h : h + 20, vy: 18 + r() * 40, s: 2 + r() * 6, a: 0.15 + r() * 0.35 };
        case 'leaves': return { ...base, y: anywhere ? r() * h : -20, vy: 30 + r() * 50, vx: 10 + r() * 30, s: 2.5 + r() * 3, vr: -2 + r() * 4, a: 0.35 + r() * 0.45, col: ['196,140,50', '150,120,40', '120,150,60', '200,110,40'][Math.floor(r() * 4)] };
        case 'embers': return { ...base, y: anywhere ? r() * h : h * (0.6 + r() * 0.4), x: w * (0.2 + r() * 0.6), vy: 40 + r() * 70, vx: -15 + r() * 30, s: 0.8 + r() * 1.6, life: 0, ttl: 2 + r() * 4, a: 0.5 + r() * 0.5 };
        case 'sparkles': return { ...base, life: 0, ttl: 3 + r() * 5, f: 0.6 + r() * 1.2, s: 0.8 + r() * 1.4, vy: 5 + r() * 10 };
        case 'stars': return { ...base, y: r() * h * 0.7, s: 0.4 + r() * 1.4, a: 0.25 + r() * 0.6, f: 0.5 + r() * 2.2, vx: -6 + r() * 12, vy: -2 + r() * 4 };
        case 'wisps': return { ...base, x: anywhere ? r() * w : -200 - r() * 300, y: r() * h * 0.9, vx: 70 + r() * 150, vy: -12 + r() * 24, len: 120 + r() * 260, bow: -40 + r() * 80, s: 0.8 + r() * 1.8, a: 0.1 + r() * 0.22, life: 0, ttl: 6 + r() * 8, f: 0.3 + r() * 0.8 };
        case 'golven': return { ...base, y: h * (0.45 + r() * 0.5), amp: 4 + r() * 16, golf: 90 + r() * 260, ph: r() * 6.3, f: 0.12 + r() * 0.35, s: 0.7 + r() * 1.4, a: 0.06 + r() * 0.14 };
        case 'veren': return { ...base, y: anywhere ? r() * h : -20 - r() * 60, vy: 18 + r() * 26, vx: -14 + r() * 28, s: 1.6 + r() * 2.4, vr: -0.8 + r() * 1.6, f: 0.4 + r() * 0.8, a: 0.25 + r() * 0.4 };
        case 'lichten': { const uit = r() < 0.5; const kleur = ['255,150,200', '170,140,255', '255,200,140', '150,220,255'][Math.floor(r() * 4)];
          return { ...base, x: anywhere ? r() * w : (uit ? -60 : w + 60), y: h * (0.25 + r() * 0.7), vx: (uit ? 1 : -1) * (10 + r() * 40), vy: -4 + r() * 8, s: 14 + r() * 46, a: 0.12 + r() * 0.3, f: 0.2 + r() * 0.6, col: kleur }; }
        case 'stoom': return { ...base, x: w * (0.1 + r() * 0.8), y: anywhere ? r() * h : h * (0.7 + r() * 0.25), vy: 16 + r() * 26, vx: -6 + r() * 12, s: 8 + r() * 14, a: 0.09 + r() * 0.12, life: anywhere ? r() * 6 : 0, ttl: 7 + r() * 6, f: 0.3 + r() * 0.7 };
        case 'rook': return { ...base, x: w * (0.05 + r() * 0.9), y: anywhere ? r() * h : h * (0.6 + r() * 0.35), vy: 14 + r() * 22, vx: -12 + r() * 24, s: 16 + r() * 28, a: 0.08 + r() * 0.11, life: anywhere ? r() * 7 : 0, ttl: 9 + r() * 8, f: 0.2 + r() * 0.5 };
        case 'kaarslicht': return { ...base, x: r() * w, y: anywhere ? r() * h : h * (0.55 + r() * 0.45), vy: 12 + r() * 22, vx: -5 + r() * 10, s: 0.7 + r() * 1.3, a: 0.3 + r() * 0.5, life: anywhere ? r() * 5 : 0, ttl: 6 + r() * 7, f: 0.4 + r() * 1.2 };
        case 'korrel': return { ...base, vx: -14 + r() * 28, vy: -14 + r() * 28, s: 1 + Math.round(r()), a: 0.1 + r() * 0.3 };
        default: return base;
      }
    }
  }
  function hex2rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(a) { return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`; }
  function rgba(a, o) { return `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${o})`; }
  window.ThrumVisuals = Visuals;
})();
