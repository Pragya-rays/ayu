import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { LLMAdapter } from "../adapters/llm.js";
import type { STTAdapter, SttSession, TTSAdapter, TtsHandle } from "../adapters/types.js";
import type { AddressLookup } from "../cases/addresses.js";
import type { CaseStore } from "../cases/store.js";
import { SosMachine, type SosIo } from "../dialogue/sosMachine.js";
import type { Protocol } from "../protocols/index.js";
import type { ProtocolId } from "../types/triage.js";
import type { ClientMessage, Lang, ServerMessage } from "../types/voice.js";

export interface VoiceGatewayDeps {
  stt: STTAdapter;
  tts: TTSAdapter;
  llm: LLMAdapter;
  protocols: Map<ProtocolId, Protocol>;
  cases: CaseStore;
  addresses: AddressLookup;
  voiceMode: "real" | "mock";
  voiceLab: boolean;
  limits: {
    maxSessions: number;
    sessionMaxSeconds: number;
    /** An emergency must outlast any ETA, so SOS gets a longer limit than Voice Check. */
    sosSessionMaxSeconds: number;
    maxTtsChars: number;
    /** Reopen Prisma before its 15-minute cap ends the session. */
    sttRotateSeconds: number;
  };
}

const CLOSE_POLICY = 1008;
const CLOSE_TRY_LATER = 1013;
export const CLOSE_CASE_ENDED = 4001;
const PLAYBACK_MARGIN_MS = 150;
const STT_REOPEN_DELAY_MS = 500;
const MAX_STT_REOPENS = 5;

export function registerVoiceGateway(app: FastifyInstance, deps: VoiceGatewayDeps) {
  let activeSessions = 0;
  // Machines outlive sockets, so a phone that reconnects carries on where it left off.
  const machines = new Map<string, SosMachine>();

  deps.cases.subscribe((updated) => {
    const machine = machines.get(updated.id);
    if (!machine) return;
    if (updated.closedAt) {
      machine.stop();
      machines.delete(updated.id);
    } else {
      void machine.onCaseChanged(updated);
    }
  });

  app.get<{ Params: { sessionId: string } }>("/ws/voice/:sessionId", { websocket: true }, (socket: WebSocket, request) => {
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    const { sessionId } = request.params;
    const sosCase = deps.cases.get(sessionId);
    if ((!sosCase && !deps.voiceLab) || sosCase?.closedAt) {
      send({ type: "error", code: "not_allowed", message: "No active case for this session", fatal: true });
      socket.close(CLOSE_POLICY);
      return;
    }

    if (activeSessions >= deps.limits.maxSessions) {
      send({ type: "error", code: "busy", message: "Too many active voice sessions", fatal: true });
      socket.close(CLOSE_TRY_LATER);
      return;
    }
    activeSessions++;

    let stt: SttSession | null = null;
    let tts: TtsHandle | null = null;
    let ttsCounter = 0;
    let lang: Lang = sosCase?.lang ?? "hinglish";
    let echo = false;
    let finishLine: (() => void) | null = null;
    let lineTimer: NodeJS.Timeout | undefined;
    let rotateTimer: NodeJS.Timeout | undefined;
    let sttReopens = 0;
    let socketClosed = false;

    const releaseLine = () => {
      clearTimeout(lineTimer);
      finishLine?.();
      finishLine = null;
    };

    const stopSpeaking = () => {
      tts?.cancel();
      tts = null;
      releaseLine();
    };

    const speak = (text: string, speakLang: Lang, options: { cacheable?: boolean; interruptible?: boolean } = {}) => {
      stopSpeaking();
      const ttsId = ++ttsCounter;
      const startedAt = performance.now();
      let firstAudioMs: number | null = null;
      let audioBytes = 0;
      send({ type: "tts.start", ttsId, sampleRate: deps.tts.sampleRate, text, interruptible: options.interruptible ?? true });
      if (sosCase) deps.cases.addEvent(sosCase.id, "ayu_utterance", { text });
      const finished = new Promise<void>((resolve) => {
        finishLine = resolve;
      });
      const handle = deps.tts.synthesize({ text, lang: speakLang, cacheable: options.cacheable }, {
        onAudio(data) {
          firstAudioMs ??= Math.round(performance.now() - startedAt);
          audioBytes += Buffer.byteLength(data, "base64");
          send({ type: "tts.audio", ttsId, data });
        },
        onEnd() {
          if (tts === handle) tts = null;
          send({ type: "tts.end", ttsId, firstAudioMs });
          // Audio streams faster than it plays, so hold the next line until this one has been heard.
          const durationMs = (audioBytes / 2 / deps.tts.sampleRate) * 1000;
          const remainingMs = durationMs - (performance.now() - startedAt) + PLAYBACK_MARGIN_MS;
          lineTimer = setTimeout(releaseLine, Math.max(0, remainingMs));
        },
        onError({ code, message }) {
          if (tts === handle) tts = null;
          send({ type: "tts.end", ttsId, firstAudioMs });
          send({ type: "error", code, message, fatal: false });
          releaseLine();
        },
      });
      tts = handle;
      return finished;
    };

    const io: SosIo = {
      say: (text, { lang: lineLang, cacheable, interruptible }) => speak(text, lineLang, { cacheable, interruptible }),
      interrupt() {
        stopSpeaking();
        send({ type: "tts.stop" });
      },
      publish: (state) => send({ type: "sos.state", ...state }),
    };

    const startMachine = (id: string, openingPlayed: boolean) => {
      const existing = machines.get(id);
      if (existing) {
        void existing.attach(io);
        return;
      }
      const { cases, llm, protocols, addresses } = deps;
      const machine = new SosMachine(id, lang, { cases, llm, protocols, addressFor: (caseId) => addresses.forCase(caseId) }, io);
      machines.set(id, machine);
      void machine.begin(openingPlayed);
    };

    const openStt = () => {
      stt = deps.stt.open({ lang }, {
        onReady() {
          sttReopens = 0;
          send({ type: "stt.ready" });
        },
        onSpeechStart: () => send({ type: "speech.start" }),
        onProcessing: () => send({ type: "transcript.processing" }),
        onTranscript({ text, latencyMs, detectedLang }) {
          send({ type: "transcript.final", text, latencyMs, detectedLang });
          const machine = sosCase ? machines.get(sosCase.id) : undefined;
          if (!text.trim()) {
            void machine?.onEmptyTranscript();
            return;
          }
          if (sosCase) {
            deps.cases.recordTurn(sosCase.id, text);
            void machine?.onUtterance(text);
          } else if (echo) {
            void speak(text, lang);
          }
        },
        onError({ code, message, fatal }) {
          // During SOS a lost Prisma session is recovered below, so it must not end the emergency.
          send({ type: "error", code, message, fatal: fatal && !sosCase });
        },
        onClose() {
          stt = null;
          if (socketClosed || !sosCase || sosCase.closedAt || sttReopens >= MAX_STT_REOPENS) return;
          sttReopens++;
          setTimeout(() => {
            if (!socketClosed && !stt) openStt();
          }, STT_REOPEN_DELAY_MS);
        },
      });
      if (sosCase) {
        clearTimeout(rotateTimer);
        rotateTimer = setTimeout(() => stt?.close(), deps.limits.sttRotateSeconds * 1000);
      }
    };

    const handleControl = (message: ClientMessage) => {
      switch (message.type) {
        case "start":
          if (stt) return;
          if (!sosCase) {
            lang = message.lang;
            echo = Boolean(message.echo);
          }
          openStt();
          if (sosCase) startMachine(sosCase.id, Boolean(message.openingPlayed));
          break;
        case "triage_answer":
          if (sosCase && ["yes", "no", "unsure"].includes(message.answer)) void machines.get(sosCase.id)?.onAnswer(message.answer);
          break;
        case "commit":
          stt?.commit();
          break;
        case "say": {
          if (!deps.voiceLab || sosCase) return;
          const text = message.text.trim().slice(0, deps.limits.maxTtsChars);
          if (text) void speak(text, message.lang ?? lang);
          break;
        }
        case "stop_speaking":
          stopSpeaking();
          break;
        case "first_audio":
          if (sosCase && Number.isFinite(message.ms)) deps.cases.recordFirstLine(sosCase.id, Math.round(message.ms));
          break;
      }
    };

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        stt?.sendAudio(data as Buffer);
        return;
      }
      try {
        handleControl(JSON.parse(data.toString()) as ClientMessage);
      } catch {
        send({ type: "error", code: "bad_message", message: "Could not read control message", fatal: false });
      }
    });

    const maxSeconds = sosCase ? deps.limits.sosSessionMaxSeconds : deps.limits.sessionMaxSeconds;
    const sessionTimer = setTimeout(() => {
      send({ type: "error", code: "session_limit", message: "Voice session time limit reached", fatal: true });
      socket.close();
    }, maxSeconds * 1000);

    const unsubscribe = deps.cases.subscribe((updated) => {
      if (updated.id === sessionId && updated.closedAt) socket.close(CLOSE_CASE_ENDED);
    });

    socket.on("close", () => {
      socketClosed = true;
      activeSessions--;
      clearTimeout(sessionTimer);
      clearTimeout(rotateTimer);
      unsubscribe();
      if (sosCase) machines.get(sosCase.id)?.detach();
      stopSpeaking();
      stt?.close();
    });

    send({ type: "session.ready", voiceMode: deps.voiceMode });
  });
}
