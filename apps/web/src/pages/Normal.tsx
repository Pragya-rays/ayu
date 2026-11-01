import { useEffect, useRef, useState, type FormEvent } from "react";
import type { NormalSummary } from "../../../../server/src/types/normal";
import type { Lang } from "../../../../server/src/types/voice";
import { shareOrCopy } from "../audio/share";
import { useVoice } from "../hooks/useVoice";
import type { StringKey } from "../i18n/strings";

interface Props {
  lang: Lang;
  t: (key: StringKey) => string;
  audio: AudioContext;
  onBack(): void;
  onSwitchToSos(): void;
}

function SummaryCard({ summary, t, onDone }: { summary: NormalSummary; t: Props["t"]; onDone(): void }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = [
      `${t("normalYouSaid")}:`,
      ...summary.said,
      "",
      ...(summary.urgent ? [t("normalSeeDoctorNow")] : [summary.title ?? "", ...summary.steps, ...summary.seeDoctorIf]),
      "",
      t("disclaimer"),
    ].join("\n");
    if (await shareOrCopy(text) === "copied") setCopied(true);
  };

  return (
    <section className="card summary" aria-live="polite">
      <h2>{t("normalSummary")}</h2>
      <h3>{t("normalYouSaid")}</h3>
      <ul>{summary.said.map((line, index) => <li key={index}>{line}</li>)}</ul>
      {summary.urgent ? (
        <p className="error"><strong>{t("normalSeeDoctorNow")}</strong></p>
      ) : (
        <>
          <h3>{summary.title ?? t("normalSuggestion")}</h3>
          {summary.steps.length ? <ul>{summary.steps.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p>{t("normalNoGuidance")}</p>}
          {summary.seeDoctorIf.length > 0 && (
            <>
              <h3>{t("normalSeeDoctorIf")}</h3>
              <ul>{summary.seeDoctorIf.map((line, index) => <li key={index}>{line}</li>)}</ul>
            </>
          )}
        </>
      )}
      {summary.placeholder && <span className="badge">{t("sosPendingReview")}</span>}
      <p className="mono">{t("disclaimer")}</p>
      <button className="button plain small" onClick={share}>{copied ? t("normalCopied") : t("normalShare")}</button>
      <button className="button ink" onClick={onDone}>{t("normalDone")}</button>
    </section>
  );
}

export function Normal({ lang, t, audio, onBack, onSwitchToSos }: Props) {
  const voice = useVoice(lang);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const { start, stop } = voice;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/normal/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, consent: true }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ sessionId: string }>;
      })
      .then(({ sessionId }) => start(audio, {
        echo: false,
        bargeIn: true,
        session: { caseId: sessionId, activatedAt: performance.now(), reconnect: false },
      }))
      .catch(() => setFailed(true));
  }, [audio, lang, start]);

  const leave = () => {
    stop();
    if (audio.state !== "closed") void audio.close().catch(() => undefined);
    onBack();
  };

  const switchToSos = () => {
    stop();
    if (audio.state !== "closed") void audio.close().catch(() => undefined);
    onSwitchToSos();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    voice.control({ type: "normal_text", text });
    setText("");
  };

  const state = voice.normalState;
  const lastAyu = [...voice.lines].reverse().find((line) => line.who === "ayu");
  const lastYou = [...voice.lines].reverse().find((line) => line.who === "you");

  return (
    <div className="paper">
      <main className="screen">
        <div className="topbar">
          <button className="button plain small" onClick={leave}>{t("back")}</button>
          <span className="wordmark">{t("brand")}</span>
        </div>

        {voice.voiceMode === "mock" && <span className="badge">{t("mockBadge")}</span>}
        {failed && <p className="error" role="alert">{t("normalUnavailable")}</p>}
        {voice.error?.code === "mic_denied" && <p className="error" role="alert">{t("normalMicDenied")}</p>}

        {state?.summary ? (
          <SummaryCard summary={state.summary} t={t} onDone={leave} />
        ) : (
          <>
            <div className="orb-wrap">
              <div className="orb" data-state={voice.status} style={{ transform: `scale(${1 + Math.min(voice.level, 1) * 0.5})` }} />
            </div>
            <section className="card normal-line" aria-live="polite">
              <p>{lastAyu?.text ?? "…"}</p>
              {lastYou && <p className="mono">{lastYou.text}</p>}
            </section>

            {state?.offerSos && (
              <section className="card serious" role="alert">
                <p><strong>{t("normalSerious")}</strong></p>
                <button className="button sos" onClick={switchToSos}>{t("normalSwitchSos")}</button>
                <button className="button plain small" onClick={() => voice.control({ type: "normal_decline_sos" })}>{t("normalNotNow")}</button>
              </section>
            )}

            {state?.expectsYesNo && !state.offerSos && (
              <div className="yes-no" role="group">
                <button className="button ink small" onClick={() => voice.control({ type: "normal_yes_no", answer: "yes" })}>{t("yes")}</button>
                <button className="button ink small" onClick={() => voice.control({ type: "normal_yes_no", answer: "no" })}>{t("no")}</button>
              </div>
            )}

            {!state?.offerSos && (
              <form className="field" onSubmit={submit}>
                <input aria-label={t("normalType")} placeholder={t("normalType")} value={text} onChange={(event) => setText(event.target.value)} />
                <button className="button ink small" disabled={!text.trim()}>{t("normalSend")}</button>
              </form>
            )}
            <p className="mono">{t("disclaimer")}</p>
          </>
        )}
      </main>
    </div>
  );
}
