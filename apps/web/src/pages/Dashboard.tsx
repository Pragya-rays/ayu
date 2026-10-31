import { useEffect, useState, type FormEvent } from "react";
import type { Case } from "../../../../server/src/types/case";
import { strings } from "../i18n/strings";

const t = strings.en;

function timeSince(iso: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

const yesNo = (value: boolean | undefined) => (value === undefined ? t.dashUnknown : value ? t.yes : t.no);

function CaseRow({ item, now }: { item: Case; now: number }) {
  const { location } = item;
  const waiting = item.dispatch.status === "requested" || item.dispatch.status === "unacknowledged";
  const act = (action: "accept" | "status", body: object) =>
    fetch(`/api/cases/${item.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  return (
    <li className="case-row" data-closed={Boolean(item.closedAt)}>
      <div className="case-head">
        <span className="chip" data-severity={item.severity ?? "none"}>{item.severity ?? t.dashTriagePending}</span>
        <span className="mono">{timeSince(item.createdAt, now)}</span>
        <span className="mono">{item.dispatch.status.toUpperCase()}</span>
      </div>
      {item.dispatch.status === "unacknowledged" && <p className="case-warning">{t.dashUnacknowledged}</p>}
      {location?.addressText && <p><strong>{location.addressText}</strong></p>}
      {location?.lat != null && location.lng != null ? (
        <p>
          <a href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`} target="_blank" rel="noreferrer">
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
          {waiting && <button className="button ink small" onClick={() => act("accept", {})}>{t.dashAccept}</button>}
          {!waiting && item.dispatch.status !== "en_route" && (
            <button className="button plain small" onClick={() => act("status", { status: "en_route" })}>{t.dashOnWay}</button>
          )}
          {!waiting && <button className="button plain small" onClick={() => act("status", { status: "arrived" })}>{t.dashArrived}</button>}
        </div>
      )}
    </li>
  );
}

export function Dashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [secret, setSecret] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("/api/cases").then((response) => setAuthed(response.ok), () => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    const source = new EventSource("/api/cases/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("snapshot", (event) => setCases(JSON.parse(event.data) as Case[]));
    source.addEventListener("case", (event) => {
      const updated = JSON.parse(event.data) as Case;
      setCases((current) => [updated, ...current.filter((item) => item.id !== updated.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      source.close();
      clearInterval(clock);
    };
  }, [authed]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    }).catch(() => null);
    setLoginError(!response?.ok);
    if (response?.ok) setAuthed(true);
  };

  if (authed === null) return null;

  if (!authed) {
    return (
      <main className="dashboard login">
        <h1>{t.dashTitle}</h1>
        <form className="field" onSubmit={login}>
          <input
            type="password"
            aria-label={t.dashPassword}
            placeholder={t.dashPassword}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
          <button className="button ink small">{t.dashSignIn}</button>
        </form>
        {loginError && <p className="error" role="alert">{t.dashWrongPassword}</p>}
      </main>
    );
  }

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
        <ul className="case-list">
          {cases.map((item) => <CaseRow key={item.id} item={item} now={now} />)}
        </ul>
      )}
      <p className="mono">{t.dashOsm}</p>
    </main>
  );
}
