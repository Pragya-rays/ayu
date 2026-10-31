import { useState } from "react";
import type { Lang } from "../../../../server/src/types/voice";
import { unlockAudio } from "../audio/voiceClient";
import { useVoice, type VoiceStatus } from "../hooks/useVoice";
import type { StringKey } from "../i18n/strings";

const STATUS_KEY: Record<VoiceStatus, StringKey> = {
  idle: "statusIdle",
  connecting: "statusConnecting",
  listening: "statusListening",
  hearing: "statusHearing",
  processing: "statusProcessing",
  speaking: "statusSpeaking",
};

interface Props {
  lang: Lang;
  t: (key: StringKey) => string;
  onBack(): void;
}

export function VoiceCheck({ lang, t, onBack }: Props) {
  const voice = useVoice(lang);
  const [text, setText] = useState("");
  const [echo, setEcho] = useState(true);
  const [bargeIn, setBargeIn] = useState(false);
  const active = voice.status !== "idle";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    voice.say(text);
    setText("");
  };

  return (
    <div className="paper">
      <main className="screen">
        <div className="topbar">
          <button className="button plain small" onClick={onBack}>{t("back")}</button>
          <span className="wordmark">{t("voiceTitle")}</span>
        </div>

        {voice.voiceMode === "mock" && <span className="badge">{t("mockBadge")}</span>}

        <div className="orb-wrap">
          <div
            className="orb"
            data-state={voice.status}
            style={{ transform: `scale(${1 + Math.min(voice.level, 1) * 0.5})` }}
          />
          <div aria-live="polite">{t(STATUS_KEY[voice.status])}</div>
        </div>

        <section className="card transcript" aria-live="polite">
          {voice.lines.length === 0 && <p className="empty">{t("transcriptEmpty")}</p>}
          {voice.lines.map((line) => (
            <p key={line.id}>
              <span className="mono">{line.who === "you" ? "you" : "ayu"} · </span>
              {line.text}
            </p>
          ))}
        </section>

        <p className="mono">
          {t("sttLatency")}: {voice.latency.sttMs ?? "–"} ms · {t("ttsLatency")}: {voice.latency.ttsMs ?? "–"} ms
        </p>

        {voice.error && (
          <p className="error" role="alert">
            {voice.error.code === "mic_denied" ? t("micDenied") : `${voice.error.code}: ${voice.error.message}`}
          </p>
        )}

        <label className="toggle">
          <input type="checkbox" checked={echo} disabled={active} onChange={(event) => setEcho(event.target.checked)} />
          {t("repeatBack")}
        </label>
        <label className="toggle">
          <input type="checkbox" checked={bargeIn} disabled={active} onChange={(event) => setBargeIn(event.target.checked)} />
          {t("bargeIn")}
        </label>

        <form className="field" onSubmit={submit}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder={t("sayPlaceholder")} disabled={!active} />
          <button className="button ink small" disabled={!active || !text.trim()}>{t("say")}</button>
        </form>

        {active ? (
          <button className="button plain" onClick={voice.stop}>{t("stop")}</button>
        ) : (
          <button className="button ink" onClick={() => voice.start(unlockAudio(), { echo, bargeIn })}>{t("start")}</button>
        )}
      </main>
    </div>
  );
}
