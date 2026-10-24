"use client";
import { useEffect, useRef, useState } from "react";
type Run = {
  id: string;
  at: string;
  status: string;
  kind: string;
  phase: string;
  error?: string;
  expiresAt?: string;
};
type Summary = {
  runs: Run[];
  schedulerActive: boolean;
  lastTick: string | null;
  health: {
    availability: number | null;
    coverage: number;
    checks: number;
    lastCheck: string | null;
  };
  alerts: {
    id: string;
    kind: string;
    at: string;
    delivered_at: string | null;
    data: { message: string };
  }[];
};
type Props = {
  request: (path: string, init?: RequestInit) => Promise<any>;
  onChanged: () => Promise<unknown>;
};
const when = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("en-US", { timeZone: "America/New_York" })
    : "None yet";
export default function OperationsPanel({ request, onChanged }: Props) {
  const [data, setData] = useState<Summary | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [restore, setRestore] = useState<Run | null>(null),
    [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    request("/api/operations")
      .then(setData)
      .catch((e) => setError(e.message));
    return () => {
      live.current = false;
    };
  }, []);
  const post = (input: unknown) =>
    request("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  const run = async (action: string, id?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const started =
        action === "resume"
          ? { id }
          : await post({ action, id, confirm: confirmation });
      setRestore(null);
      setConfirmation("");
      while (live.current) {
        const next: Summary = await post({ action: "step", id: started.id });
        if (!live.current) return;
        setData(next);
        const operation = next.runs.find((r) => r.id === started.id);
        if (!operation || operation.status === "failed")
          throw new Error(
            operation?.error || "The operation could not be completed.",
          );
        if (operation.status === "complete") {
          setMessage(
            `${operation.kind === "verify" ? "Backup verification" : operation.kind === "restore" ? "Restoration" : "Backup"} completed.`,
          );
          await onChanged();
          break;
        }
        setMessage(
          `Working: ${operation.phase}. Progress is saved between steps.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <div className="modal-body operations-panel">
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!data ? (
        <p>Loading workspace tools…</p>
      ) : (
        <>
          <h3>Backup and recovery</h3>
          <p>
            Completed backups retain purchasing records, audit history and
            attachments for 30 days.
          </p>
          <dl className="operations-summary">
            <dt>Hourly service</dt>
            <dd>{data.schedulerActive ? "Connected" : "Not connected"}</dd>
            <dt>Latest service check</dt>
            <dd>{when(data.lastTick)}</dd>
            <dt>Latest completed backup</dt>
            <dd>
              {when(
                data.runs.find(
                  (r) => r.kind === "backup" && r.status === "complete",
                )?.at,
              )}
            </dd>
          </dl>
          {!data.schedulerActive && (
            <p className="hint">
              Connect the operations service to enable hourly backups and
              monitoring while the app is closed. Manual backups work below.
            </p>
          )}
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void run("backup")}
          >
            {busy ? "Working…" : "Create backup now"}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                let cursor: string | null = null;
                let found = 0;
                do {
                  const result: { found: number; cursor: string | null } =
                    await post({ action: "discover", cursor });
                  found += result.found;
                  cursor = result.cursor;
                } while (cursor && live.current);
                setData(await request("/api/operations"));
                setMessage(`${found} stored backups checked.`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Find stored backups
          </button>
          <div className="operations-table">
            <table>
              <thead>
                <tr>
                  <th>Snapshot date (Eastern)</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.at)}</td>
                    <td>
                      {r.kind === "verify"
                        ? "Verification"
                        : r.kind === "restore"
                          ? "Restoration"
                          : "Backup"}
                    </td>
                    <td>
                      {r.status}
                      {r.error && <small>{r.error}</small>}
                    </td>
                    <td>
                      {r.status === "working" && (
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() => void run("resume", r.id)}
                        >
                          Continue
                        </button>
                      )}
                      {r.kind === "backup" &&
                        r.status === "complete" &&
                        (r.expiresAt ?? "") > new Date().toISOString() && (
                          <div className="row">
                            <button
                              className="text-btn"
                              disabled={busy}
                              onClick={() => void run("verify", r.id)}
                            >
                              Verify
                            </button>
                            <button
                              className="text-btn"
                              disabled={busy}
                              onClick={() => {
                                setRestore(r);
                                setConfirmation("");
                              }}
                            >
                              Restore
                            </button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {restore && (
            <section className="review-box">
              <h3>Restore the snapshot from {when(restore.at)}?</h3>
              <p>
                This replaces current purchasing records and attachments with
                the snapshot. A safety snapshot preserves the current records.
                Audit history and account security remain protected.
              </p>
              <label>
                Enter <code>RESTORE {restore.id}</code> to confirm
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <div className="row">
                <button className="btn" onClick={() => setRestore(null)}>
                  Cancel
                </button>
                <button
                  className="btn danger"
                  disabled={busy || confirmation !== `RESTORE ${restore.id}`}
                  onClick={() => void run("restore", restore.id)}
                >
                  Restore purchasing records
                </button>
              </div>
            </section>
          )}
          <h3>Availability and alerts</h3>
          <dl className="operations-summary">
            <dt>Monthly availability target</dt>
            <dd>99.9%, covering all three shifts</dd>
            <dt>Observed healthy checks</dt>
            <dd>
              {data.health.availability == null
                ? "No measurements yet"
                : `${data.health.availability.toFixed(3)}% of ${data.health.checks} recorded checks`}
            </dd>
            <dt>Monitoring coverage</dt>
            <dd>{data.health.coverage.toFixed(1)}%</dd>
            <dt>Latest health check</dt>
            <dd>{when(data.health.lastCheck)}</dd>
          </dl>
          <p className="hint">
            The independent monitor checks every 60 seconds and sends outage or
            backup failure alerts to the configured support destination. A
            connected monitor and alert destination are required.
          </p>
          {!!data.alerts.length && (
            <ul>
              {data.alerts.map((a) => (
                <li key={a.id}>
                  {when(a.at)}: {a.data.message}{" "}
                  {a.delivered_at
                    ? "Alert delivered."
                    : "Alert awaiting delivery."}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
