import { useCallback, useEffect, useState } from "react";
import type { Case } from "../../../../server/src/types/case";

/** Password check and the live case feed, shared by the dashboard and the driver view. */
export function useCases() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [timelineTick, setTimelineTick] = useState<{ caseId: string; tick: number }>({ caseId: "", tick: 0 });

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
    source.addEventListener("timeline", (event) => {
      const { caseId } = JSON.parse(event.data) as { caseId: string };
      setTimelineTick((current) => ({ caseId, tick: current.tick + 1 }));
    });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      source.close();
      clearInterval(clock);
    };
  }, [authed]);

  const login = useCallback(async (secret: string) => {
    const response = await fetch("/api/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    }).catch(() => null);
    setLoginError(!response?.ok);
    if (response?.ok) setAuthed(true);
  }, []);

  return { authed, login, loginError, cases, connected, now, timelineTick };
}

export function caseAction(caseId: string, action: "accept" | "status", body: object) {
  return fetch(`/api/cases/${caseId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
