// AudioWorklet: taps the mixed audio and sends it to the MP3 worker in blocks.
// This runs on the audio thread, so recording does not stutter when the UI gets busy.
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
    if (!this.on) return false; // the processor may be cleaned up
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
registerProcessor('hushfall-tap', TapProcessor);
