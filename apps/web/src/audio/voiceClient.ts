import type { TriageAnswer } from "../../../../server/src/types/triage";
import type { ClientMessage, Lang, ServerMessage } from "../../../../server/src/types/voice";
import { Downsampler, floatToInt16, FrameBuffer, PcmDecoder } from "./pcm";

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 512; // 1024 bytes, the frame size Prisma requires
const ECHO_TAIL_MS = 250;

/** Queues streamed speech gaplessly and can stop it instantly for barge-in. */
class PcmPlayer {
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private decoder = new PcmDecoder();

  constructor(private readonly context: AudioContext) {}

  reset() {
    this.decoder = new PcmDecoder();
  }

  enqueue(base64: string, sampleRate: number) {
    const samples = this.decoder.decode(base64);
    if (!samples.length) return;
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.nextTime, this.context.currentTime + 0.03);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  stop() {
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.nextTime = 0;
  }

  get isPlaying() {
    return this.context.currentTime * 1000 < this.nextTime * 1000 + ECHO_TAIL_MS;
  }
}

export interface VoiceClientOptions {
  lang: Lang;
  echo: boolean;
  /** When true the mic stays live during playback so the user can interrupt; needs headphones for now. */
  bargeIn: boolean;
  onMessage(message: ServerMessage): void;
  onInputLevel(level: number): void;
  onClosed(): void;
}

export class VoiceClient {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private player: PcmPlayer;
  private activeTtsId = 0;
  private ttsRate = 24000;
  private activatedAt: number | null = null;

  /** `context` must be created and resumed inside a tap handler so iOS allows audio playback. */
  constructor(private readonly context: AudioContext, private readonly options: VoiceClientOptions) {
    this.player = new PcmPlayer(context);
  }

  /** Opens the session first, so Ayu can still speak if the microphone is refused. */
  async start(session?: { caseId: string; activatedAt: number }) {
    this.activatedAt = session?.activatedAt ?? null;
    const socket = new WebSocket(this.socketUrl(session?.caseId ?? crypto.randomUUID()));
    this.socket = socket;

    socket.onopen = () => this.send({ type: "start", lang: this.options.lang, echo: this.options.echo });
    socket.onmessage = (event) => this.handleMessage(JSON.parse(event.data) as ServerMessage);
    socket.onclose = () => {
      this.releaseAudio();
      this.options.onClosed();
    };

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await this.startCapture(socket, this.stream);
  }

  say(text: string) {
    this.send({ type: "say", text });
  }

  commit() {
    this.send({ type: "commit" });
  }

  answer(answer: TriageAnswer) {
    this.send({ type: "triage_answer", answer });
  }

  stop() {
    this.socket?.close();
    this.releaseAudio();
  }

  private socketUrl(sessionId: string) {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/ws/voice/${sessionId}`;
  }

  private async startCapture(socket: WebSocket, stream: MediaStream) {
    const { context } = this;
    await context.audioWorklet.addModule("/pcm-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "pcm-capture");
    const downsampler = new Downsampler(context.sampleRate, TARGET_RATE);
    const frames = new FrameBuffer(FRAME_SAMPLES, (frame) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (!this.options.bargeIn && this.player.isPlaying) return;
      socket.send(frame.buffer as ArrayBuffer);
    });
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const samples = downsampler.process(event.data);
      frames.push(floatToInt16(samples));
      const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
      this.options.onInputLevel(peak);
    };
    source.connect(worklet);
  }

  private interrupt() {
    this.activeTtsId = 0;
    this.player.stop();
    this.send({ type: "stop_speaking" });
  }

  private handleMessage(message: ServerMessage) {
    switch (message.type) {
      case "speech.start":
        if (this.options.bargeIn && this.player.isPlaying) this.interrupt();
        break;
      case "tts.stop":
        this.activeTtsId = 0;
        this.player.stop();
        return;
      case "tts.start":
        this.player.stop();
        this.player.reset();
        this.activeTtsId = message.ttsId;
        this.ttsRate = message.sampleRate;
        break;
      case "tts.audio":
        if (message.ttsId !== this.activeTtsId) return;
        this.player.enqueue(message.data, this.ttsRate);
        if (this.activatedAt !== null) {
          this.send({ type: "first_audio", ms: performance.now() - this.activatedAt });
          this.activatedAt = null;
        }
        return;
    }
    this.options.onMessage(message);
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private releaseAudio() {
    this.player.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context.state !== "closed") void this.context.close().catch(() => undefined);
  }
}

/** Call synchronously from a tap handler. */
export function unlockAudio() {
  const context = new AudioContext();
  void context.resume();
  return context;
}
