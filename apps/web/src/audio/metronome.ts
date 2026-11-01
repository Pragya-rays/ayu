export const BEATS_PER_MINUTE = 110; // inside the 100-120 target; the rate used by Hwang et al. 2020
const CLICK_SECONDS = 0.03;
const CLICK_HZ = 1000;
const VOLUME = 0.25;

/** One beat: a short click, then silence, so looping it keeps exact time with no timers. */
export function beatSamples(sampleRate: number) {
  const samples = new Float32Array(Math.round((sampleRate * 60) / BEATS_PER_MINUTE));
  const clickLength = Math.round(sampleRate * CLICK_SECONDS);
  for (let i = 0; i < clickLength; i++) {
    samples[i] = Math.sin((2 * Math.PI * CLICK_HZ * i) / sampleRate) * Math.exp((-6 * i) / clickLength) * VOLUME;
  }
  return samples;
}

/** Runs on the phone alone, so the beat survives a lost connection. Returns a stop function. */
export function startMetronome(context: AudioContext) {
  const samples = beatSamples(context.sampleRate);
  const buffer = context.createBuffer(1, samples.length, context.sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(context.destination);
  source.start();
  return () => {
    source.stop();
    source.disconnect();
  };
}
