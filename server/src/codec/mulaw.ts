// G.711 µ-law: 8 bits per sample instead of 16, the scale phone networks use for speech.
// Shared by the phone and the server, so both ends always agree.
const BIAS = 0x84;
const CLIP = 32635;

export function encodeSample(sample: number) {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (magnitude & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

const DECODE = new Int16Array(256).map((_, byte) => {
  const value = ~byte & 0xff;
  const exponent = (value >> 4) & 0x07;
  const magnitude = ((((value & 0x0f) << 3) + BIAS) << exponent) - BIAS;
  return value & 0x80 ? -magnitude : magnitude;
});

export function encode(samples: Int16Array) {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = encodeSample(samples[i]!);
  return out;
}

export function decode(bytes: Uint8Array) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = DECODE[bytes[i]!]!;
  return out;
}

/** Binary TTS frame: 4-byte little-endian line id, then µ-law samples. */
export const AUDIO_HEADER_BYTES = 4;
