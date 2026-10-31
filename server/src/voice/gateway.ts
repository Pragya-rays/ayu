import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { STTAdapter, SttSession, TTSAdapter, TtsHandle } from "../adapters/types.js";
import type { CaseStore } from "../cases/store.js";
import { SOS_OPENING } from "../dialogue/lines.js";
import type { ClientMessage, Lang, ServerMessage } from "../types/voice.js";

export interface VoiceGatewayDeps {
  stt: STTAdapter;
  tts: TTSAdapter;
  cases: CaseStore;
  voiceMode: "real" | "mock";
  voiceLab: boolean;
  limits: { maxSessions: number; sessionMaxSeconds: number; maxTtsChars: number };
}

const CLOSE_POLICY = 1008;
const CLOSE_TRY_LATER = 1013;

export function registerVoiceGateway(app: FastifyInstance, deps: VoiceGatewayDeps) {
  let activeSessions = 0;

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

    const stopSpeaking = () => {
      tts?.cancel();
      tts = null;
    };

    const speak = (text: string, speakLang: Lang, cacheable = false) => {
      stopSpeaking();
      const ttsId = ++ttsCounter;
      const startedAt = performance.now();
      let firstAudioMs: number | null = null;
      send({ type: "tts.start", ttsId, sampleRate: deps.tts.sampleRate, text });
      if (sosCase) deps.cases.addEvent(sosCase.id, "ayu_utterance", { text });
      const handle = deps.tts.synthesize({ text, lang: speakLang, cacheable }, {
        onAudio(data) {
          firstAudioMs ??= Math.round(performance.now() - startedAt);
          send({ type: "tts.audio", ttsId, data });
        },
        onEnd() {
          if (tts === handle) tts = null;
          send({ type: "tts.end", ttsId, firstAudioMs });
        },
        onError({ code, message }) {
          if (tts === handle) tts = null;
          send({ type: "tts.end", ttsId, firstAudioMs });
          send({ type: "error", code, message, fatal: false });
        },
      });
      tts = handle;
    };

    const openStt = () => {
      stt = deps.stt.open({ lang }, {
        onReady: () => send({ type: "stt.ready" }),
        onSpeechStart: () => send({ type: "speech.start" }),
        onProcessing: () => send({ type: "transcript.processing" }),
        onTranscript({ text, latencyMs, detectedLang }) {
          send({ type: "transcript.final", text, latencyMs, detectedLang });
          if (!text.trim()) return;
          if (sosCase) deps.cases.recordTurn(sosCase.id, text);
          else if (echo) speak(text, lang);
        },
        onError: ({ code, message, fatal }) => send({ type: "error", code, message, fatal }),
        onClose: () => {
          stt = null;
        },
      });
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
          if (sosCase) speak(SOS_OPENING[lang], lang, true);
          break;
        case "commit":
          stt?.commit();
          break;
        case "say": {
          if (!deps.voiceLab || sosCase) return;
          const text = message.text.trim().slice(0, deps.limits.maxTtsChars);
          if (text) speak(text, message.lang ?? lang);
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

    const sessionTimer = setTimeout(() => {
      send({ type: "error", code: "session_limit", message: "Voice session time limit reached", fatal: true });
      socket.close();
    }, deps.limits.sessionMaxSeconds * 1000);

    const unsubscribe = deps.cases.subscribe((updated) => {
      if (updated.id === sessionId && updated.closedAt) socket.close();
    });

    socket.on("close", () => {
      activeSessions--;
      clearTimeout(sessionTimer);
      unsubscribe();
      stopSpeaking();
      stt?.close();
    });

    send({ type: "session.ready", voiceMode: deps.voiceMode });
  });
}
