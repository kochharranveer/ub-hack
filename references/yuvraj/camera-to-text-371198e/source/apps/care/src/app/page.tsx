"use client";
import { useEffect, useState } from "react";
import type { CareSnapshot, ExerciseReport } from "@contracts";
const sample =
  "FICTIONAL DEMONSTRATION PLAN\nReview your discharge instructions with the demonstration care team.\nTry the demo exercise only to test the software.";
async function api(path: string, body?: unknown) {
  const res = await fetch("/care/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json();
  if (!out.ok) throw Error(out.error.message);
  return out.data;
}
export default function Care() {
  const [data, setData] = useState<CareSnapshot | null>(null),
    [reports, setReports] = useState<ExerciseReport[]>([]),
    [text, setText] = useState(sample),
    [status, setStatus] = useState(""),
    [reportError, setReportError] = useState(""),
    [busy, setBusy] = useState(false),
    [clinician, setClinician] = useState(true);
  async function load() {
    setData(await api("state"));
    try {
      setReports(await api("reports"));
      setReportError("");
    } catch (e) {
      setReportError((e as Error).message);
    }
  }
  useEffect(() => {
    void load().catch((e) => setStatus(e.message));
  }, []);
  async function act(path: string, body: object) {
    setBusy(true);
    try {
      await api(path, { requestId: crypto.randomUUID(), ...body });
      await load();
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="eyebrow">Asmita / Care management</div>
      <h1>
        A clear plan.
        <br />A visible next step.
      </h1>
      <p className="intro">
        Import instructions, review them, and approve the patient plan. The care
        team acknowledges requests and saved exercise reports here.
      </p>
      <button className="secondary" onClick={() => setClinician(!clinician)}>
        {clinician ? "Show patient plan" : "Show clinician workspace"}
      </button>
      <button
        className="secondary"
        onClick={() => void load().catch((e) => setStatus(e.message))}
      >
        Refresh
      </button>
      <p role="status" className="status">
        {status}
      </p>
      {!data ? (
        <p>Loading care data…</p>
      ) : (
        <div className="grid">
          <section>
            {clinician && (
              <div className="card">
                <h2>1. Import & review</h2>
                <p className="muted">
                  Text-file import works. PDF/OCR extraction is a planned
                  extension. Every imported line remains a draft until reviewed.
                </p>
                <label>
                  Choose a .txt file
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 20000) {
                          setStatus("Use a text file under 20 KB.");
                          return;
                        }
                        setText(await file.text());
                      }
                    }}
                  />
                </label>
                <label>
                  Source instructions
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() => act("plans/import", { sourceText: text })}
                >
                  Create draft
                </button>
                {data.drafts.map((d) => (
                  <div className="row" key={d.id}>
                    <span className="pill">Draft v{d.version}</span>
                    {d.instructions.map((i) => (
                      <p key={i.id}>
                        {i.text}
                        <br />
                        <small>{i.sourceRef}</small>
                      </p>
                    ))}
                    <button
                      disabled={busy}
                      onClick={() =>
                        act("plans/" + d.id + "/approve", {
                          expectedCurrentVersion: data.plan?.version || 0,
                        })
                      }
                    >
                      Approve reviewed plan
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <h2>2. Approved patient plan</h2>
              <span className="pill">
                Version {data.plan?.version || "none"}
              </span>
              {data.plan?.instructions.map((i) => (
                <div className="row" key={i.id}>
                  <p>{i.text}</p>
                  <small>Source: {i.sourceRef}</small>
                </div>
              ))}
              <h3>Patient-reported checklist</h3>
              {data.tasks.map((t) => (
                <div key={t.id} className="row">
                  <p>{t.title}</p>
                  <span className="pill">
                    {t.status} · {t.evidence}
                  </span>
                  {t.status === "pending" && (
                    <button
                      disabled={busy}
                      className="secondary"
                      onClick={() =>
                        act("tasks/" + t.id + "/confirm", {
                          expectedRevision: t.revision,
                          evidence: "patient_reported",
                        })
                      }
                    >
                      Confirm I completed this
                    </button>
                  )}
                </div>
              ))}
              <a className="button" href="/rehab">
                Open exercise app
              </a>
              <a className="button secondary" href="/">
                Talk to Panda
              </a>
            </div>
          </section>
          <section>
            <div className="card">
              <h2>3. Human follow-through</h2>
              <p className="muted">
                A recorded request is separate from clinician acknowledgement.
                This demo does not contact emergency services.
              </p>
              {!data.help.length && (
                <p>No help requests yet. Ask Panda to request help.</p>
              )}
              {data.help.map((h) => (
                <div className="row" key={h.id}>
                  <p>“{h.quote}”</p>
                  <span className="pill">{h.status}</span>
                  {h.acknowledgedBy && <small>By {h.acknowledgedBy}</small>}
                  {clinician && h.status === "open" && (
                    <button
                      disabled={busy}
                      onClick={() => act("help/" + h.id + "/ack", {})}
                    >
                      Acknowledge request
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="card">
              <h2>4. Exercise reports</h2>
              <p className="muted">
                Report measurements belong to Yuvraj’s app. Acknowledgements
                belong to this care app.
              </p>
              {reportError && <p className="error">{reportError}</p>}
              {!reports.length && !reportError && <p>No saved reports yet.</p>}
              {reports.map((r) => {
                const ack = data.acknowledgements.find(
                  (a) => a.sessionId === r.sessionId,
                );
                return (
                  <div className="row" key={r.sessionId}>
                    <span className="pill">{r.evidence}</span>
                    <p>
                      {r.repetitions} reps · plan v{r.planVersion} ·{" "}
                      {r.trackingQuality}
                    </p>
                    <small>Session {r.sessionId}</small>
                    <p>
                      {ack
                        ? "Acknowledged by " + ack.by
                        : "Awaiting acknowledgement"}
                    </p>
                    {clinician && !ack && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          act("reports/" + r.sessionId + "/ack", {})
                        }
                      >
                        Acknowledge report
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
