import { useEffect, useState, type FormEvent } from "react";
import type { Case, CaseEvent } from "../../../../server/src/types/case";
import { caseAction, useCases } from "../hooks/useCases";
import { eventLabels, strings } from "../i18n/strings";

const t = strings.en;

function timeSince(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const yesNo = (value: boolean | undefined) => (value === undefined ? t.dashUnknown : value ? t.yes : t.no);

export function DashboardLogin({ onLogin, failed }: { onLogin(secret: string): void; failed: boolean }) {
  const [secret, setSecret] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLogin(secret);
  };
  return (
    <main className="dashboard login">
      <h1>{t.dashTitle}</h1>
      <form className="field" onSubmit={submit}>
        <input
          type="password"
          aria-label={t.dashPassword}
          placeholder={t.dashPassword}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
        <button className="button ink small">{t.dashSignIn}</button>
      </form>
      {failed && <p className="error" role="alert">{t.dashWrongPassword}</p>}
    </main>
  );
}

function CaseRow({ item, now, selected, onSelect }: { item: Case; now: number; selected: boolean; onSelect(): void }) {
  const { location } = item;
  const waiting = item.dispatch.status === "requested" || item.dispatch.status === "unacknowledged";
  const act = (action: "accept" | "status", body: object) => (event: React.MouseEvent) => {
    event.stopPropagation();
    void caseAction(item.id, action, body);
  };
  return (
    <li className="case-row" data-closed={Boolean(item.closedAt)} data-selected={selected} onClick={onSelect}>
      <div className="case-head">
        <span className="chip" data-severity={item.severity ?? "none"}>{item.severity ?? t.dashTriagePending}</span>
        <span className="mono">{timeSince(item.createdAt, now)}</span>
        <span className="mono">{item.dispatch.status.toUpperCase()}</span>
      </div>
      {item.dispatch.status === "unacknowledged" && <p className="case-warning">{t.dashUnacknowledged}</p>}
      {location?.addressText && <p><strong>{location.addressText}</strong></p>}
      {location?.lat != null && location.lng != null ? (
        <p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </a>
          <span className="mono"> · ±{Math.round(location.accuracyM ?? 0)} m</span>
        </p>
      ) : (
        <p className="case-warning">{t.dashNoLocation}</p>
      )}
      {location?.status === "updated" && <p className="case-warning">{t.dashLocationUpdated}</p>}
      {location?.status === "verified" && <p className="mono">{t.dashLocationConfirmed}</p>}
      {location?.status === "confirming" && <p className="mono">{t.dashLocationConfirming}</p>}
      {(location?.spokenText || location?.landmark || location?.floor) && (
        <p>{t.dashSpokenPlace}: <strong>{[location.spokenText, location.landmark, location.floor].filter(Boolean).join(" · ")}</strong></p>
      )}
      <p>
        {t.dashResponding}: <strong>{yesNo(item.triage.responsive)}</strong> · {t.dashBreathing}: <strong>{yesNo(item.triage.breathingNormally)}</strong>
        {item.triage.emergencyType && <> · {t.dashType}: <strong>{item.triage.emergencyType}</strong></>}
      </p>
      {item.protocolId && <p>{t.dashProtocol}: <strong>{item.protocolId}</strong></p>}
      {item.dispatch.ambulanceId && (
        <p>
          {t.dashAmbulance}: <strong>{item.dispatch.ambulanceId}</strong>
          {item.dispatch.status !== "arrived" && item.dispatch.etaMinutes !== undefined && ` · ETA ${item.dispatch.etaMinutes} min`}
        </p>
      )}
      <p className="mono">
        {item.lang} · {t.dashTurns}: {item.metrics.turns}
        {item.metrics.activationToFirstLineMs !== undefined && ` · ${t.dashFirstLine}: ${item.metrics.activationToFirstLineMs} ms`}
        {item.metrics.tapToFirstInstructionMs !== undefined && ` · ${t.dashFirstInstruction}: ${(item.metrics.tapToFirstInstructionMs / 1000).toFixed(1)} s`}
      </p>
      {!item.closedAt && item.dispatch.status !== "arrived" && (
        <div className="case-actions">
          {waiting && <button className="button ink small" onClick={act("accept", {})}>{t.dashAccept}</button>}
          {!waiting && item.dispatch.status !== "en_route" && (
            <button className="button plain small" onClick={act("status", { status: "en_route" })}>{t.dashOnWay}</button>
          )}
          {!waiting && <button className="button plain small" onClick={act("status", { status: "arrived" })}>{t.dashArrived}</button>}
        </div>
      )}
    </li>
  );
}

function CaseDetail({ item, tick }: { item: Case; tick: number }) {
  const [timeline, setTimeline] = useState<CaseEvent[]>([]);

  useEffect(() => {
    let stale = false;
    fetch(`/api/cases/${item.id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((detail: { timeline: CaseEvent[] } | null) => {
        if (detail && !stale) setTimeline(detail.timeline);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [item.id, tick]);

  const transcript = timeline.filter((entry) => entry.type === "user_utterance" || entry.type === "ayu_utterance");
  const { extra } = item.triage;
  const onset = extra?.onset;

  return (
    <aside className="case-detail">
      <section className="brief" aria-live="polite">
        <h2>{t.dashBrief}</h2>
        <p>{item.brief}</p>
        {onset && <p className="mono">{t.dashOnset}: {onset}</p>}
      </section>
      <section>
        <h2>{t.dashTranscript}</h2>
        {transcript.length === 0 && <p className="mono">{t.dashNoSpeech}</p>}
        <ul className="transcript-list">
          {transcript.map((entry) => (
            <li key={entry.id} data-who={entry.type === "user_utterance" ? "caller" : "ayu"}>
              <span className="mono">{entry.type === "user_utterance" ? t.dashCaller : t.brand}</span>
              <span>{String(entry.payload.text ?? "")}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{t.dashTimeline}</h2>
        <ol className="timeline">
          {timeline.filter((entry) => !transcript.includes(entry)).map((entry) => (
            <li key={entry.id}>
              <span className="mono">{clockTime(entry.at)}</span>
              <span>{eventLabels[entry.type]}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

export function Dashboard() {
  const { authed, login, loginError, cases, connected, now, timelineTick } = useCases();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (authed === null) return null;
  if (!authed) return <DashboardLogin onLogin={login} failed={loginError} />;

  const selected = cases.find((item) => item.id === selectedId) ?? cases[0];

  return (
    <main className="dashboard">
      <header className="dash-head">
        <h1>{t.dashTitle}</h1>
        <span className="badge">{t.simulated}</span>
        <span className="mono">{connected ? t.dashLive : t.dashReconnecting}</span>
      </header>
      {cases.length === 0 ? (
        <p className="mono">{t.dashEmpty}</p>
      ) : (
        <div className="dash-panes">
          <ul className="case-list">
            {cases.map((item) => (
              <CaseRow key={item.id} item={item} now={now} selected={item.id === selected?.id} onSelect={() => setSelectedId(item.id)} />
            ))}
          </ul>
          {selected && <CaseDetail item={selected} tick={timelineTick.caseId === selected.id ? timelineTick.tick : 0} />}
        </div>
      )}
      <p className="mono">{t.dashOsm}</p>
    </main>
  );
}
