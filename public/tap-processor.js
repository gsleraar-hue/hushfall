// AudioWorklet: leest de gemengde audio mee en stuurt die in blokken naar de MP3-worker.
// Dit loopt op de audiothread, dus het opnemen hapert niet als de UI even druk is.
class TapProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = (options && options.processorOptions && options.processorOptions.blockSize) || 4096;
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.filled = 0;
    this.on = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.on = false; };
  }
  process(inputs) {
    const input = inputs[0];
    if (!this.on) return false; // processor mag opgeruimd worden
    if (!input || !input.length) return true;
    const l = input[0], r = input.length > 1 ? input[1] : input[0];
    for (let i = 0; i < l.length; i++) {
      this.left[this.filled] = l[i];
      this.right[this.filled] = r[i];
      this.filled++;
      if (this.filled === this.size) {
        this.port.postMessage({ left: this.left.slice(0), right: this.right.slice(0) });
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('thrum-tap', TapProcessor);
