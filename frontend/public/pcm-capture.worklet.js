// Capture runs on the audio thread; output stays silent to avoid local loopback.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = false; this.samples = [];
    this.port.onmessage = ({ data }) => {
      if (data === 'start') { this.samples = []; this.active = true; }
      if (data === 'stop') { this.active = false; this.samples = []; }
      if (data === 'finish') {
        this.active = false; this.flush(); this.port.postMessage({ finished: true });
      }
    };
  }
  flush() {
    if (this.samples.length) this.port.postMessage({ samples: new Float32Array(this.samples) });
    this.samples = [];
  }
  process(inputs) {
    if (this.active && inputs[0]?.[0]) {
      for (const value of inputs[0][0]) this.samples.push(value);
      if (this.samples.length >= 1600) this.flush();
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
