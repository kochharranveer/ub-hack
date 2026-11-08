"use client";
import { useEffect, useState } from "react";
import type { CareSnapshot, ExerciseReport } from "@contracts";
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
    [draftEdits, setDraftEdits] = useState<Record<string, { text: string; audience: "patient" | "clinician" }>>({}),
    [fhirPlans, setFhirPlans] = useState<Array<{ id: string; title: string; status: string; preview: string; period: { start?: string; end?: string } | null }>>([]),
    [selectedFhirPlan, setSelectedFhirPlan] = useState(""),
    [reports, setReports] = useState<ExerciseReport[]>([]),
    [fhir, setFhir] = useState<{ connected: boolean; baseUrl: string; fhirVersion: string; supportsCarePlan: boolean; patientConfigured: boolean } | null>(null),
    [status, setStatus] = useState(""),
    [reportError, setReportError] = useState(""),
    [busy, setBusy] = useState(false);
  const clinician = true;
  async function load() {
    setData(await api("state"));
    try {
      setFhir(await api("fhir/status"));
    } catch {
      setFhir(null);
    }
    try {
      const plans = await api("fhir/plans");
      setFhirPlans(plans);
      setSelectedFhirPlan((current) => plans.some((plan: { id: string }) => plan.id === current) ? current : plans[0]?.id || "");
    } catch {
      setFhirPlans([]);
      setSelectedFhirPlan("");
    }
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
        Turn patient record facts into a cited draft, review it, and approve only
        the actions that belong on the patient checklist.
      </p>
      <a className="button" href="/care/portal">Open doctor portal</a>
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
                <h2>1. EHR care plan</h2>
                <p className="muted">
                  Sync the configured synthetic patient’s active care plan from FHIR. Each import stays a draft until a clinician reviews and approves it.
                </p>
                {fhir ? (
                  <p className="muted">FHIR {fhir.fhirVersion} · {fhir.baseUrl} · {fhir.patientConfigured ? "Synthetic patient configured" : "Set FHIR_PATIENT_ID to enable sync"}</p>
                ) : (
                  <p className="muted">FHIR connection is unavailable. Check the server settings and try again.</p>
                )}
                {fhirPlans.length > 0 && (
                  <label>
                    Choose an active FHIR plan
                    <select value={selectedFhirPlan} onChange={(event) => setSelectedFhirPlan(event.target.value)}>
                      {fhirPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}{plan.period?.end ? ` (ends ${plan.period.end})` : ""}</option>)}
                    </select>
                  </label>
                )}
                <button
                  disabled={busy || !fhir?.patientConfigured || !fhir.supportsCarePlan || !selectedFhirPlan}
                  onClick={() => act("fhir/sync", { carePlanId: selectedFhirPlan })}
                >
                  Sync care plan from FHIR
                </button>
                {data.drafts.map((d) => (
                  <div className="row" key={d.id}>
                    <span className="pill">AI-assisted draft v{d.version} · clinician review required</span>
                    {d.summary && (
                      <div>
                        <p><strong>AI record summary:</strong> {d.summary}</p>
                        {d.summaryEvidence?.map((evidence) => (
                          <blockquote key={evidence.sourceRef}>
                            “{evidence.quote}”<br /><small>{evidence.sourceRef}</small>
                          </blockquote>
                        ))}
                      </div>
                    )}
                    {d.dataWarnings?.map((warning) => <p className="muted" key={warning}>Data note: {warning}</p>)}
                    {d.clinicalContext?.length ? (
                      <details>
                        <summary>Patient context used ({d.clinicalContext.length} facts)</summary>
                        {d.clinicalContext.map((fact) => (
                          <p key={fact.sourceRef}>
                            <strong>{fact.label}:</strong> {fact.value}{fact.observedAt ? ` · ${fact.observedAt}` : ""}
                            <br /><small>{fact.sourceRef}</small>
                          </p>
                        ))}
                      </details>
                    ) : <p className="muted">No additional condition, observation, medication, or goal data was available from this FHIR server.</p>}
                    <h3>Proposed items</h3>
                    <p className="muted">These are proposed actions. After approval, patient items become checklist tasks. Medication details are managed separately in the patient record and shown read-only in the patient portal.</p>
                    {d.instructions.map((i) => {
                      const edit = draftEdits[i.id] || { text: i.text, audience: i.audience || "patient" };
                      return (
                        <div className="row" key={i.id}>
                          <label>
                            Proposed action
                            <textarea
                              value={edit.text}
                              onChange={(event) => setDraftEdits((current) => ({ ...current, [i.id]: { ...edit, text: event.target.value } }))}
                              rows={2}
                              aria-label="Review and edit proposed plan item"
                            />
                          </label>
                          <label>
                            After approval, send to
                            <select
                              value={edit.audience}
                              onChange={(event) => setDraftEdits((current) => ({ ...current, [i.id]: { ...edit, audience: event.target.value as "patient" | "clinician" } }))}
                            >
                              <option value="patient">Patient checklist</option>
                              <option value="clinician">Doctor review only</option>
                            </select>
                          </label>
                          {i.rationale && <p><strong>Why AI included this:</strong> {i.rationale}</p>}
                          {i.evidence?.map((evidence) => (
                            <blockquote key={evidence.sourceRef}>
                              “{evidence.quote}”<br /><small>{evidence.sourceRef}</small>
                            </blockquote>
                          ))}
                        </div>
                      );
                    })}
                    <button
                      disabled={busy}
                      onClick={() => act("plans/" + d.id + "/approve", {
                        expectedCurrentVersion: data.plan?.version || 0,
                        edits: d.instructions.map((item) => ({
                          id: item.id,
                          ...(draftEdits[item.id] || { text: item.text, audience: item.audience || "patient" }),
                        })),
                      })}
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
              {clinician && data.plan?.summary && (
                <div>
                  <p><strong>Record summary:</strong> {data.plan.summary}</p>
                  {data.plan.summaryEvidence?.map((evidence) => (
                    <blockquote key={evidence.sourceRef}>“{evidence.quote}”<br /><small>{evidence.sourceRef}</small></blockquote>
                  ))}
                  {data.plan.clinicalContext?.length ? (
                    <details>
                      <summary>Clinical context reviewed ({data.plan.clinicalContext.length})</summary>
                      {data.plan.clinicalContext.map((fact) => <p key={fact.sourceRef}><strong>{fact.label}:</strong> {fact.value}<br /><small>{fact.sourceRef}</small></p>)}
                    </details>
                  ) : null}
                </div>
              )}
              {clinician && data.plan?.instructions.filter((item) => item.audience === "clinician").map((item) => (
                <div className="row" key={item.id}>
                <span className="pill">Doctor review only</span>
                  <p>{item.text}</p>
                  {item.rationale && <p><strong>Why:</strong> {item.rationale}</p>}
                  {item.evidence?.map((evidence) => <blockquote key={evidence.sourceRef}>“{evidence.quote}”<br /><small>{evidence.sourceRef}</small></blockquote>)}
                </div>
              ))}
              {data.plan?.instructions.filter((i) => (i.audience || "patient") === "patient").map((i) => (
                <div className="row" key={i.id}>
                  <p>{i.text}</p>
                  <small>Source: {i.sourceRef}</small>
                </div>
              ))}
              <h3>Patient checklist status</h3>
              {data.tasks.map((t) => (
                <div key={t.id} className="row">
                  <p>{t.title}</p>
                  <span className="pill">
                    {t.status} · {t.evidence}
                  </span>
                </div>
              ))}
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
