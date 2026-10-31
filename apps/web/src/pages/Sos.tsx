import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang, SosState } from "../../../../server/src/types/voice";
import { fetchLocalLine, playLocalLine, requestMic } from "../audio/voiceClient";
import { useVoice } from "../hooks/useVoice";
import type { StringKey } from "../i18n/strings";

const COUNTDOWN_SECONDS = 3;
const GPS_TIMEOUT_MS = 8000;
const ACCURACY_GAIN = 0.8;

type Stage = "arming" | "active" | "failed";
type GpsState = "waiting" | "ok" | "failed";
type Position = { lat: number; lng: number; accuracyM: number };

interface Props {
  lang: Lang;
  t: (key: StringKey) => string;
  audio: AudioContext;
  onExit(): void;
}

async function post(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    navigator.wakeLock.request("screen").then(
      (acquired) => {
        lock = acquired;
        if (released) void lock.release();
      },
      () => undefined,
    );
    return () => {
      released = true;
      void lock?.release();
    };
  }, [enabled]);
}

export function Sos({ lang, t, audio, onExit }: Props) {
  const voice = useVoice(lang);
  const [stage, setStage] = useState<Stage>("arming");
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [gps, setGps] = useState<GpsState>("waiting");
  const caseId = useRef<string | null>(null);
  const position = useRef<Position | null>(null);
  const sentAccuracy = useRef(Number.POSITIVE_INFINITY);
  const voiceStarted = useRef(false);
  const exiting = useRef(false);
  const openingAudio = useRef<ArrayBuffer | null>(null);
  const mic = useRef<Promise<MediaStream> | null>(null);
  const { start: startVoice, stop: stopVoice } = voice;

  useWakeLock(stage === "active");

  /** Sends a position only when it is meaningfully better than the last one sent. */
  const sendPosition = useCallback((id: string) => {
    const latest = position.current;
    if (!latest || latest.accuracyM >= sentAccuracy.current * ACCURACY_GAIN) return;
    sentAccuracy.current = latest.accuracyM;
    void post(`/api/sos/${id}/location`, latest).catch(() => undefined);
  }, []);

  // The countdown is time to fetch the opening, so it can play the moment the countdown ends,
  // and to start the mic, so iOS does not interrupt that playback by switching audio modes.
  useEffect(() => {
    void fetchLocalLine(`/audio/opening-${lang}.pcm`).then((pcm) => {
      openingAudio.current = pcm;
    });
    if (mic.current) return;
    mic.current = requestMic();
    mic.current.catch(() => undefined); // a refusal is reported when the session starts
  }, [lang]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGps("failed");
      return;
    }
    // Keeps watching, because the first fix indoors is often poor and improves within seconds.
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        position.current = { lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy };
        setGps("ok");
        if (caseId.current) sendPosition(caseId.current);
      },
      () => setGps((current) => (current === "ok" ? current : "failed")),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [sendPosition]);

  const activate = useCallback(async () => {
    const activatedAt = performance.now();
    setStage("active");
    void audio.resume();
    const pcm = openingAudio.current;
    const localOpening = pcm
      ? { finished: playLocalLine(audio, pcm), startedAfterMs: performance.now() - activatedAt }
      : undefined;
    try {
      sentAccuracy.current = position.current?.accuracyM ?? Number.POSITIVE_INFINITY;
      const { caseId: id } = await post("/api/sos/start", { lang, consent: true, ...position.current });
      caseId.current = id;
      sendPosition(id);
      await startVoice(audio, {
        echo: false,
        bargeIn: true,
        session: { caseId: id, activatedAt, localOpening, mic: mic.current ?? undefined },
      });
    } catch {
      setStage("failed");
    }
  }, [audio, lang, sendPosition, startVoice]);

  useEffect(() => {
    if (stage !== "arming") return;
    if (secondsLeft === 0) {
      void activate();
      return;
    }
    navigator.vibrate?.(60);
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [activate, secondsLeft, stage]);

  useEffect(() => {
    if (voice.error?.fatal) setStage("failed");
  }, [voice.error]);

  useEffect(() => {
    if (voice.status !== "idle") voiceStarted.current = true;
    else if (voiceStarted.current && !exiting.current) setStage("failed");
  }, [voice.status]);

  const exit = async () => {
    exiting.current = true;
    if (caseId.current) await post(`/api/sos/${caseId.current}/cancel`).catch(() => undefined);
    stopVoice();
    void mic.current?.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    if (audio.state !== "closed") void audio.close().catch(() => undefined);
    onExit();
  };

  if (stage === "arming") {
    return (
      <main className="sos arming">
        <p className="sos-label">{t("sosArming")}</p>
        <p className="countdown" aria-live="assertive">{secondsLeft}</p>
        <button className="button sos-cancel" onClick={exit}>{t("cancel")}</button>
      </main>
    );
  }

  const lastYou = [...voice.lines].reverse().find((line) => line.who === "you");
  const lastAyu = [...voice.lines].reverse().find((line) => line.who === "ayu");
  const { sosState } = voice;
  const arrived = sosState?.stage === "arrived";
  const gpsLabel = sosState?.locationStatus === "verified" || sosState?.locationStatus === "updated"
    ? t("sosLocationConfirmed")
    : gps === "ok" ? t("sosLocationOk") : gps === "failed" ? t("sosLocationFailed") : t("sosLocationWaiting");
  const dispatchLabels: Partial<Record<SosState["dispatchStatus"], StringKey>> = {
    accepted: "sosAmbulanceAccepted",
    en_route: "sosAmbulanceOnWay",
    arrived: "sosAmbulanceArrived",
    unacknowledged: "sosAmbulanceUnacknowledged",
  };
  const dispatchLabel = t(dispatchLabels[sosState?.dispatchStatus ?? "requested"] ?? "sosAmbulanceRequested");
  const showAnswers = stage === "active" && sosState?.question && sosState.question !== "landmark";

  return (
    <main className="sos">
      <p className="status-strip">
        <span>{gpsLabel}</span>
        <span>{dispatchLabel}</span>
        {!arrived && sosState?.etaMinutes != null && <span>{t("sosEta")} {sosState.etaMinutes} min</span>}
        <span className="simulated">{t("simulated")}</span>
        {voice.voiceMode === "mock" && <span className="simulated">MOCK</span>}
        {sosState?.severity && <span className="severity" data-severity={sosState.severity}>{sosState.severity}</span>}
      </p>

      <div className="sos-center">
        {stage === "failed" ? (
          <p className="instruction" role="alert">{t("sosConnectionLost")}</p>
        ) : (
          <p className="instruction" aria-live="assertive">{lastAyu?.text ?? t("sosOpening")}</p>
        )}
        {stage === "active" && sosState?.protocolTitle && (
          <p className="protocol-title">
            {sosState.protocolTitle}
            {sosState.placeholder && <span className="simulated"> · {t("sosPendingReview")}</span>}
          </p>
        )}
        {voice.reconnecting && <p className="sos-note" role="status">{t("sosReconnecting")}</p>}
        {gps === "failed" && <p className="sos-note">{t("sosNoGps")}</p>}
        {voice.error?.code === "mic_denied" && <p className="sos-note" role="alert">{t("sosMicDenied")}</p>}
        {stage === "active" && (
          <div className="sos-listen">
            <div className="orb small" data-state={voice.status} style={{ transform: `scale(${1 + Math.min(voice.level, 1) * 0.5})` }} />
            {lastYou && <p className="sos-transcript">{lastYou.text}</p>}
          </div>
        )}
      </div>

      <div className="actions">
        {showAnswers && (
          <div className="answers" role="group">
            <button className="button sos-answer" onClick={() => voice.answer("yes")}>{t("yes")}</button>
            <button className="button sos-answer" onClick={() => voice.answer("no")}>{t("no")}</button>
            <button className="button sos-answer" onClick={() => voice.answer("unsure")}>{t("notSure")}</button>
          </div>
        )}
        <a className="button sos-call" href="tel:112">{t("call112")}</a>
        <button className="button sos-cancel small" onClick={exit}>{arrived ? t("sosClose") : t("sosCancel")}</button>
        <p className="sos-disclaimer">{t("disclaimer")}</p>
      </div>
    </main>
  );
}
