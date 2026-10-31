import { useCallback, useEffect, useRef, useState } from "react";
import type { TriageAnswer } from "../../../../server/src/types/triage";
import type { Lang, ServerMessage, SosState } from "../../../../server/src/types/voice";
import { VoiceClient } from "../audio/voiceClient";

export type VoiceStatus = "idle" | "connecting" | "listening" | "hearing" | "processing" | "speaking";

export interface TranscriptLine {
  id: number;
  who: "you" | "ayu";
  text: string;
}

export interface VoiceError {
  code: string;
  message: string;
  fatal: boolean;
}

export function useVoice(lang: Lang) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [level, setLevel] = useState(0);
  const [voiceMode, setVoiceMode] = useState<"real" | "mock" | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);
  const [latency, setLatency] = useState<{ sttMs?: number; ttsMs?: number }>({});
  const [sosState, setSosState] = useState<SosState | null>(null);
  const client = useRef<VoiceClient | null>(null);
  const lineId = useRef(0);

  const addLine = (who: TranscriptLine["who"], text: string) =>
    setLines((current) => [...current, { id: ++lineId.current, who, text }]);

  const onMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "session.ready":
        setVoiceMode(message.voiceMode);
        break;
      case "stt.ready":
        setStatus("listening");
        break;
      case "speech.start":
        setStatus("hearing");
        break;
      case "transcript.processing":
        setStatus("processing");
        break;
      case "transcript.final":
        setStatus("listening");
        setLatency((current) => ({ ...current, sttMs: message.latencyMs }));
        if (message.text.trim()) addLine("you", message.text);
        break;
      case "tts.start":
        setStatus("speaking");
        addLine("ayu", message.text);
        break;
      case "tts.end":
        setStatus((current) => (current === "speaking" ? "listening" : current));
        setLatency((current) => ({ ...current, ttsMs: message.firstAudioMs ?? undefined }));
        break;
      case "sos.state":
        setSosState(message);
        break;
      case "error":
        setError({ code: message.code, message: message.message, fatal: message.fatal });
        break;
    }
  }, []);

  const start = useCallback(async (
    context: AudioContext,
    options: { echo: boolean; bargeIn: boolean; session?: { caseId: string; activatedAt: number } },
  ) => {
    setError(null);
    setStatus("connecting");
    const voiceClient = new VoiceClient(context, {
      lang,
      echo: options.echo,
      bargeIn: options.bargeIn,
      onMessage,
      onInputLevel: setLevel,
      onClosed: () => {
        setStatus("idle");
        setLevel(0);
      },
    });
    client.current = voiceClient;
    try {
      await voiceClient.start(options.session);
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
      setError({ code: denied ? "mic_denied" : "voice_start", message: String(cause), fatal: false });
    }
  }, [lang, onMessage]);

  const stop = useCallback(() => {
    client.current?.stop();
    client.current = null;
    setStatus("idle");
    setLevel(0);
  }, []);

  const say = useCallback((text: string) => client.current?.say(text), []);
  const answer = useCallback((value: TriageAnswer) => client.current?.answer(value), []);

  useEffect(() => () => client.current?.stop(), []);

  return { status, lines, level, voiceMode, error, latency, sosState, start, stop, say, answer };
}
