import type { TriageAnswer } from "../../../../server/src/types/triage";
import type { ClientMessage, Lang, ServerMessage } from "../../../../server/src/types/voice";
import { BargeGate, Downsampler, floatToInt16, FrameBuffer, PcmDecoder } from "./pcm";

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 512; // 1024 bytes, the frame size Prisma requires
const ECHO_TAIL_MS = 250;
const MAX_RECONNECTS = 5;
const CLOSE_POLICY = 1008;
const CLOSE_CASE_ENDED = 4001;
// Sustained loud speech over about 160 ms. Ayu's own voice through the speaker, after echo
// cancellation, should stay below this; tune on real phones.
const BARGE_RMS = 0.06;
const BARGE_FRAMES = 5;

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

export interface VoiceSession {
  caseId: string;
  activatedAt: number;
  /** Set when the opening already played from the phone's copy, so the server continues after it. */
  localOpening?: { startedAfterMs: number; finished: Promise<void> };
  /** Microphone requested earlier. Starting it on iOS reconfigures audio and can cut off playback. */
  mic?: Promise<MediaStream>;
  /** False where a lost connection should simply end the session. */
  reconnect?: boolean;
}

export function requestMic() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export interface VoiceClientOptions {
  lang: Lang;
  echo: boolean;
  /** When true the caller can talk over Ayu, except during protocol steps marked uninterruptible. */
  bargeIn: boolean;
  onMessage(message: ServerMessage): void;
  onInputLevel(level: number): void;
  onReconnecting(active: boolean): void;
  onClosed(): void;
}

export class VoiceClient {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private player: PcmPlayer;
  private gate = new BargeGate(BARGE_RMS, BARGE_FRAMES);
  private activeTtsId = 0;
  private lineInterruptible = true;
  private ttsRate = 24000;
  private activatedAt: number | null = null;
  private closing = false;
  private reconnects = 0;

  /** `context` must be created and resumed inside a tap handler so iOS allows audio playback. */
  constructor(private readonly context: AudioContext, private readonly options: VoiceClientOptions) {
    this.player = new PcmPlayer(context);
  }

  /** Opens the session first, so Ayu can still speak if the microphone is refused. */
  async start(session?: VoiceSession) {
    this.activatedAt = session?.localOpening ? null : session?.activatedAt ?? null;
    this.connect(session);
    this.stream = await (session?.mic ?? requestMic());
    await this.startCapture(this.stream);
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

  control(message: ClientMessage) {
    this.send(message);
  }

  stop() {
    this.closing = true;
    this.socket?.close();
    this.releaseAudio();
  }

  private connect(session?: VoiceSession) {
    const socket = new WebSocket(this.socketUrl(session?.caseId ?? crypto.randomUUID()));
    this.socket = socket;

    socket.onopen = async () => {
      this.reconnects = 0;
      this.options.onReconnecting(false);
      const opening = session?.localOpening;
      if (opening) {
        this.send({ type: "first_audio", ms: opening.startedAfterMs });
        await opening.finished;
      }
      this.send({ type: "start", lang: this.options.lang, echo: this.options.echo, openingPlayed: Boolean(opening) });
      if (session) session.localOpening = undefined;
    };
    socket.onmessage = (event) => this.handleMessage(JSON.parse(event.data) as ServerMessage);
    socket.onclose = (event) => {
      const final = event.code === CLOSE_POLICY || event.code === CLOSE_CASE_ENDED;
      if (this.closing || final || !session || session.reconnect === false || this.reconnects >= MAX_RECONNECTS) {
        this.releaseAudio();
        this.options.onClosed();
        return;
      }
      // An emergency call must survive a network blip, so retry before giving up.
      this.reconnects++;
      this.options.onReconnecting(true);
      setTimeout(() => {
        if (!this.closing) this.connect(session);
      }, this.reconnects * 1000);
    };
  }

  private socketUrl(sessionId: string) {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}/ws/voice/${sessionId}`;
  }

  private sendFrame(frame: Int16Array) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame.buffer as ArrayBuffer);
  }

  private onMicFrame(frame: Int16Array) {
    if (!this.player.isPlaying) {
      this.gate.reset();
      this.sendFrame(frame);
      return;
    }
    if (!this.options.bargeIn || !this.lineInterruptible) return;
    const held = this.gate.push(frame);
    if (!held) return;
    this.interrupt();
    held.forEach((item) => this.sendFrame(item));
  }

  private async startCapture(stream: MediaStream) {
    const { context } = this;
    await context.audioWorklet.addModule("/pcm-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, "pcm-capture");
    const downsampler = new Downsampler(context.sampleRate, TARGET_RATE);
    const frames = new FrameBuffer(FRAME_SAMPLES, (frame) => this.onMicFrame(frame));
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
      case "tts.stop":
        this.activeTtsId = 0;
        this.player.stop();
        return;
      case "tts.start":
        // Lines queue rather than replace each other, so a late arrival never clips the one playing.
        this.player.reset();
        this.activeTtsId = message.ttsId;
        this.ttsRate = message.sampleRate;
        this.lineInterruptible = message.interruptible;
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

const LOCAL_AUDIO_RATE = 24000;

/** Downloads a pre-generated line ahead of time. Failure is fine: the server then speaks it instead. */
export async function fetchLocalLine(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    // A missing file comes back as the app's HTML page, which must never be played as audio.
    const isHtml = response.headers.get("content-type")?.includes("text/html");
    return response.ok && !isHtml ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Plays a downloaded line and resolves when it ends. */
export function playLocalLine(context: AudioContext, pcm: ArrayBuffer) {
  const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const buffer = context.createBuffer(1, samples.length, LOCAL_AUDIO_RATE);
  buffer.copyToChannel(Float32Array.from(samples, (sample) => sample / 0x8000), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const finished = new Promise<void>((resolve) => {
    source.onended = () => resolve();
  });
  source.start();
  return finished;
}

/** Call synchronously from a tap handler. */
export function unlockAudio() {
  const context = new AudioContext();
  void context.resume();
  return context;
}
