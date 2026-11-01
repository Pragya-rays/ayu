import type { Case } from "../../../../server/src/types/case";
import { caseAction, useCases } from "../hooks/useCases";
import { strings } from "../i18n/strings";
import { DashboardLogin, MedicalIdCard } from "./Dashboard";

const t = strings.en;

function DriverCard({ item }: { item: Case }) {
  const { location, dispatch } = item;
  const waiting = dispatch.status === "requested" || dispatch.status === "unacknowledged";
  const place = [location?.spokenText, location?.landmark, location?.floor, location?.gate].filter(Boolean).join(" · ");
  const hasGps = location?.lat != null && location.lng != null;
  return (
    <section className="driver-card">
      <div className="case-head">
        <span className="chip" data-severity={item.severity ?? "none"}>{item.severity ?? t.dashTriagePending}</span>
        <span className="mono">{dispatch.status.toUpperCase()}</span>
        {dispatch.etaMinutes !== undefined && dispatch.status !== "arrived" && <span className="mono">ETA {dispatch.etaMinutes} min</span>}
      </div>
      <p className="driver-address">{location?.addressText ?? t.driverNoAddress}</p>
      {place && <p className="driver-place">{place}</p>}
      {location?.status === "updated" && <p className="case-warning">{t.dashLocationUpdated}</p>}
      {hasGps && (
        <a className="button plain small driver-map" href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`} target="_blank" rel="noreferrer">
          {t.driverOpenMap}
        </a>
      )}
      <p className="driver-brief">{item.brief}</p>
      {item.medicalId && <MedicalIdCard medicalId={item.medicalId} />}
      <div className="driver-actions">
        {waiting && <button className="button ink" onClick={() => caseAction(item.id, "accept", {})}>{t.dashAccept}</button>}
        {!waiting && dispatch.status !== "en_route" && dispatch.status !== "arrived" && (
          <button className="button ink" onClick={() => caseAction(item.id, "status", { status: "en_route" })}>{t.dashOnWay}</button>
        )}
        {!waiting && dispatch.status !== "arrived" && (
          <button className="button plain" onClick={() => caseAction(item.id, "status", { status: "arrived" })}>{t.dashArrived}</button>
        )}
      </div>
    </section>
  );
}

export function Driver() {
  const { authed, login, loginError, cases, connected } = useCases();

  if (authed === null) return null;
  if (!authed) return <DashboardLogin onLogin={login} failed={loginError} />;

  const active = cases.filter((item) => !item.closedAt);

  return (
    <main className="driver">
      <header className="dash-head">
        <h1>{t.driverTitle}</h1>
        <span className="badge">{t.simulated}</span>
        <span className="mono">{connected ? t.dashLive : t.dashReconnecting}</span>
      </header>
      {active.length === 0 && <p className="mono">{t.driverEmpty}</p>}
      {active.map((item) => <DriverCard key={item.id} item={item} />)}
    </main>
  );
}
