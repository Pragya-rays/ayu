const WINDOW_MS = 10;
const FLOOR_OF_PEAK = 0.03;
const KEEP_BEFORE_MS = 30;
const KEEP_AFTER_MS = 60; // leaves room for a word to fade out naturally

/**
 * Timbre leaves about 0.1 s of silence before a line and 0.2 s after it. In an emergency that is
 * dead air on every line, and it also holds the mic closed after Ayu has finished speaking.
 */
export function trimSilence(pcm: Buffer, sampleRate: number) {
  const sampleCount = Math.floor(pcm.length / 2);
  const windowSize = Math.round((sampleRate * WINDOW_MS) / 1000);
  const levels: number[] = [];
  for (let start = 0; start + windowSize <= sampleCount; start += windowSize) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) sum += (pcm.readInt16LE(i * 2) / 0x8000) ** 2;
    levels.push(Math.sqrt(sum / windowSize));
  }
  const floor = Math.max(0, ...levels) * FLOOR_OF_PEAK;
  const first = levels.findIndex((level) => level > floor);
  const last = levels.findLastIndex((level) => level > floor);
  if (first === -1) return pcm;

  const from = Math.max(0, first * windowSize - Math.round((sampleRate * KEEP_BEFORE_MS) / 1000));
  const to = Math.min(sampleCount, (last + 1) * windowSize + Math.round((sampleRate * KEEP_AFTER_MS) / 1000));
  return pcm.subarray(from * 2, to * 2);
}
