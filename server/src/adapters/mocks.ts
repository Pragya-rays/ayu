import type { STTAdapter, SttEvents, SttSession, TTSAdapter, TtsEvents, TtsHandle } from "./types.js";

// Development stand-ins so UI work spends no credits. The UI shows a MOCK badge whenever these run.
const MOCK_LINES = [
  "[mock] mere papa gir gaye hain, Gomti Nagar petrol pump ke paas",
  "[mock] haan saans le rahe hain",
  "[mock] nahi, jawab nahi de rahe",
];
const SPEECH_RMS = 0.01;
const SILENT_FRAMES_TO_END = 25; // about 800 ms of 32 ms frames

function rms(pcm: Buffer): number {
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i++) {
    const sample = pcm.readInt16LE(i * 2) / 32768;
    sum += sample * sample;
  }
  return samples ? Math.sqrt(sum / samples) : 0;
}

export class MockPrisma implements STTAdapter {
  private lineIndex = 0;

  open(_options: unknown, events: SttEvents): SttSession {
    const ready = setTimeout(() => events.onReady(), 10);
    let speaking = false;
    let silentFrames = 0;

    const endUtterance = () => {
      if (!speaking) return;
      speaking = false;
      events.onProcessing();
      const text = MOCK_LINES[this.lineIndex++ % MOCK_LINES.length]!;
      setTimeout(() => events.onTranscript({ text, latencyMs: 50 }), 50);
    };

    return {
      sendAudio(pcm) {
        if (rms(pcm) >= SPEECH_RMS) {
          silentFrames = 0;
          if (!speaking) {
            speaking = true;
            events.onSpeechStart();
          }
        } else if (speaking && ++silentFrames >= SILENT_FRAMES_TO_END) {
          endUtterance();
        }
      },
      commit: endUtterance,
      close() {
        clearTimeout(ready);
        events.onClose();
      },
    };
  }
}

export class MockTimbre implements TTSAdapter {
  readonly sampleRate = 24000;

  synthesize({ text }: { text: string }, events: TtsEvents): TtsHandle {
    const chunkMs = 100;
    const totalChunks = Math.max(3, Math.min(30, Math.ceil(text.length / 4)));
    let sent = 0;
    let phase = 0;

    const timer = setInterval(() => {
      const samples = (this.sampleRate * chunkMs) / 1000;
      const pcm = Buffer.alloc(samples * 2);
      for (let i = 0; i < samples; i++) {
        pcm.writeInt16LE(Math.round(Math.sin(phase) * 6000), i * 2);
        phase += (2 * Math.PI * 220) / this.sampleRate;
      }
      events.onAudio(pcm.toString("base64"));
      if (++sent >= totalChunks) {
        clearInterval(timer);
        events.onEnd();
      }
    }, chunkMs / 2);

    return { cancel: () => clearInterval(timer) };
  }
}
