// Zet de audio van Thrum in een aparte thread om naar MP3 en stuurt die naar de eigen server,
// die het als radiozender aanbiedt aan Sonos. Zo blijft de UI en de audio zelf vloeiend lopen.
/* global lamejs */
importScripts('lib/lame.min.js');

const FRAME = 1152; // aantal samples per MP3-frame
let enc = null;
let left = new Int16Array(0), right = new Int16Array(0);
let pending = [];        // gecodeerde stukjes die nog verstuurd moeten worden
let bytesSent = 0, sending = false, stopped = false, pushUrl = '/stream/push';

const f2i = (f) => { const n = f.length, out = new Int16Array(n); for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, f[i])); out[i] = v < 0 ? v * 32768 : v * 32767; } return out; };
const concat = (a, b) => { const out = new Int16Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

/** Verstuurt wat er klaarstaat in één POST; bij een fout houdt hij het even vast en probeert opnieuw. */
async function flushToServer() {
  if (sending || !pending.length || stopped) return;
  sending = true;
  const blob = new Blob(pending, { type: 'audio/mpeg' });
  pending = [];
  try {
    await fetch(pushUrl, { method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: blob });
    bytesSent += blob.size;
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message || e) });
  }
  sending = false;
  if (pending.length) flushToServer();
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') {
    enc = new lamejs.Mp3Encoder(2, m.sampleRate, m.bitrate || 128);
    left = new Int16Array(0); right = new Int16Array(0); pending = []; bytesSent = 0; stopped = false;
    pushUrl = m.pushUrl || '/stream/push';
    self.postMessage({ type: 'started', sampleRate: m.sampleRate });
    return;
  }
  if (m.type === 'pcm' && enc) {
    left = concat(left, f2i(m.left));
    right = concat(right, f2i(m.right));
    while (left.length >= FRAME) {
      const buf = enc.encodeBuffer(left.subarray(0, FRAME), right.subarray(0, FRAME));
      left = left.slice(FRAME); right = right.slice(FRAME);
      if (buf.length) pending.push(new Uint8Array(buf));
    }
    if (pending.length >= 4) flushToServer(); // ongeveer 5 keer per seconde versturen
    return;
  }
  if (m.type === 'stop' && enc) {
    const tail = enc.flush();
    if (tail.length) pending.push(new Uint8Array(tail));
    flushToServer().then(() => { stopped = true; self.postMessage({ type: 'stopped', bytesSent }); });
    enc = null;
    return;
  }
  if (m.type === 'stats') self.postMessage({ type: 'stats', bytesSent, queued: pending.length });
};
