/** Stateful downsampler (box average) from the device rate to the target rate. */
export class Downsampler {
  private position = 0;
  private sum = 0;
  private count = 0;
  private readonly ratio: number;

  constructor(inputRate: number, outputRate: number) {
    this.ratio = inputRate / outputRate;
  }

  process(input: Float32Array): Float32Array {
    const output = new Float32Array(Math.ceil(input.length / this.ratio) + 1);
    let written = 0;
    for (const sample of input) {
      this.sum += sample;
      this.count++;
      this.position++;
      if (this.position >= this.ratio) {
        output[written++] = this.sum / this.count;
        this.position -= this.ratio;
        this.sum = 0;
        this.count = 0;
      }
    }
    return output.subarray(0, written);
  }
}

export function floatToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  input.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    output[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  });
  return output;
}

/** Collects samples and emits exact fixed-size frames. */
export class FrameBuffer {
  private readonly buffer: Int16Array;
  private filled = 0;

  constructor(frameSamples: number, private readonly onFrame: (frame: Int16Array) => void) {
    this.buffer = new Int16Array(frameSamples);
  }

  push(samples: Int16Array) {
    let offset = 0;
    while (offset < samples.length) {
      const take = Math.min(samples.length - offset, this.buffer.length - this.filled);
      this.buffer.set(samples.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.buffer.length) {
        this.onFrame(this.buffer.slice());
        this.filled = 0;
      }
    }
  }
}

/**
 * Decides when mic input during playback is the caller rather than Ayu's own echo: it needs
 * several loud frames in a row. Returns those frames when triggered so their speech is not lost.
 */
export class BargeGate {
  private held: Int16Array[] = [];

  constructor(private readonly threshold: number, private readonly requiredFrames: number) {}

  push(frame: Int16Array): Int16Array[] | null {
    if (rms(frame) < this.threshold) {
      this.held = [];
      return null;
    }
    this.held.push(frame);
    if (this.held.length < this.requiredFrames) return null;
    const triggered = this.held;
    this.held = [];
    return triggered;
  }

  reset() {
    this.held = [];
  }
}

function rms(frame: Int16Array) {
  let sum = 0;
  for (const sample of frame) sum += (sample / 0x8000) ** 2;
  return Math.sqrt(sum / frame.length);
}

/** Decodes base64 s16le PCM to floats. A chunk may split a sample, so keep any odd trailing byte. */
export class PcmDecoder {
  private carry: number | null = null;

  decode(base64: string): Float32Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes: number[] = this.carry === null ? [] : [this.carry];
    for (let i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i));
    this.carry = bytes.length % 2 ? bytes.pop()! : null;
    const output = new Float32Array(bytes.length / 2);
    for (let i = 0; i < output.length; i++) {
      const value = bytes[i * 2]! | (bytes[i * 2 + 1]! << 8);
      output[i] = (value >= 0x8000 ? value - 0x10000 : value) / 0x8000;
    }
    return output;
  }
}
