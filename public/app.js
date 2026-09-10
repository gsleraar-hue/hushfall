// Nebula: UI, navigatie, bibliotheek, timer en opslag van instellingen.
(function () {
  const D = window.NEBULA_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const desktop = window.nebulaDesktop && window.nebulaDesktop.isDesktop;
  const engine = new window.NebulaEngine();
  const visuals = new window.NebulaVisuals($('#bg'));
  let library = { sounds: [], kinds: {}, moods: {} };
  let byId = new Map();
  let currentMood = null; // sfeer van het laatst gestarte hoofdgeluid
  let activeMix = null;

  // ---- Instellingen (localStorage) -------------------------------------------
  const defaults = { volumes: { master: 0.8, main: 1, fx: 1, noise: 0.5, radio: 0.8 }, anim: true, density: 1, resume: true, page: 'home', noise: { color: 'roze', tone: 6000, hp: 40, gain: 0.5 }, timerFade: 30, layers: [], mixerKind: 'alle' };
  let settings = defaults;
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('nebula') || localStorage.getItem('sfeer') || '{}') }; settings.volumes = { ...defaults.volumes, ...settings.volumes }; settings.noise = { ...defaults.noise, ...settings.noise }; } catch {}
  const save = () => {
    settings.layers = [...engine.layers.values()].map((l) => ({ id: l.sound.id, gain: l.gainValue, origin: l.origin }));
    settings.volumes = engine.volumes; settings.noise = { color: engine.noise.color, tone: engine.noise.tone, hp: engine.noise.hp, gain: engine.noise.gain, on: engine.noise.on };
    try { localStorage.setItem('nebula', JSON.stringify(settings)); } catch {}
  };
  engine.volumes = settings.volumes;
  Object.assign(engine.noise, settings.noise, { on: false });
  visuals.setEnabled(settings.anim); visuals.setDensity(settings.density);

  // ---- Hulpfuncties ----------------------------------------------------------
  const kindInfo = (k) => D.kinds[k] || { colors: ['#1a1f2e', '#2a3350', '#3f4f80'], accent: '#9db0e0', particles: 'dust' };
  const kindLabel = (k) => library.kinds[k] || k;
  const moodLabel = (m) => library.moods[m] || m;

  // ---- Generatieve illustraties per soort (SVG, deterministisch per geluid) ----------
  const rng = (seed) => { let a = (seed >>> 0) || 1; return () => { a += 0x6d2b79f5; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const PAPER = '#f4ebdd', SAND = '#e9c79b';
  const f1 = (n) => Math.round(n * 10) / 10;
  const rnd0 = (r, a, b) => a + r() * (b - a);       // willekeurig getal uit de tekenreeks
  const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ctx0 = (s) => String(s).replace(/[^a-z0-9]/gi, ''); // veilige id voor een SVG-verwijzing
  function art(kind, seed = 1) {
    const r = rng(seed * 7919 + 13); const [c0, c1, c2] = kindInfo(kind).colors;
    const W = 300, H = 300; const id = `g${kind}${seed}`;
    let defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/></linearGradient>`;
    let body = '';
    const line = (x1, y1, x2, y2, col, w, o) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${col}" stroke-width="${w}" stroke-opacity="${f1(o)}" stroke-linecap="round"/>`;
    const dot = (x, y, rr, col, o) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${col}" fill-opacity="${f1(o)}"/>`;
    const wave = (y, amp, len, phase) => { let d = `M0 ${f1(y + Math.sin(phase) * amp)}`; for (let x = 0; x <= W; x += 10) d += ` L${x} ${f1(y + Math.sin(x / len + phase) * amp)}`; return d; };
    switch (kind) {
      case 'regen': case 'onweer': {
        const n = kind === 'onweer' ? 45 : 90;
        for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H, l = 12 + r() * 30; body += line(x, y, x - l * 0.25, y + l, c2, 1 + r(), 0.25 + r() * 0.5); }
        for (let i = 0; i < 4; i++) { const x = r() * W, y = H - 20 - r() * 40, rx = 10 + r() * 30; body += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * 0.3)}" fill="none" stroke="${c2}" stroke-opacity="0.35"/>`; }
        if (kind === 'onweer') {
          let x = W * (0.3 + r() * 0.4), y = 0, d = `M${f1(x)} 0`;
          for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 50; y += 25 + r() * 25; d += ` L${f1(x)} ${f1(y)}`; }
          body += `<path d="${d}" fill="none" stroke="#f7e8b0" stroke-width="6" stroke-opacity="0.25" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#f7e8b0" stroke-width="2" stroke-linejoin="round"/>`;
        }
        break;
      }
      case 'wind': {
        for (let i = 0; i < 7; i++) { const y = 30 + r() * (H - 60), a = 8 + r() * 22; body += `<path d="${wave(y, a, 30 + r() * 40, r() * 6)}" fill="none" stroke="${i % 2 ? c2 : PAPER}" stroke-opacity="${f1(0.15 + r() * 0.4)}" stroke-width="${f1(1 + r() * 2)}"/>`; }
        for (let i = 0; i < 10; i++) { const x = r() * W, y = r() * H; body += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(3 + r() * 5)}" ry="${f1(1.5 + r() * 2)}" transform="rotate(${Math.round(r() * 360)} ${f1(x)} ${f1(y)})" fill="${SAND}" fill-opacity="${f1(0.3 + r() * 0.5)}"/>`; }
        break;
      }
      case 'water': {
        for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * H; for (let k = 1; k <= 3; k++) body += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${k * (10 + r() * 8)}" ry="${f1(k * (4 + r() * 3))}" fill="none" stroke="${c2}" stroke-opacity="${f1(0.55 / k)}" stroke-width="1.2"/>`; }
        for (let i = 0; i < 25; i++) body += dot(r() * W, r() * H, 0.8 + r() * 1.5, PAPER, 0.2 + r() * 0.4);
        break;
      }
      case 'zee': {
        body += dot(W * (0.6 + r() * 0.3), 50 + r() * 50, 22 + r() * 14, SAND, 0.75);
        const cols = [c2, c1, c0, c0];
        for (let i = 0; i < 4; i++) { const y = H * (0.5 + i * 0.13); const ph = r() * 6, len = 28 + r() * 20, amp = 8 + r() * 8; body += `<path d="${wave(y, amp, len, ph)} L${W} ${H} L0 ${H} Z" fill="${cols[i]}" fill-opacity="${i === 0 ? 0.7 : 0.9}"/>`; body += `<path d="${wave(y, amp, len, ph)}" fill="none" stroke="${PAPER}" stroke-opacity="${f1(0.35 - i * 0.08)}"/>`; }
        break;
      }
      case 'vuur': {
        defs += `<radialGradient id="${id}r" cx="0.5" cy="1" r="0.8"><stop offset="0" stop-color="${c2}" stop-opacity="0.9"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>`;
        body += `<rect width="${W}" height="${H}" fill="url(#${id}r)"/>`;
        for (let i = 0; i < 6; i++) { const x = W * 0.3 + r() * W * 0.4, h = 60 + r() * 120, w = 14 + r() * 26; body += `<path d="M${f1(x - w)} ${H} Q${f1(x - w * 0.6)} ${f1(H - h * 0.55)} ${f1(x + (r() - 0.5) * 20)} ${f1(H - h)} Q${f1(x + w * 0.6)} ${f1(H - h * 0.5)} ${f1(x + w)} ${H} Z" fill="${i % 2 ? '#f6c177' : c2}" fill-opacity="${f1(0.45 + r() * 0.4)}"/>`; }
        for (let i = 0; i < 30; i++) body += dot(r() * W, r() * H * 0.8, 0.8 + r() * 1.8, '#ffd08a', 0.3 + r() * 0.6);
        break;
      }
      case 'vogels': {
        const hz = H * 0.66;
        body += dot(W * (0.2 + r() * 0.6), hz - 30 - r() * 60, 26 + r() * 12, SAND, 0.7);
        body += `<rect x="0" y="${f1(hz)}" width="${W}" height="${H - hz}" fill="${c0}" fill-opacity="0.85"/>` + line(0, hz, W, hz, PAPER, 1, 0.3);
        for (let i = 0; i < 14; i++) { const x = r() * W, y = 20 + r() * (hz - 60), s = 4 + r() * 8; body += `<path d="M${f1(x - s)} ${f1(y)} q${f1(s * 0.5)} ${f1(-s * 0.6)} ${f1(s)} 0 q${f1(s * 0.5)} ${f1(-s * 0.6)} ${f1(s)} 0" fill="none" stroke="${PAPER}" stroke-opacity="0.8" stroke-width="1.4" stroke-linecap="round"/>`; }
        break;
      }
      case 'bos': {
        const layers = [[c2, 0.35, 0.55], [c1, 0.7, 0.7], [c0, 1, 0.9]];
        for (const [col, sc, op] of layers) for (let x = -10; x < W + 20; x += 18 + r() * 22) { const h = (70 + r() * 110) * sc, w = 12 + r() * 16, base = H + 4; body += `<path d="M${f1(x - w)} ${base} L${f1(x)} ${f1(base - h)} L${f1(x + w)} ${base} Z" fill="${col}" fill-opacity="${op}"/>`; }
        for (let i = 0; i < 3; i++) body += `<rect x="0" y="${f1(H * (0.55 + r() * 0.35))}" width="${W}" height="${f1(6 + r() * 14)}" fill="${PAPER}" fill-opacity="${f1(0.06 + r() * 0.08)}"/>`;
        break;
      }
      case 'nacht': {
        for (let i = 0; i < 70; i++) body += dot(r() * W, r() * H, 0.5 + r() * 1.3, PAPER, 0.3 + r() * 0.7);
        for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * H; body += line(x - 5, y, x + 5, y, PAPER, 1, 0.8) + line(x, y - 5, x, y + 5, PAPER, 1, 0.8); }
        const mx = W * (0.25 + r() * 0.5), my = 60 + r() * 70;
        body += dot(mx, my, 34, SAND, 0.95) + dot(mx + 16, my - 10, 30, c0, 1);
        break;
      }
      case 'dieren': {
        for (let i = 0; i < 3; i++) { const cx = r() * W, cy = H * (0.75 + i * 0.12), rx = 150 + r() * 120; body += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(60 + r() * 40)}" fill="${[c2, c1, c0][i]}" fill-opacity="0.9"/>`; }
        for (let i = 0; i < 7; i++) { const x = 20 + r() * (W - 40), y = H * 0.72 + r() * 60; body += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(6 + r() * 3)}" ry="${f1(4 + r() * 2)}" fill="${PAPER}" fill-opacity="0.9"/>` + dot(x + 6, y - 1, 2.2, c0, 0.9); }
        break;
      }
      case 'stad': {
        body += dot(W * (0.3 + r() * 0.4), H * 0.55, 90, c2, 0.25);
        let x = -6;
        while (x < W) { const w = 16 + r() * 34, h = 60 + r() * 160; const dark = r() > 0.5; body += `<rect x="${f1(x)}" y="${f1(H - h)}" width="${f1(w)}" height="${f1(h)}" fill="${dark ? c0 : c1}"/>`; for (let wy = H - h + 8; wy < H - 6; wy += 11) for (let wx = x + 4; wx < x + w - 5; wx += 8) if (r() > 0.55) body += `<rect x="${f1(wx)}" y="${f1(wy)}" width="3" height="4.5" fill="${SAND}" fill-opacity="${f1(0.5 + r() * 0.5)}"/>`; x += w + 3; }
        break;
      }
      case 'cafe': {
        const cx = W / 2 + (r() - 0.5) * 40, cy = H * 0.62;
        body += `<ellipse cx="${f1(cx)}" cy="${f1(cy + 46)}" rx="78" ry="14" fill="${PAPER}" fill-opacity="0.25"/>`;
        body += `<path d="M${f1(cx - 50)} ${f1(cy - 20)} h100 v40 a50 24 0 0 1 -100 0 z" fill="${PAPER}" fill-opacity="0.9"/><path d="M${f1(cx + 50)} ${f1(cy - 8)} q34 -4 30 22 q-4 20 -30 18" fill="none" stroke="${PAPER}" stroke-width="9" stroke-opacity="0.9"/>`;
        body += `<ellipse cx="${f1(cx)}" cy="${f1(cy - 20)}" rx="50" ry="10" fill="${c0}" fill-opacity="0.8"/>`;
        for (let i = -1; i <= 1; i++) body += `<path d="M${f1(cx + i * 22)} ${f1(cy - 40)} c -10 -18 10 -26 0 -46 c -8 -14 8 -20 0 -34" fill="none" stroke="${PAPER}" stroke-opacity="${f1(0.35 + r() * 0.3)}" stroke-width="2.5" stroke-linecap="round"/>`;
        break;
      }
      case 'huis': {
        const x = W * (0.3 + r() * 0.3), w = 100 + r() * 40, h = 70 + r() * 30, y = H * 0.78;
        for (let i = 0; i < 30; i++) body += dot(r() * W, r() * H * 0.6, 0.6 + r() * 1.2, PAPER, 0.2 + r() * 0.5);
        body += `<rect x="${f1(x)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}" fill="${c0}"/><path d="M${f1(x - 12)} ${f1(y - h)} L${f1(x + w / 2)} ${f1(y - h - 55)} L${f1(x + w + 12)} ${f1(y - h)} Z" fill="${c1}"/>`;
        body += `<rect x="${f1(x + w * 0.2)}" y="${f1(y - h * 0.7)}" width="${f1(w * 0.22)}" height="${f1(h * 0.3)}" fill="${SAND}" fill-opacity="0.95"/><rect x="${f1(x + w * 0.62)}" y="${f1(y - h * 0.7)}" width="${f1(w * 0.18)}" height="${f1(h * 0.28)}" fill="${SAND}" fill-opacity="0.6"/>`;
        body += `<rect x="0" y="${f1(y)}" width="${W}" height="${H - y}" fill="${c0}" fill-opacity="0.9"/>` + line(0, y, W, y, PAPER, 1, 0.25);
        break;
      }
      case 'ruimte': {
        const cx = W * (0.35 + r() * 0.3), cy = H * (0.35 + r() * 0.3), rr = 40 + r() * 30;
        for (let i = 1; i <= 3; i++) body += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr + i * 38)}" fill="none" stroke="${PAPER}" stroke-opacity="${f1(0.22 / i)}"/>`;
        for (let i = 0; i < 40; i++) body += dot(r() * W, r() * H, 0.5 + r() * 1.2, PAPER, 0.3 + r() * 0.6);
        body += dot(cx, cy, rr, c2, 0.95) + `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rr * 1.9)}" ry="${f1(rr * 0.35)}" fill="none" stroke="${SAND}" stroke-width="3" stroke-opacity="0.85" transform="rotate(-18 ${f1(cx)} ${f1(cy)})"/>`;
        break;
      }
      case 'muziek': {
        body += dot(W * (0.3 + r() * 0.4), H * (0.3 + r() * 0.4), 90, c2, 0.3);
        const top = H * 0.3;
        for (let i = 0; i < 5; i++) body += line(0, top + i * 18, W, top + i * 18, PAPER, 1, 0.3);
        for (let i = 0; i < 7; i++) { const x = 25 + i * 40 + r() * 10, y = top + Math.floor(r() * 9) * 9; body += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="7" ry="5" transform="rotate(-20 ${f1(x)} ${f1(y)})" fill="${SAND}"/>` + line(x + 6, y - 2, x + 6, y - 40, SAND, 2, 1); }
        break;
      }
      case 'jazz': { // grammofoonplaat
        const cx = W / 2 + (r() - 0.5) * 30, cy = H * 0.55, R = 105;
        body += dot(cx + 40, cy - 60, 70, c2, 0.18);
        body += dot(cx, cy, R, '#0c0709', 0.95);
        for (let k = R - 8; k > 34; k -= 6) body += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${k}" fill="none" stroke="${PAPER}" stroke-opacity="${f1(0.05 + r() * 0.07)}" stroke-width="1"/>`;
        body += dot(cx, cy, 32, c2, 0.95) + dot(cx, cy, 3.5, '#0c0709', 1);
        body += `<path d="M${f1(cx - 60)} ${f1(cy - 95)} A110 110 0 0 1 ${f1(cx + 70)} ${f1(cy - 82)}" fill="none" stroke="${PAPER}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>`;
        break;
      }
      case 'kerst': { // kerstboom in de sneeuw
        for (let i = 0; i < 60; i++) body += dot(r() * W, r() * H, 0.8 + r() * 2, PAPER, 0.3 + r() * 0.6);
        body += `<ellipse cx="${W / 2}" cy="${H - 10}" rx="${W * 0.7}" ry="34" fill="${PAPER}" fill-opacity="0.9"/>`;
        const cx = W / 2 + (r() - 0.5) * 20, base = H - 30;
        const tiers = [[base, 80, 70], [base - 55, 62, 60], [base - 100, 44, 52]];
        for (const [y, w, h] of tiers) body += `<path d="M${f1(cx - w)} ${f1(y)} L${f1(cx)} ${f1(y - h)} L${f1(cx + w)} ${f1(y)} Z" fill="${c1}"/>`;
        for (let i = 0; i < 9; i++) { const t = r(); const y = base - 15 - t * 120, spread = 70 * (1 - t) + 6; body += dot(cx + (r() - 0.5) * 2 * spread, y, 4 + r() * 3, i % 2 ? c2 : SAND, 0.95); }
        const sx = cx, sy = base - 158;
        body += `<path d="M${f1(sx)} ${f1(sy - 12)} l3.5 8 8.5 1 -6 6 1.5 8.5 -7.5 -4 -7.5 4 1.5 -8.5 -6 -6 8.5 -1 z" fill="${SAND}"/>`;
        break;
      }
      case 'film': { // breedbeeld: een lage zon boven bergsilhouetten, met zwarte balken als in de bioscoop
        const hz = H * 0.62, zx = W * (0.28 + r() * 0.44), zr = 34 + r() * 20;
        const gloed = ctx0(`${id}z`);
        defs += `<radialGradient id="${gloed}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${c2}" stop-opacity="0.85"/><stop offset="0.45" stop-color="${c2}" stop-opacity="0.3"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>`;
        body += `<circle cx="${f1(zx)}" cy="${f1(hz - zr * 0.15)}" r="${f1(zr * 3.4)}" fill="url(#${gloed})"/>`;
        body += dot(zx, hz - zr * 0.15, zr, c2, 0.92);
        // strepen door de zon: breedte volgt de cirkel, dus ze steken er niet buiten
        const zy = hz - zr * 0.15;
        for (let y = zy - zr * 0.7; y < zy + zr; y += 7) {
          const halve = Math.sqrt(Math.max(0, zr * zr - (y - zy) * (y - zy)));
          if (halve > 2) body += line(zx - halve, y, zx + halve, y, c0, 2.2, 0.5);
        }
        for (let i = 0; i < 60; i++) { const y = r() * (hz - 40); body += dot(r() * W, y, 0.4 + r() * 1.2, PAPER, 0.15 + r() * 0.5); }
        // bergketens: verder weg is lichter
        const keten = (y, hoogte, kleur, op) => {
          let d = `M0 ${H} L0 ${f1(y)}`;
          for (let x = 0; x <= W; x += 14) d += ` L${f1(x)} ${f1(y - Math.abs(Math.sin(x * 0.013 + r() * 0.4)) * hoogte * (0.5 + r() * 0.7))}`;
          body += `<path d="${d} L${W} ${H} Z" fill="${kleur}" fill-opacity="${op}"/>`;
        };
        keten(hz + 4, 26, c1, 0.75); keten(hz + 24, 34, c0, 0.9); keten(hz + 52, 40, '#05070d', 0.95);
        // spiegeling in het water onder de horizon
        body += `<rect x="0" y="${f1(hz + 82)}" width="${W}" height="${f1(H - hz - 82)}" fill="${c1}" fill-opacity="0.3"/>`;
        for (let i = 0; i < 14; i++) { const y = hz + 88 + r() * (H - hz - 92); body += line(zx - rnd0(r, 6, 34), y, zx + rnd0(r, 6, 34), y, c2, 1.6, 0.1 + r() * 0.22); }
        // breedbeeldbalken
        body += `<rect x="0" y="0" width="${W}" height="22" fill="#05060a"/><rect x="0" y="${H - 22}" width="${W}" height="22" fill="#05060a"/>`;
        break;
      }
      case 'gregoriaans': { // gebrandschilderd spitsboograam met een lichtbundel in een stenen kerk
        const cx = W * (0.36 + r() * 0.12), bw = 32 + r() * 10, top = 44 + r() * 14, sy = top + 50, bot = H * 0.63;
        const vloer = H * 0.82;
        // stenen muur: een paar horizontale voegen
        for (let y = 22; y < vloer; y += 26 + r() * 10) body += line(0, y, W, y + rnd0(r, -3, 3), PAPER, 1, 0.04);
        // lichtbundel die schuin op de vloer valt, met een lichtplas
        body += `<path d="M${f1(cx - bw)} ${f1(sy)} L${f1(cx + bw)} ${f1(sy)} L${f1(cx + bw + 120)} ${f1(vloer)} L${f1(cx - bw + 78)} ${f1(vloer)} Z" fill="${SAND}" fill-opacity="0.09"/>`;
        body += `<ellipse cx="${f1(cx + 99)}" cy="${f1(vloer)}" rx="${f1(bw + 62)}" ry="9" fill="${SAND}" fill-opacity="0.13"/>`;
        // de spitsboog zelf: twee bogen die in een punt samenkomen
        const ogief = (x0, x1, apex, y0, y1) => `M${f1(x0)} ${f1(y1)} L${f1(x0)} ${f1(y0)} Q${f1(x0)} ${f1(apex + (y0 - apex) * 0.35)} ${f1((x0 + x1) / 2)} ${f1(apex)} Q${f1(x1)} ${f1(apex + (y0 - apex) * 0.35)} ${f1(x1)} ${f1(y0)} L${f1(x1)} ${f1(y1)} Z`;
        const raam = ogief(cx - bw, cx + bw, top, sy, bot);
        // glas: gekleurde ruitjes achter het loodwerk
        const glas = ['#c9a227', '#8d3b3b', '#2f5d8a', '#3d6b4a', '#7a4a86'];
        body += `<path d="${raam}" fill="${SAND}" fill-opacity="0.22"/>`;
        body += `<clipPath id="${id}c"><path d="${raam}"/></clipPath><g clip-path="url(#${id}c)">`;
        for (let y = top; y < bot; y += 15) for (let x = cx - bw; x < cx + bw; x += 15) {
          body += `<rect x="${f1(x)}" y="${f1(y)}" width="14" height="14" fill="${pickR(r, glas)}" fill-opacity="${f1(0.35 + r() * 0.45)}"/>`;
        }
        body += '</g>';
        // loodwerk en de stenen omlijsting
        for (let y = sy + 20; y < bot; y += 34) body += line(cx - bw, y, cx + bw, y, c0, 2, 0.85);
        body += line(cx, top + 12, cx, bot, c0, 2.4, 0.85);
        body += `<path d="${raam}" fill="none" stroke="${c0}" stroke-width="5" stroke-opacity="0.95"/>`;
        // Tracering in de boogkop: een klein vierpas, zoals in gotische ramen.
        const ty = top + 26;
        body += `<circle cx="${f1(cx)}" cy="${f1(ty)}" r="10" fill="none" stroke="${c0}" stroke-width="2.4"/>`;
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; body += `<circle cx="${f1(cx + Math.cos(a) * 6)}" cy="${f1(ty + Math.sin(a) * 6)}" r="5" fill="${pickR(r, glas)}" fill-opacity="0.65" stroke="${c0}" stroke-width="1.4"/>`; }
        // stof dat in de lichtbundel danst
        for (let i = 0; i < 34; i++) { const k = r(); body += dot(cx - bw + 20 + k * 150 + r() * 60, sy + k * (vloer - sy) * r() + 10, 0.6 + r() * 1.5, PAPER, 0.15 + r() * 0.4); }
        // vloer en een kaars die de ruimte warm maakt
        body += `<rect x="0" y="${f1(vloer)}" width="${W}" height="${H - vloer}" fill="${c0}" fill-opacity="0.9"/>` + line(0, vloer, W, vloer, PAPER, 1, 0.18);
        const kx = W * (0.78 + r() * 0.1), kb = vloer - 4;
        body += `<ellipse cx="${f1(kx)}" cy="${f1(kb - 34)}" rx="16" ry="22" fill="#f6c177" fill-opacity="0.16"/>`;
        body += `<rect x="${f1(kx - 4)}" y="${f1(kb - 26)}" width="8" height="26" fill="${PAPER}" fill-opacity="0.85"/>`;
        body += `<path d="M${f1(kx)} ${f1(kb - 40)} q5 7 0 14 q-5 -7 0 -14z" fill="#f6c177"/>`;
        break;
      }
      default:
        for (let i = 0; i < 40; i++) body += dot(r() * W, r() * H, 1 + r() * 3, PAPER, 0.2 + r() * 0.5);
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>${body}${beweging(kind, r, W, H, c2)}</svg>`;
  }
  /**
   * De bewegende laag over een kaartillustratie: regen die valt, damp die van de koffie komt, vonken
   * die opstijgen. Hij staat stil tot je de kaart aanwijst (zie .beweeg in style.css), zodat een
   * pagina vol kaarten rustig blijft en je meteen ziet waar een sfeer over gaat zodra je erheen gaat.
   * De negatieve vertraging zet elk element op een ander punt in zijn cyclus, anders bewegen ze in
   * de maat en dat verraadt zich meteen.
   */
  function beweging(kind, r, W, H, c2) {
    const el = (svg, naam, duur, vertraging) =>
      svg.replace(/^<(\w+)/, `<$1 style="animation-name:${naam};animation-duration:${f1(duur)}s;animation-delay:-${f1(vertraging)}s"`);
    const lijn = (x, y, len, col, w, o) => `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - len * 0.25)}" y2="${f1(y + len)}" stroke="${col}" stroke-width="${f1(w)}" stroke-opacity="${f1(o)}" stroke-linecap="round"/>`;
    const stip = (x, y, rr, col, o) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${col}" fill-opacity="${f1(o)}"/>`;
    const maak = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
    let s = '';
    switch (kind) {
      case 'regen': case 'onweer':
        s = maak(kind === 'onweer' ? 30 : 44, () => el(lijn(r() * W, r() * H - 40, 14 + r() * 26, c2, 1 + r(), 0.35 + r() * 0.45), 'val', 0.8 + r() * 0.7, r() * 2));
        break;
      case 'kerst':
        s = maak(26, () => el(stip(r() * W, r() * H - 40, 1.5 + r() * 3, '#fff', 0.5 + r() * 0.5), 'val', 4 + r() * 4, r() * 8));
        break;
      case 'vuur':
        s = maak(20, () => el(stip(W * (0.28 + r() * 0.44), H * (0.62 + r() * 0.25), 1 + r() * 2.2, '#ffb057', 0.6 + r() * 0.4), 'stijg', 1.6 + r() * 1.8, r() * 3));
        break;
      case 'cafe': case 'huis':
        // Damp van een kop koffie: smalle slierten die opstijgen, breder worden en oplossen.
        s = maak(7, () => { const x = W / 2 + (r() - 0.5) * 70, y = H * (0.4 + r() * 0.1);
          return el(`<path d="M${f1(x)} ${f1(y)} c -8 -14 8 -20 0 -34" fill="none" stroke="${PAPER}" stroke-opacity="${f1(0.25 + r() * 0.35)}" stroke-width="${f1(1.6 + r() * 1.6)}" stroke-linecap="round"/>`, 'stijg', 3 + r() * 2.5, r() * 5); });
        break;
      case 'zee': case 'water': case 'wind': case 'bos':
        s = maak(6, (i) => { const y = 40 + r() * (H - 80), a = 6 + r() * 16;
          let d = `M-40 ${f1(y)}`; for (let x = -40; x <= W + 40; x += 12) d += ` L${x} ${f1(y + Math.sin(x / (26 + r() * 30) + i) * a)}`;
          return el(`<path d="${d}" fill="none" stroke="${c2}" stroke-opacity="${f1(0.2 + r() * 0.35)}" stroke-width="${f1(1 + r() * 1.8)}"/>`, 'drijf', 5 + r() * 5, r() * 8); });
        break;
      case 'nacht': case 'ruimte': case 'film': case 'muziek': case 'gregoriaans':
        s = maak(22, () => el(stip(r() * W, r() * H, 0.8 + r() * 1.8, PAPER, 0.5 + r() * 0.5), 'twinkel', 1.6 + r() * 2.6, r() * 4));
        break;
      case 'stad':
        s = maak(10, () => el(stip(r() * W, H * (0.25 + r() * 0.6), 3 + r() * 7, c2, 0.25 + r() * 0.3), 'drijf', 7 + r() * 7, r() * 12));
        break;
      case 'vogels': case 'dieren': case 'jazz':
        s = maak(16, () => el(stip(r() * W, r() * H, 1 + r() * 2, PAPER, 0.3 + r() * 0.4), 'zweef', 3 + r() * 4, r() * 6));
        break;
      default:
        s = maak(16, () => el(stip(r() * W, r() * H, 1 + r() * 2, PAPER, 0.3 + r() * 0.4), 'zweef', 3 + r() * 4, r() * 6));
    }
    return `<g class="beweeg">${s}</g>`;
  }
  const seedOf = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 1000;
  const fmtTime = (sec) => { if (!sec) return ''; const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let toastTimer;
  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); };
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  /**
   * Kies per soort een geluid voor een mix. Nebula's eigen geluiden krijgen ruim voorrang: ze
   * herhalen nooit en mengen beter. Binnen de opnames hebben langere meer kans.
   */
  const pickKind = (kind, exclude = new Set()) => {
    let list = library.sounds.filter((s) => s.kind === kind && !exclude.has(s.id));
    if (!list.length) return null;
    const eigen = list.filter((s) => s.synth);
    if (eigen.length && Math.random() < 0.7) list = eigen;
    const weights = list.map((s) => Math.sqrt(s.synth ? 900 : Math.min(600, s.seconds || 60)));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };
  /** Wissel soorten af zodat een rij divers is. */
  const interleave = (sounds) => {
    const groups = new Map();
    for (const s of sounds) { if (!groups.has(s.kind)) groups.set(s.kind, []); groups.get(s.kind).push(s); }
    const rank = (s) => (s.synth ? Infinity : s.seconds || 0); // eigen geluiden eerst, dan de langste opnames
    for (const g of groups.values()) g.sort((a, b) => rank(b) - rank(a));
    const out = []; const lists = [...groups.values()];
    while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift());
    return out;
  };

  // ---- Bibliotheek laden ------------------------------------------------------
  /** Nebula's eigen, live gemaakte geluiden. Zitten altijd in de app, ook zonder gedownloade bestanden. */
  function synthSounds() {
    if (!window.NebulaSynth) return [];
    return window.NebulaSynth.list.map((g) => ({
      id: `synth:${g.id}`, synth: g.id, title: g.title, kind: g.kind, moods: D.kindMoods[g.kind] || [],
      source: 'synth', sourceName: 'Nebula', license: 'Eigen geluid van Nebula, live gemaakt in de app',
      author: 'Nebula', seconds: null, bytes: 0, file: null, tags: ['eigen', g.desc],
    }));
  }
  async function loadLibrary() {
    try {
      const res = await fetch('library.json', { cache: 'no-cache' });
      library = await res.json();
    } catch { library = { sounds: [], kinds: {}, moods: {} }; }
    library.sounds = library.sounds || []; library.kinds = { ...D.kindLabels, ...(library.kinds || {}) }; library.moods = { ...D.moodLabels, ...(library.moods || {}) };
    library.sounds = [...synthSounds(), ...library.sounds.filter((s) => s.source !== 'synth')];
    byId = new Map(library.sounds.map((s) => [s.id, s]));
    renderHome(); renderMixer(); renderLibraryInfo();
  }

  // ---- Navigatie ----------------------------------------------------------------
  function showPage(name) {
    settings.page = name; save();
    $$('.page').forEach((p) => { p.hidden = p.dataset.page !== name; });
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
    $('#content').scrollTop = 0;
  }
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

  // ---- Sferen (home) -------------------------------------------------------------
  function soundCard(s, { mix = false } = {}) {
    const el = document.createElement('button');
    el.className = 'card' + (mix ? ' mix' : '');
    el.dataset.id = s.id;
    el.innerHTML = `<div class="art">${art(s.kind, seedOf(s.id))}</div>` +
      (mix ? `<span class="dots">${(s.kinds || []).map((k) => `<i style="background:${kindInfo(k).colors[2]}"></i>`).join('')}</span>` : `<span class="badge">${esc(s.sourceName || s.source)}</span>`) +
      `<div class="label"><div class="t">${esc(s.title)}</div><div class="s">${mix ? esc(s.sub) : esc(kindLabel(s.kind)) + (s.synth ? ' · eindeloos' : s.seconds ? ' · ' + fmtTime(s.seconds) : '')}</div></div><span class="eq"><i></i><i></i><i></i></span>`;
    if (s.synth) el.classList.add('own');
    el.title = mix ? s.title : `${s.title}\n${s.synth ? (s.tags?.[1] || '') + ' · live gemaakt door Nebula, herhaalt nooit' : (s.sourceName || '') + ' · ' + (s.license || '')}`;
    return el;
  }
  function renderHome() {
    const root = $('#home-rows'); root.innerHTML = '';
    if (!library.sounds.length) {
      root.innerHTML = `<div class="empty"><h2>Nog geen geluiden</h2><p>De bibliotheek is leeg. ${desktop ? 'Haal via <b>Instellingen › Bibliotheek</b> gratis ambient geluiden op.' : 'Voer <code>npm run fetch</code> uit (of <code>npm run fetch -- --all</code> voor alles) en vernieuw de pagina.'}</p>${desktop ? '<button class="btn primary" id="empty-go">Naar bibliotheek</button>' : ''}</div>`;
      $('#empty-go')?.addEventListener('click', () => showPage('settings'));
      return;
    }
    // Mixen
    const mixes = D.mixes.filter((m) => Object.keys(m.layers).some((k) => library.sounds.some((s) => s.kind === k)));
    if (mixes.length) {
      const sec = document.createElement('section'); sec.className = 'row';
      sec.innerHTML = `<div class="row-head"><h3>Mixen <span class="count">meerdere lagen in één tik</span></h3></div>`;
      const row = document.createElement('div'); row.className = 'cards';
      for (const m of mixes) {
        const kinds = Object.keys(m.layers).filter((k) => library.sounds.some((s) => s.kind === k));
        const card = soundCard({ id: 'mix:' + m.id, title: m.title, kind: kinds[0], kinds, sub: kinds.map(kindLabel).join(' + ') }, { mix: true });
        card.addEventListener('click', () => startMix(m));
        row.appendChild(card);
      }
      sec.appendChild(row); root.appendChild(sec);
    }
    // Nebula's eigen geluiden: altijd aanwezig, worden live gemaakt
    const own = library.sounds.filter((s) => s.synth);
    if (own.length) {
      const sec = document.createElement('section'); sec.className = 'row';
      sec.innerHTML = `<div class="row-head"><h3>Van Nebula zelf <span class="count">${own.length} · live gemaakt, herhaalt nooit</span></h3><button class="link">Alles tonen</button></div>`;
      sec.querySelector('.link').addEventListener('click', () => { settings.mixerKind = 'eigen'; renderMixer(); showPage('mixer'); });
      const row = document.createElement('div'); row.className = 'cards';
      for (const s of interleave(own)) { const card = soundCard(s); card.addEventListener('click', () => playMain(s)); row.appendChild(card); }
      sec.appendChild(row); root.appendChild(sec);
    }
    // Per sfeer
    for (const mood of D.moodOrder) {
      const list = interleave(library.sounds.filter((s) => (s.moods || []).includes(mood)));
      if (!list.length) continue;
      const sec = document.createElement('section'); sec.className = 'row';
      sec.innerHTML = `<div class="row-head"><h3>${esc(moodLabel(mood))} <span class="count">${list.length}</span></h3><button class="link" data-mood="${mood}">Alles tonen</button></div>`;
      sec.querySelector('.link').addEventListener('click', () => { settings.mixerKind = 'mood:' + mood; renderMixer(); showPage('mixer'); });
      const row = document.createElement('div'); row.className = 'cards';
      for (const s of list.slice(0, 14)) {
        const card = soundCard(s);
        card.addEventListener('click', () => playMain(s, mood));
        row.appendChild(card);
      }
      sec.appendChild(row); root.appendChild(sec);
    }
    updatePlayingMarks();
  }
  async function playMain(s, mood) {
    activeMix = null;
    currentMood = mood || (s.moods || [])[0] || null;
    await engine.playMain(s, 0.85);
    setScene(s.kind);
    updatePlayer(); save();
  }
  async function startMix(m) {
    engine.ensure();
    activeMix = m; currentMood = m.mood;
    engine.clearMain();
    const used = new Set(); let firstKind = null;
    for (const [kind, gain] of Object.entries(m.layers)) {
      const s = pickKind(kind, used); if (!s) continue;
      used.add(s.id); firstKind = firstKind || kind;
      engine.playing = true;
      await engine.addLayer(s, { gain, origin: 'main' });
    }
    if (m.noise) engine.setNoise({ on: true, color: m.noise.color, gain: m.noise.gain }); else if (engine.noise.on) engine.setNoise({ on: false });
    renderNoise();
    if (firstKind) setScene(firstKind);
    updatePlayer(); save();
    toast(`Mix gestart: ${m.title}`);
  }
  function setScene(kind) {
    const k = kindInfo(kind);
    visuals.setScene({ colors: k.colors, accent: k.accent, particles: k.particles });
    tint(k.accent || k.colors[2], k.colors[0]);
  }
  /**
   * Laat de hele interface meekleuren met wat er speelt. De accentkleur zit in één variabele, zodat
   * knoppen, tabbladen en randen samen van kleur wisselen in plaats van altijd zandkleurig te blijven.
   */
  function tint(accent, diep) {
    const root = document.documentElement.style;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
    root.setProperty('--k-accent', accent);
    root.setProperty('--k-rgb', `${r}, ${g}, ${b}`);
    if (diep) root.setProperty('--k-deep', diep);
  }

  // ---- Mixer -------------------------------------------------------------------
  function renderMixer() {
    const chips = $('#mixer-chips'); chips.innerHTML = '';
    const kinds = [...new Set(library.sounds.map((s) => s.kind))].sort((a, b) => kindLabel(a).localeCompare(kindLabel(b)));
    const filter = settings.mixerKind || 'alle';
    const mk = (id, label) => { const b = document.createElement('button'); b.className = 'chip' + (filter === id ? ' active' : ''); b.textContent = label; b.addEventListener('click', () => { settings.mixerKind = id; save(); renderMixer(); }); chips.appendChild(b); };
    mk('alle', 'Alles'); mk('actief', 'Actief'); if (library.sounds.some((s) => s.synth)) mk('eigen', 'Van Nebula zelf');
    if (filter.startsWith('mood:')) mk(filter, moodLabel(filter.slice(5))); // gekozen vanaf Sferen
    for (const k of kinds) mk(k, kindLabel(k));
    renderMixerGroups();
  }
  const expandedGroups = new Set();
  function renderMixerGroups() {
    const root = $('#mixer-groups'); root.innerHTML = '';
    const q = ($('#mixer-search').value || '').trim().toLowerCase();
    const filter = settings.mixerKind || 'alle';
    let list = library.sounds.filter((s) => {
      if (filter === 'actief' && !engine.layers.has(s.id)) return false;
      if (filter === 'eigen' && !s.synth) return false;
      if (filter.startsWith('mood:') && !(s.moods || []).includes(filter.slice(5))) return false;
      if (!['alle', 'actief', 'eigen'].includes(filter) && !filter.startsWith('mood:') && s.kind !== filter) return false;
      if (q && !`${s.title} ${s.kind} ${kindLabel(s.kind)} ${(s.tags || []).join(' ')} ${s.sourceName}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (!list.length) { root.innerHTML = `<p class="muted">Geen geluiden gevonden${library.sounds.length ? '' : ': de bibliotheek is nog leeg'}.</p>`; return; }
    const groups = new Map();
    for (const s of list) { if (!groups.has(s.kind)) groups.set(s.kind, []); groups.get(s.kind).push(s); }
    for (const [kind, sounds] of [...groups].sort((a, b) => kindLabel(a[0]).localeCompare(kindLabel(b[0])))) {
      const sec = document.createElement('section'); sec.className = 'group';
      sec.innerHTML = `<h3>${esc(kindLabel(kind))} <span class="count">${sounds.length}</span></h3>`;
      const sorted = sounds.sort((a, b) => (engine.layers.has(b.id) ? 1 : 0) - (engine.layers.has(a.id) ? 1 : 0) || (b.synth ? 1 : 0) - (a.synth ? 1 : 0) || a.title.localeCompare(b.title));
      const showAll = q || groups.size === 1 || expandedGroups.has(kind);
      const shown = showAll ? sorted : sorted.slice(0, 6);
      for (const s of shown) sec.appendChild(fxCard(s));
      if (!showAll && sorted.length > shown.length) {
        const more = document.createElement('button'); more.className = 'more'; more.textContent = `Alle ${sorted.length} tonen`;
        more.addEventListener('click', () => { expandedGroups.add(kind); renderMixerGroups(); });
        sec.appendChild(more);
      }
      root.appendChild(sec);
    }
  }
  function fxCard(s) {
    const layer = engine.layers.get(s.id);
    const el = document.createElement('div');
    el.className = 'strip' + (layer ? ' on' : ''); el.dataset.id = s.id;
    const gain = layer ? layer.gainValue : 0.6;
    el.innerHTML = `<div class="art">${art(s.kind, seedOf(s.id))}</div>
      <div class="text"><div class="t" title="${esc(s.title)}">${esc(s.title)}</div>
      <div class="s">${s.synth ? `<span class="own-tag" title="${esc(s.license)}">Nebula zelf</span> · ${esc(s.tags?.[1] || 'eindeloos')}` : `<a href="${esc(s.sourceUrl || '#')}" target="_blank" rel="noopener" title="${esc(s.license || '')}">${esc(s.sourceName || s.source)}</a>${s.seconds ? ' · ' + fmtTime(s.seconds) : ''}`}</div></div>
      <div class="vol"><input type="range" min="0" max="1" step="0.01" value="${gain}" aria-label="Volume"><output>${Math.round(gain * 100)}%</output></div>
      <label class="switch small" title="Aan/uit"><input type="checkbox" ${layer ? 'checked' : ''}><span class="track"></span></label>`;
    const cb = el.querySelector('input[type=checkbox]'); const range = el.querySelector('input[type=range]'); const out = el.querySelector('output');
    cb.addEventListener('change', async () => {
      if (cb.checked) { engine.playing = true; await engine.addLayer(s, { gain: Number(range.value), origin: 'fx' }); if (!engine.mainLayers().length) setScene(s.kind); }
      else engine.removeLayer(s.id);
      el.classList.toggle('on', cb.checked); updatePlayer(); save();
    });
    range.addEventListener('input', () => {
      out.textContent = Math.round(range.value * 100) + '%';
      const l = engine.layers.get(s.id);
      if (l) l.setGain(Number(range.value));
      else if (Number(range.value) > 0) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    });
    range.addEventListener('change', save);
    return el;
  }
  $('#mixer-search').addEventListener('input', renderMixerGroups);

  // ---- Ruis ---------------------------------------------------------------------
  function renderNoise() {
    $('#noise-on').checked = engine.noise.on;
    const wrap = $('#noise-colors'); wrap.innerHTML = '';
    for (const c of D.noiseColors) {
      const b = document.createElement('button'); b.className = 'ncolor' + (engine.noise.color === c.id ? ' active' : '');
      b.innerHTML = `<span class="dot" style="background:${c.color}"></span><span>${c.label}</span><small>${c.desc}</small>`;
      b.addEventListener('click', () => { engine.setNoise({ color: c.id }); renderNoise(); save(); });
      wrap.appendChild(b);
    }
    $('#noise-tone').value = engine.noise.tone; $('#noise-tone-out').textContent = engine.noise.tone >= 1000 ? (engine.noise.tone / 1000).toFixed(1) + ' kHz' : engine.noise.tone + ' Hz';
    $('#noise-hp').value = engine.noise.hp; $('#noise-hp-out').textContent = engine.noise.hp + ' Hz';
    $('#noise-gain').value = engine.noise.gain; $('#noise-gain-out').textContent = Math.round(engine.noise.gain * 100) + '%';
    $$('[data-noise-preset]').forEach((b) => { const p = D.noisePresets[b.dataset.noisePreset]; b.classList.toggle('active', p.tone === engine.noise.tone && p.hp === engine.noise.hp); });
  }
  $('#noise-on').addEventListener('change', (e) => { engine.setNoise({ on: e.target.checked }); if (e.target.checked && !engine.layers.size) { visuals.setScene({ colors: ['#0d1220', '#22304a', '#5a6a8a'], accent: '#93a8cc', particles: 'snow' }); tint('#93a8cc', '#0d1220'); } updatePlayer(); save(); });
  $('#noise-tone').addEventListener('input', (e) => { engine.setNoise({ tone: Number(e.target.value) }); renderNoise(); });
  $('#noise-hp').addEventListener('input', (e) => { engine.setNoise({ hp: Number(e.target.value) }); renderNoise(); });
  $('#noise-gain').addEventListener('input', (e) => { engine.setNoise({ gain: Number(e.target.value) }); renderNoise(); });
  $$('#noise-tone, #noise-hp, #noise-gain').forEach((el) => el.addEventListener('change', save));
  $$('[data-noise-preset]').forEach((b) => b.addEventListener('click', () => { engine.setNoise({ ...D.noisePresets[b.dataset.noisePreset] }); renderNoise(); save(); }));

  // ---- Radio --------------------------------------------------------------------
  function renderRadio() {
    const grid = $('#radio-grid'); grid.innerHTML = '';
    for (const st of D.radio) {
      const b = document.createElement('button'); b.className = 'station' + (engine.radio.station?.id === st.id ? ' playing' : ''); b.dataset.id = st.id;
      b.style.setProperty('--station', st.color);
      b.innerHTML = `<div class="n">${esc(st.name)}</div><div class="c">${esc(st.country)}</div><div class="g">${esc(st.genre)}</div>`;
      b.addEventListener('click', () => {
        if (engine.radio.station?.id === st.id) { engine.stopRadio(); }
        else { engine.playRadio(st); const basis = norm(st.color + ''), licht = shade(basis, 40); visuals.setScene({ colors: [shade(basis, -40), basis, licht], accent: licht, particles: 'stars' }); tint(licht, shade(basis, -40)); toast(`Radio: ${st.name}`); }
        renderRadio(); updatePlayer(); save();
      });
      grid.appendChild(b);
    }
  }
  const norm = (c) => (c.length === 7 ? c : '#222a3a');
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, v + amt)); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join(''); }

  // ---- Timer --------------------------------------------------------------------
  const timer = { end: 0, iv: null, mode: 'timer', phase: 'werk', cycle: 0, fade: 30 };
  function renderTimerPresets() {
    const wrap = $('#timer-presets'); wrap.innerHTML = '';
    for (const m of D.timerPresets) { const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = m + ' min'; b.addEventListener('click', () => { $('#timer-custom').value = m; startTimer(m); }); wrap.appendChild(b); }
    $('#timer-fade').value = String(settings.timerFade);
  }
  function startTimer(minutes) {
    stopTimer(false);
    timer.fade = Number($('#timer-fade').value); settings.timerFade = timer.fade; save();
    timer.mode = $('#timer-pomodoro').checked ? 'pomodoro' : 'timer';
    timer.phase = 'werk'; timer.cycle = 1;
    const mins = timer.mode === 'pomodoro' ? 25 : minutes;
    timer.end = Date.now() + mins * 60000;
    timer.iv = setInterval(tickTimer, 250);
    if (!engine.playing && engine.hasContent()) engine.play();
    tickTimer();
    toast(timer.mode === 'pomodoro' ? 'Pomodoro gestart: 25 minuten werken' : `Timer gestart: ${mins} minuten`);
  }
  function stopTimer(announce = true) {
    if (timer.iv) clearInterval(timer.iv); timer.iv = null; timer.end = 0;
    $('#timer-display').textContent = '--:--'; $('#timer-status').textContent = 'Geen timer actief';
    if (announce) toast('Timer gestopt');
  }
  async function tickTimer() {
    const left = Math.max(0, timer.end - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    $('#timer-display').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    $('#timer-status').textContent = timer.mode === 'pomodoro' ? `Pomodoro ronde ${timer.cycle}: ${timer.phase === 'werk' ? 'werken' : 'pauze'}` : `Geluid stopt${timer.fade ? ` met ${timer.fade} s uitfaden` : ''}`;
    if (left > 0) return;
    clearInterval(timer.iv); timer.iv = null;
    if (timer.mode === 'timer') {
      $('#timer-status').textContent = 'Uitfaden…';
      await engine.fadeOut(timer.fade);
      stopTimer(false); toast('Timer afgelopen'); updatePlayer();
    } else if (timer.phase === 'werk') {
      await engine.fadeOut(Math.min(timer.fade, 10));
      timer.phase = 'pauze'; timer.end = Date.now() + 5 * 60000; timer.iv = setInterval(tickTimer, 250);
      toast('Pauze: 5 minuten'); updatePlayer();
    } else {
      timer.phase = 'werk'; timer.cycle++; timer.end = Date.now() + 25 * 60000; timer.iv = setInterval(tickTimer, 250);
      if (engine.hasContent()) engine.play();
      toast(`Ronde ${timer.cycle}: weer 25 minuten werken`); updatePlayer();
    }
  }
  $('#timer-start').addEventListener('click', () => startTimer(Math.max(1, Number($('#timer-custom').value) || 45)));
  $('#timer-stop').addEventListener('click', () => stopTimer());

  // ---- Instellingen -------------------------------------------------------------
  const busLabels = { master: 'Hoofdvolume', main: 'Sferen', fx: 'Mixer-lagen', noise: 'Ruis', radio: 'Radio' };
  function renderVolumeMixer(root) {
    root.innerHTML = '';
    for (const [bus, label] of Object.entries(busLabels)) {
      const row = document.createElement('label'); row.className = 'slider-row';
      row.innerHTML = `<span>${label}</span><input type="range" min="0" max="1" step="0.01" value="${engine.volumes[bus]}" data-bus="${bus}"><output>${Math.round(engine.volumes[bus] * 100)}%</output>`;
      const r = row.querySelector('input');
      r.addEventListener('input', () => { engine.setVolume(bus, Number(r.value)); });
      r.addEventListener('change', save);
      root.appendChild(row);
    }
  }
  function syncVolumeUI() {
    $$('input[data-bus]').forEach((r) => { r.value = engine.volumes[r.dataset.bus]; r.nextElementSibling.textContent = Math.round(engine.volumes[r.dataset.bus] * 100) + '%'; });
    $('#master').value = engine.volumes.master;
    $('#im-master').value = engine.volumes.master; $('#im-master-out').textContent = Math.round(engine.volumes.master * 100) + '%';
    $('#btn-mute').classList.toggle('active', engine.muted); $('#im-mute').classList.toggle('active', engine.muted);
  }
  $('#set-anim').checked = settings.anim; $('#set-density').value = settings.density; $('#set-density-out').textContent = Math.round(settings.density * 100) + '%'; $('#set-resume').checked = settings.resume;
  $('#set-anim').addEventListener('change', (e) => { settings.anim = e.target.checked; visuals.setEnabled(settings.anim); save(); });
  $('#set-density').addEventListener('input', (e) => { settings.density = Number(e.target.value); $('#set-density-out').textContent = Math.round(settings.density * 100) + '%'; visuals.setDensity(settings.density); save(); });
  $('#set-resume').addEventListener('change', (e) => { settings.resume = e.target.checked; save(); });

  function renderLibraryInfo() {
    const own = library.sounds.filter((s) => s.synth).length;
    const files = library.sounds.filter((s) => !s.synth);
    const mb = files.reduce((a, s) => a + (s.bytes || 0), 0) / 1048576;
    const kinds = new Map(); for (const s of library.sounds) kinds.set(s.kind, (kinds.get(s.kind) || 0) + 1);
    const size = mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
    $('#lib-summary').innerHTML = `<b>${own}</b> eigen geluiden van Nebula, altijd beschikbaar en zonder bestanden.` +
      (files.length ? ` Daarnaast <b>${files.length}</b> opnames van gratis bronnen (${size})${library.generated ? ', bijgewerkt ' + new Date(library.generated).toLocaleString('nl-NL') : ''}.` : ' Nog geen opnames gedownload.') +
      `<br>${kinds.size} soorten: ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${esc(kindLabel(k))} ${c}`).join(' · ')}`;
    const actions = $('#lib-actions'); actions.innerHTML = '';
    if (desktop) {
      actions.innerHTML = `<button class="btn primary" id="lib-fetch-all">Alle ambient geluiden ophalen</button><button class="btn" id="lib-fetch-quick">Snelle selectie (±500 MB)</button><button class="btn ghost" id="lib-stop" disabled>Stop</button><button class="btn ghost" id="lib-open">Map openen</button><button class="btn ghost" id="lib-reload">Bibliotheek herladen</button>
        <p class="muted small" id="lib-dir" style="flex-basis:100%"></p>
        <button class="btn ghost" id="lib-choose">Bestaande bibliotheekmap gebruiken…</button><button class="btn ghost" id="lib-default" hidden>Terug naar standaardmap</button>`;
      $('#lib-fetch-all').addEventListener('click', () => runFetch('all'));
      $('#lib-fetch-quick').addEventListener('click', () => runFetch('quick'));
      $('#lib-stop').addEventListener('click', () => window.nebulaDesktop.stopFetch());
      $('#lib-open').addEventListener('click', () => window.nebulaDesktop.openFolder());
      $('#lib-reload').addEventListener('click', () => loadLibrary().then(() => toast('Bibliotheek herladen')));
      $('#lib-choose').addEventListener('click', async () => {
        const r = await window.nebulaDesktop.chooseFolder();
        if (r?.error) return toast(r.error);
        if (r?.canceled) return;
        await loadLibrary();
        toast(r.hasLib ? `Bibliotheek uit ${r.dir} geladen` : `Map gekozen: ${r.dir} (nog leeg, haal geluiden op)`);
      });
      $('#lib-default').addEventListener('click', async () => { await window.nebulaDesktop.resetFolder(); await loadLibrary(); toast('Standaardmap hersteld'); });
      window.nebulaDesktop.info().then((i) => { $('#lib-dir').textContent = `Map: ${i.dir}`; $('#lib-default').hidden = !!i.isDefault; }).catch(() => {});
    } else {
      actions.innerHTML = `<p class="muted small">Geluiden ophalen doe je in de projectmap met <code>npm run fetch</code> (snelle selectie) of <code>npm run fetch -- --all</code> (alles, standaard tot 8 GB). Herlaad daarna de pagina.</p><button class="btn ghost" id="lib-reload">Bibliotheek herladen</button>`;
      $('#lib-reload').addEventListener('click', () => loadLibrary().then(() => toast('Bibliotheek herladen')));
    }
    // Bronnen
    const src = new Map();
    for (const s of library.sounds) { const k = s.sourceName || s.source; if (!src.has(k)) src.set(k, { n: 0, lic: new Set() }); const e = src.get(k); e.n++; if (s.license) e.lic.add(s.license); }
    const sources = [
      ['Nebula', null, 'Eigen geluiden en muziek, live gemaakt in de app'],
      ['BBC Sound Effects', 'https://sound-effects.bbcrewind.co.uk/', 'RemArc-licentie: persoonlijk, educatief en niet-commercieel'],
      ['Internet Archive', 'https://archive.org/', 'Creative Commons (per opname vermeld)'],
      ['Internet Archive (netlabels)', 'https://archive.org/details/netlabels', 'Creative Commons (per album vermeld)'],
      ['Wikimedia Commons', 'https://commons.wikimedia.org/', 'Creative Commons / publiek domein (per bestand vermeld)'],
      ['Internet Archive (78 toeren)', 'https://archive.org/details/georgeblood', 'Great 78 Project: historische opnamen (jazz, kerst)'],
      ['Mixkit', 'https://mixkit.co/free-sound-effects/', 'Mixkit Sound Effects Free License'],
      ['Mixkit (muziek)', 'https://mixkit.co/free-stock-music/', 'Mixkit Stock Music Free License'],
      ['Freesound', 'https://freesound.org/', 'Creative Commons; alleen met API-sleutel (FREESOUND_KEY)'],
    ];
    $('#lib-sources').innerHTML = `<table class="src-table"><tr><th>Bron</th><th>Geluiden</th><th>Licentie</th></tr>${sources.map(([name, url, lic]) => `<tr><td>${url ? `<a href="${url}" target="_blank" rel="noopener">${name}</a>` : name}</td><td>${src.get(name)?.n || 0}</td><td>${lic}</td></tr>`).join('')}</table>`;
  }
  let fetching = false;
  async function runFetch(mode) {
    if (fetching) return;
    fetching = true;
    $('#lib-fetch-all').disabled = $('#lib-fetch-quick').disabled = true; $('#lib-stop').disabled = false;
    const log = $('#lib-log'); log.hidden = false; log.textContent = ''; const prog = $('#lib-progress'); prog.hidden = false;
    const unLog = window.nebulaDesktop.onLog((line) => { log.textContent += line + '\n'; if (log.textContent.length > 60000) log.textContent = log.textContent.slice(-40000); log.scrollTop = log.scrollHeight; });
    const unProg = window.nebulaDesktop.onProgress((p) => {
      const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      prog.querySelector('.bar').style.width = pct + '%';
      prog.querySelector('.label').textContent = p.phase === 'zoeken' ? `Bronnen doorzoeken… ${p.sourcesDone || 0}/${p.sourcesTotal || '?'} bronnen, ${p.found || 0} kandidaten` : p.phase === 'klaar' ? `Klaar: ${p.count} geluiden` : `${p.done}/${p.total} · ${p.count} geluiden · ${(p.bytes / 1048576 / 1024).toFixed(2)} GB`;
      if (p.phase === 'zoeken' && p.sourcesTotal) prog.querySelector('.bar').style.width = Math.round((p.sourcesDone || 0) / p.sourcesTotal * 15) + '%';
      if (p.added && p.added % 20 === 0) loadLibrary();
    });
    try {
      const r = await window.nebulaDesktop.fetchLibrary(mode);
      toast(r?.error ? `Ophalen gestopt: ${r.error}` : `Klaar: ${r.added} geluiden toegevoegd`);
    } catch (e) { toast('Ophalen mislukt: ' + e.message); }
    unLog(); unProg(); fetching = false;
    $('#lib-fetch-all').disabled = $('#lib-fetch-quick').disabled = false; $('#lib-stop').disabled = true;
    await loadLibrary();
  }

  // ---- Speler -------------------------------------------------------------------
  function updatePlayer() {
    const player = $('#player');
    const mains = engine.mainLayers(); const all = [...engine.layers.values()];
    let title = 'Niets geselecteerd', sub = 'Kies een sfeer om te beginnen', kind = null, seed = 3;
    if (activeMix && mains.length) { title = activeMix.title; sub = mains.map((l) => l.sound.title).join(' + '); kind = mains[0].sound.kind; seed = seedOf(mains[0].sound.id); }
    else if (mains.length) { const s = mains[0].sound; title = s.title; sub = kindLabel(s.kind) + (all.length > 1 ? ` · ${all.length} lagen` : ''); kind = s.kind; seed = seedOf(s.id); }
    else if (engine.radio.station) { title = engine.radio.station.name; sub = engine.radio.playing ? engine.radio.station.genre : 'Verbinden…'; kind = 'ruimte'; }
    else if (all.length) { title = all.length === 1 ? all[0].sound.title : `${all.length} lagen`; sub = all.map((l) => kindLabel(l.sound.kind)).filter((v, i, a) => a.indexOf(v) === i).join(', '); kind = all[0].sound.kind; seed = seedOf(all[0].sound.id); }
    else if (engine.noise.on) { title = 'Ruis'; sub = D.noiseColors.find((c) => c.id === engine.noise.color)?.label + 'e ruis'; kind = 'wind'; }
    if (engine.radio.station && mains.length) sub += ` · radio: ${engine.radio.station.name}`;
    if (engine.noise.on && (mains.length || all.length)) sub += ' · ruis';
    $('#player-title').textContent = title; $('#player-sub').textContent = sub;
    const th = $('#player-thumb'); th.innerHTML = kind ? art(kind, seed) : '';
    player.classList.toggle('playing', engine.playing && engine.hasContent());
    $('#immersive').classList.toggle('playing', engine.playing && engine.hasContent());
    $('#btn-play').setAttribute('aria-label', engine.playing ? 'Pauze' : 'Afspelen');
    $('#immersive-title').textContent = title; $('#immersive-sub').textContent = sub;
    updatePlayingMarks(); syncVolumeUI();
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title, artist: sub, album: 'Nebula' }); navigator.mediaSession.playbackState = engine.playing ? 'playing' : 'paused'; } catch {}
    }
  }
  function updatePlayingMarks() {
    const ids = new Set(engine.layers.keys());
    $$('.card[data-id]').forEach((c) => c.classList.toggle('playing', ids.has(c.dataset.id) || (activeMix && c.dataset.id === 'mix:' + activeMix.id && engine.mainLayers().length > 0)));
    $$('.strip[data-id]').forEach((c) => { const on = ids.has(c.dataset.id); c.classList.toggle('on', on); const cb = c.querySelector('input[type=checkbox]'); if (cb) cb.checked = on; });
    $$('.station[data-id]').forEach((c) => c.classList.toggle('playing', engine.radio.station?.id === c.dataset.id));
  }
  $('#btn-play').addEventListener('click', async () => {
    if (!engine.hasContent()) {
      if (settings.resume && settings.layers?.length) return restoreLast();
      const s = library.sounds.length ? rnd(library.sounds) : null;
      if (s) return playMain(s);
      return showPage(desktop ? 'settings' : 'home');
    }
    await engine.toggle(); updatePlayer();
  });
  $('#btn-shuffle').addEventListener('click', () => {
    const pool = library.sounds.filter((s) => !currentMood || (s.moods || []).includes(currentMood));
    const mains = new Set(engine.mainLayers().map((l) => l.sound.id));
    const cands = pool.filter((s) => !mains.has(s.id));
    if (cands.length) playMain(rnd(cands), currentMood);
  });
  $('#btn-mute').addEventListener('click', () => { engine.setMuted(!engine.muted); syncVolumeUI(); });
  $('#master').addEventListener('input', (e) => engine.setVolume('master', Number(e.target.value)));
  $('#master').addEventListener('change', save);
  $('#btn-mixer-pop').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#mixer-pop'); p.hidden = !p.hidden; if (!p.hidden) renderVolumeMixer(p); });
  document.addEventListener('click', (e) => { const p = $('#mixer-pop'); if (!p.hidden && !p.contains(e.target)) p.hidden = true; });
  $('#player-info').addEventListener('click', () => { if (engine.hasContent()) openImmersive(); });

  async function restoreLast() {
    engine.ensure();
    const layers = settings.layers || [];
    let first = null;
    for (const l of layers) { const s = byId.get(l.id); if (!s) continue; engine.playing = true; await engine.addLayer(s, { gain: l.gain, origin: l.origin || 'fx' }); if (!first && l.origin === 'main') first = s; }
    if (settings.noise?.on) engine.setNoise({ on: true });
    if (first) { setScene(first.kind); currentMood = (first.moods || [])[0]; }
    renderNoise(); updatePlayer();
  }

  // ---- Volledig scherm -------------------------------------------------------------
  let hideTimer;
  function openImmersive() {
    const im = $('#immersive'); im.hidden = false; im.classList.remove('hide-ui'); document.body.classList.add('immersive-on');
    const row = $('#immersive-row'); row.innerHTML = '';
    const pool = interleave(library.sounds.filter((s) => !currentMood || (s.moods || []).includes(currentMood))).slice(0, 20);
    for (const s of pool) { const c = soundCard(s); c.addEventListener('click', () => playMain(s, currentMood)); row.appendChild(c); }
    updatePlayingMarks();
    visuals.setBoost(1.8); // hier is de lucht het hele beeld, dus mag er flink meer in
    if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    scheduleHide();
  }
  function closeImmersive() { $('#immersive').hidden = true; document.body.classList.remove('immersive-on'); visuals.setBoost(1); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  function scheduleHide() { clearTimeout(hideTimer); $('#immersive').classList.remove('hide-ui'); hideTimer = setTimeout(() => $('#immersive').classList.add('hide-ui'), 4000); }
  $('#btn-immersive').addEventListener('click', openImmersive);
  $('#immersive-close').addEventListener('click', closeImmersive);
  $('#im-play').addEventListener('click', () => $('#btn-play').click());
  $('#im-shuffle').addEventListener('click', () => $('#btn-shuffle').click());
  $('#im-mute').addEventListener('click', () => $('#btn-mute').click());
  $('#im-master').addEventListener('input', (e) => { engine.setVolume('master', Number(e.target.value)); scheduleHide(); });
  $('#im-master').addEventListener('change', save);
  $('#immersive').addEventListener('mousemove', scheduleHide);
  $('#immersive').addEventListener('touchstart', scheduleHide, { passive: true });
  $('#immersive').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeImmersive(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !$('#immersive').hidden) closeImmersive(); });

  // ---- Sneltoetsen --------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.key !== 'Escape') return;
    if (e.key === ' ') { e.preventDefault(); $('#btn-play').click(); }
    else if (e.key === 'f' || e.key === 'F') { $('#immersive').hidden ? openImmersive() : closeImmersive(); }
    else if (e.key === 'm' || e.key === 'M') $('#btn-mute').click();
    else if (e.key === 's' || e.key === 'S') $('#btn-shuffle').click();
    else if (e.key === 'Escape') { closeImmersive(); $('#mixer-pop').hidden = true; }
    else if (e.key === 'ArrowUp') { engine.setVolume('master', engine.volumes.master + 0.05); syncVolumeUI(); save(); }
    else if (e.key === 'ArrowDown') { engine.setVolume('master', engine.volumes.master - 0.05); syncVolumeUI(); save(); }
  });

  // ---- Engine-events ------------------------------------------------------------
  engine.on((type, data) => {
    if (type === 'state' || type === 'layers' || type === 'radio' || type === 'noise') updatePlayer();
    if (type === 'layers') { if (settings.mixerKind === 'actief') renderMixerGroups(); }
    if (type === 'radio-error') toast(`Zender ${data.name} is niet bereikbaar`);
    if (type === 'layer-error') { toast(`Kan ${data.title} niet afspelen`); engine.removeLayer(data.id); }
    if (type === 'volumes') syncVolumeUI();
  });
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { engine.play(); });
      navigator.mediaSession.setActionHandler('pause', () => { engine.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => $('#btn-shuffle').click());
    } catch {}
  }

  // ---- Sonos --------------------------------------------------------------------------
  // Nebula wordt een radiozender op je netwerk; de speakers halen de audio zelf op.
  const stream = new window.NebulaStream(engine);
  const sonos = { groups: [], playing: new Set(), busy: false, error: null, loaded: false };
  const sonosBtn = $('#btn-sonos'), sonosPop = $('#sonos-pop');
  if (desktop && window.nebulaDesktop.sonos) sonosBtn.hidden = false;

  async function loadSonos(force) {
    if (sonos.busy) return;
    sonos.busy = true; renderSonos();
    const r = await window.nebulaDesktop.sonos.list();
    sonos.groups = r.groups || []; sonos.error = r.error || null; sonos.loaded = true; sonos.busy = false;
    // Van elke groep opvragen of hij onze zender al speelt (bijvoorbeeld na herstart van de app).
    await Promise.all(sonos.groups.map(async (g) => {
      const s = await window.nebulaDesktop.sonos.status(g.host);
      g.volume = s.volume ?? 30;
      if (s.ours && s.state === 'PLAYING') sonos.playing.add(g.host); else sonos.playing.delete(g.host);
    }));
    if (sonos.playing.size && !stream.active) await stream.start();
    renderSonos(); updateSonosButton();
  }
  function updateSonosButton() {
    sonosBtn.classList.toggle('live', sonos.playing.size > 0);
    sonosBtn.title = sonos.playing.size ? `Speelt op ${sonos.playing.size} groep(en)` : 'Naar Sonos-speakers';
  }
  function renderSonos() {
    if (sonosPop.hidden) return;
    const rooms = sonos.groups.map((g) => {
      const on = sonos.playing.has(g.host);
      return `<div class="sonos-room${on ? ' on' : ''}" data-host="${esc(g.host)}">
        <div><div class="n">${esc(g.name)}</div><div class="s">${esc(g.model || 'Sonos')}${on ? ' · speelt Nebula' : ''}</div></div>
        <label class="switch small"><input type="checkbox" ${on ? 'checked' : ''}><span class="track"></span></label>
        ${on ? `<div class="vol"><input type="range" min="0" max="100" step="1" value="${g.volume ?? 30}" aria-label="Volume ${esc(g.name)}"><output>${g.volume ?? 30}</output></div>` : ''}
      </div>`;
    }).join('');
    sonosPop.innerHTML = `<h3>Sonos</h3>
      <div class="hint">${sonos.busy ? 'Zoeken op je netwerk…' : sonos.error ? esc(sonos.error) : sonos.groups.length ? 'Zet een kamer aan; die speelt dan precies wat je hier hoort.' : sonos.loaded ? 'Geen speakers gevonden. Staat de app op hetzelfde netwerk?' : ''}</div>
      ${rooms}
      <div class="foot"><button class="btn ghost" id="sonos-refresh">Opnieuw zoeken</button><span class="status" id="sonos-status"></span></div>`;
    $('#sonos-refresh').addEventListener('click', () => loadSonos(true));
    $$('.sonos-room', sonosPop).forEach((el) => {
      const host = el.dataset.host;
      el.querySelector('input[type=checkbox]').addEventListener('change', (e) => toggleSonos(host, e.target.checked));
      const vol = el.querySelector('input[type=range]');
      if (vol) vol.addEventListener('input', () => { vol.nextElementSibling.textContent = vol.value; const g = sonos.groups.find((x) => x.host === host); if (g) g.volume = Number(vol.value); window.nebulaDesktop.sonos.volume(host, Number(vol.value)); });
    });
    updateSonosStatus();
  }
  async function updateSonosStatus() {
    const el = $('#sonos-status'); if (!el) return;
    if (!stream.active) { el.textContent = ''; return; }
    const info = await window.nebulaDesktop.sonos.info();
    el.textContent = `Zendt uit op ${info.localIp}:${info.streamPort} · ${info.listeners} luisteraar${info.listeners === 1 ? '' : 's'}`;
  }
  async function toggleSonos(host, aan) {
    if (aan) {
      if (!stream.active && !(await stream.start())) return toast('Uitzenden lukt niet op deze computer');
      if (!engine.playing && engine.hasContent()) await engine.play();
      const r = await window.nebulaDesktop.sonos.play(host);
      if (r.error) { toast(`Sonos: ${r.error}`); return renderSonos(); }
      sonos.playing.add(host);
      toast('Speelt nu ook op je Sonos');
    } else {
      await window.nebulaDesktop.sonos.stop(host);
      sonos.playing.delete(host);
      if (!sonos.playing.size) stream.stop();
    }
    renderSonos(); updateSonosButton();
  }
  sonosBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sonosPop.hidden = !sonosPop.hidden;
    if (!sonosPop.hidden) { renderSonos(); if (!sonos.loaded) loadSonos(); }
  });
  document.addEventListener('click', (e) => { if (!sonosPop.hidden && !sonosPop.contains(e.target) && e.target !== sonosBtn) sonosPop.hidden = true; });
  stream.on((type, data) => {
    if (type === 'error') toast('Uitzenden: ' + data);
    if (type === 'stats') updateSonosStatus();
    if (type === 'state') updateSonosButton();
  });

  // Versienummer tonen in Instellingen (komt van de ingebouwde server, dus ook in de browser).
  fetch('version.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((v) => { if (v.version) $('#app-version').textContent = 'versie ' + v.version; })
    .catch(() => { $('#app-version').textContent = ''; });

  // Bijwerken. De app haalt een nieuwe versie zelf op de achtergrond op en installeert die bij het
  // afsluiten; de balk hieronder is er alleen voor wie niet wil wachten. Nooit iets onderbreken:
  // je bent aan het luisteren.
  if (window.nebulaDesktop?.onUpdate) {
    window.nebulaDesktop.onUpdate(({ staat, versie }) => {
      if (staat === 'gevonden') return toast(`Versie ${versie} wordt op de achtergrond opgehaald`);
      if (staat !== 'klaar') return;
      const balk = $('#update-bar');
      $('#update-tekst').textContent = `Versie ${versie} staat klaar. Hij wordt geïnstalleerd zodra je Nebula afsluit.`;
      balk.hidden = false;
    });
    $('#update-nu').addEventListener('click', () => window.nebulaDesktop.installUpdate());
    $('#update-later').addEventListener('click', () => { $('#update-bar').hidden = true; });
  }

  window.nebula = { engine, visuals, get library() { return library; } }; // voor debuggen

  // ---- Start ------------------------------------------------------------------------
  renderNoise(); renderRadio(); renderTimerPresets(); renderVolumeMixer($('#settings-mixer')); syncVolumeUI();
  showPage(settings.page && $(`.page[data-page="${settings.page}"]`) ? settings.page : 'home');
  loadLibrary().then(() => {
    if (settings.resume && settings.layers?.length) {
      const first = settings.layers.find((l) => l.origin === 'main') || settings.layers[0];
      const s = first && byId.get(first.id);
      if (s) { setScene(s.kind); $('#player-title').textContent = s.title; $('#player-sub').textContent = 'Druk op afspelen om verder te gaan'; $('#player-thumb').innerHTML = art(s.kind, seedOf(s.id)); return; }
    }
    // Nog niets gekozen: open in een van de rustige nachtelijke sferen, zodat het beginscherm ook
    // kleur en beweging heeft in plaats van een vlakke donkere achtergrond.
    setScene(['nacht', 'ruimte', 'zee', 'gregoriaans'][Math.floor(Math.random() * 4)]);
  });
})();
