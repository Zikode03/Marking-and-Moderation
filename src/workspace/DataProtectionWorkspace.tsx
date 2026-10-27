import { useCallback, useEffect, useState } from "react";
import { request } from "../auth/session";

type Batch = {
  id: string;
  createdAt: string;
  lastActivity: string;
  eligible: boolean;
  token: string;
  reason: string;
  held: boolean;
  trainingAuthorised: boolean;
};
type Status = {
  retentionDays: number | null;
  usedBytes: number;
  quotaBytes: number;
  batches: Batch[];
  limit: number;
};
export default function DataProtectionWorkspace() {
  const [status, setStatus] = useState<Status>();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) =>
      setStatus(await request<Status>("/api/data-protection", { signal })),
    [],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load data protection.",
        );
    });
    return () => controller.abort();
  }, [load]);
  const batch = status?.batches.find((row) => row.id === selected);
  async function act(action: string, body: object) {
    if (!batch) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ message: string }>(
        `/api/data-protection/batches/${batch.id}/${action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setNotice(result.message);
      setConfirmation("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The operation failed. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel security-panel"
      aria-labelledby="data-protection-heading"
    >
      <h2 id="data-protection-heading">Learner data protection</h2>
      <p>
        Keep academic records for the institution’s approved period. Place a
        hold on scripts needed for an appeal or investigation. Training export
        requires a separate authorisation.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {!status ? (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load().catch((cause) => setError(String(cause)))}
        >
          Load protection settings
        </button>
      ) : (
        <>
          <p>
            <strong>Document storage:</strong>{" "}
            {(status.usedBytes / 1048576).toFixed(1)} MB of{" "}
            {(status.quotaBytes / 1073741824).toFixed(1)} GB.{" "}
            <strong>Retention:</strong>{" "}
            {status.retentionDays
              ? `${status.retentionDays} days after the last activity on a fully approved batch`
              : "Not configured. Set an approved period in Institution management → Settings."}
          </p>
          <label>
            Batch reference
            <select
              value={selected}
              disabled={busy}
              onChange={(event) => {
                setSelected(event.target.value);
                setConfirmation("");
                setReason("");
              }}
            >
              <option value="">Select a batch</option>
              {status.batches.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id} · {new Date(row.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Showing up to {status.limit} oldest batches. Candidate names and
            answers are omitted from this screen.
          </p>
          {batch && (
            <div className="security-section">
              <p>
                <strong>{batch.reason}</strong>
              </p>
              <p>
                Last activity: {new Date(batch.lastActivity).toLocaleString()}.
                Appeal hold: {batch.held ? "active" : "none"}. Training export:{" "}
                {batch.trainingAuthorised ? "authorised" : "blocked"}.
              </p>
              <label>
                Decision reference or reason
                <input
                  value={reason}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <p className="muted">
                Use an approval or case reference. Do not enter learner names,
                answers or medical details.
              </p>
              <div className="data-protection-actions">
                <button
                  className="secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void act("hold", { enabled: !batch.held, reason })
                  }
                >
                  {batch.held
                    ? "Release appeal hold"
                    : "Protect with appeal hold"}
                </button>
                <button
                  className="secondary"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void act("training-authorisation", {
                      enabled: !batch.trainingAuthorised,
                      reason,
                    })
                  }
                >
                  {batch.trainingAuthorised
                    ? "Revoke training export"
                    : "Authorise training export"}
                </button>
              </div>
              {batch.eligible && (
                <>
                  <h3>Delete expired batch</h3>
                  <p>
                    This permanently deletes its documents, script results,
                    review history and linked training examples from active
                    storage. Backups expire under the separate backup policy.
                    Export authorised results before deletion if the institution
                    must retain them.
                  </p>
                  <label>
                    Type DELETE EXPIRED BATCH
                    <input
                      value={confirmation}
                      autoComplete="off"
                      disabled={busy}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={busy || confirmation !== "DELETE EXPIRED BATCH"}
                    onClick={() =>
                      void act("purge", {
                        previewToken: batch.token,
                        confirmation,
                      })
                    }
                  >
                    Permanently delete expired batch
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
