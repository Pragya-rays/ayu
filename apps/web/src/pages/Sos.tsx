import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "../../../../server/src/types/voice";
import { useVoice } from "../hooks/useVoice";
import type { StringKey } from "../i18n/strings";

const COUNTDOWN_SECONDS = 3;
const GPS_TIMEOUT_MS = 8000;

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
  const positionSent = useRef(false);
  const voiceStarted = useRef(false);
  const exiting = useRef(false);
  const { start: startVoice, stop: stopVoice } = voice;

  useWakeLock(stage === "active");

  useEffect(() => {
    if (!navigator.geolocation) {
      setGps("failed");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        position.current = { lat: coords.latitude, lng: coords.longitude, accuracyM: coords.accuracy };
        setGps("ok");
        if (caseId.current && !positionSent.current) {
          positionSent.current = true;
          void post(`/api/sos/${caseId.current}/location`, position.current).catch(() => undefined);
        }
      },
      () => setGps("failed"),
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS },
    );
  }, []);

  const activate = useCallback(async () => {
    const activatedAt = performance.now();
    setStage("active");
    try {
      positionSent.current = position.current !== null;
      const { caseId: id } = await post("/api/sos/start", { lang, consent: true, ...position.current });
      caseId.current = id;
      if (position.current && !positionSent.current) {
        positionSent.current = true;
        void post(`/api/sos/${id}/location`, position.current).catch(() => undefined);
      }
      await startVoice(audio, { echo: false, bargeIn: false, session: { caseId: id, activatedAt } });
    } catch {
      setStage("failed");
    }
  }, [audio, lang, startVoice]);

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
  const gpsLabel = gps === "ok" ? t("sosLocationOk") : gps === "failed" ? t("sosLocationFailed") : t("sosLocationWaiting");

  return (
    <main className="sos">
      <p className="status-strip">
        <span>{gpsLabel}</span>
        <span>{t("sosAmbulanceRequested")}</span>
        <span className="simulated">{t("simulated")}</span>
        {voice.voiceMode === "mock" && <span className="simulated">MOCK</span>}
      </p>

      <div className="sos-center">
        {stage === "failed" ? (
          <p className="instruction" role="alert">{t("sosConnectionLost")}</p>
        ) : (
          <p className="instruction" aria-live="assertive">{t("sosOpening")}</p>
        )}
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
        <a className="button sos-call" href="tel:112">{t("call112")}</a>
        <button className="button sos-cancel small" onClick={exit}>{t("sosCancel")}</button>
        <p className="sos-disclaimer">{t("disclaimer")}</p>
      </div>
    </main>
  );
}
