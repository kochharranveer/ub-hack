"use client";
import { useEffect, useRef, useState } from "react";
import type { CareSnapshot, Session, ExerciseReport } from "../contracts";
import type { RehabBridgeEvent } from "../contracts/checkin";
async function api(path: string, body?: unknown) {
  const r = await fetch("/rehab/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json();
  if (!out.ok) throw Error(out.error.message);
  return out.data;
}
export default function RehabWorkspace({onEvent,resumeSessionId,onAskPanda}:{onEvent?:(event:RehabBridgeEvent)=>void;resumeSessionId?:string;onAskPanda?:()=>void} = {}) {
  const [care, setCare] = useState<CareSnapshot | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [reports, setReports] = useState<ExerciseReport[]>([]),
    [status, setStatus] = useState(""),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true);
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
    onEvent?.({version:"1.0.0",type:"camera_status",status:"preview_off"});
  }
  useEffect(() => {
    mounted.current = true;
    void Promise.all([api("context"), api("sessions")])
      .then(([c, r]) => {
        setCare(c);
        setReports(r);
        if (resumeSessionId) void api("sessions/"+encodeURIComponent(resumeSessionId)).then((restored:Session)=>{
          if (!mounted.current) return;
          if (restored.report) onEvent?.({version:"1.0.0",type:"report_saved",sessionId:restored.id});
          else setSession(restored);
        }).catch((e)=>setStatus(e.message));
      })
      .catch((e) => setStatus(e.message));
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function startCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera needs HTTPS or localhost and a supported browser.");
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640 },
        audio: false,
      });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      setCamera(true);
      onEvent?.({version:"1.0.0",type:"camera_status",status:"preview_on"});
      setStatus(
        "Camera preview only. No pose model or measured repetitions yet.",
      );
    } catch (e) {
      stop();
      setStatus((e as Error).message);
    }
  }
  const startAttempt = useRef<{requestId:string;planId:string;planVersion:number;exerciseId:"demo-elbow"}|null>(null);
  async function begin() {
    setBusy(true);
    try {
      const c: CareSnapshot = await api("context");
      setCare(c);
      if (!c.plan) throw Error("An approved plan is required.");
      if (startAttempt.current && (startAttempt.current.planId!==c.plan.id || startAttempt.current.planVersion!==c.plan.version)) throw Error("Plan changed. Review context before starting a new attempt.");
      startAttempt.current ??= {requestId:crypto.randomUUID(),planId:c.plan.id,planVersion:c.plan.version,exerciseId:"demo-elbow"};
      const s:Session = await api("sessions", startAttempt.current);
      startAttempt.current=null;
      setSession(s);
      onEvent?.({version:"1.0.0",type:"session_started",sessionId:s.id,planId:s.planId,planVersion:s.planVersion});
      setStatus(
        "Demo session started. Simulation is separate from camera preview.",
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const finishAttempt = useRef<{
    requestId: string;
    report: ExerciseReport;
  } | null>(null);
  async function finish(simulated: boolean) {
    if (!session) return;
    setBusy(true);
    const report: ExerciseReport = {
      sessionId: session.id,
      patientId: session.patientId,
      planId: session.planId,
      planVersion: session.planVersion,
      exerciseId: session.exerciseId,
      startedAt: session.startedAt,
      endedAt: new Date().toISOString(),
      repetitions: simulated ? 3 : 0,
      rangeDegrees: simulated ? 90 : null,
      trackingQuality: simulated ? "simulated" : "unavailable",
      evidence: simulated ? "simulated" : "camera_estimated",
      terminationReason: simulated ? "completed" : "patient_stopped",
    };
    finishAttempt.current ??= { requestId: crypto.randomUUID(), report };
    try {
      await api("sessions/" + session.id + "/finish", finishAttempt.current);
      onEvent?.({version:"1.0.0",type:"report_saved",sessionId:session.id});
      setSession(null);
      finishAttempt.current = null;
      setReports(await api("sessions"));
      setStatus("Report saved. The care team has not acknowledged it yet.");
      stop();
    } catch (e) {
      setStatus((e as Error).message + " Reload history before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="eyebrow">Yuvraj / Exercise & vision</div>
      <h1>
        Move with context.
        <br />
        Save what happened.
      </h1>
      <p className="intro">
        This starter has camera preview and working session/report APIs. Pose
        estimation and clinical exercise validation are Yuvraj’s next build
        steps.
      </p>
      <p className="status" role="status">
        {status}
      </p>
      <div className="grid">
        <section className="card">
          <h2>Exercise workspace</h2>
          <span className="pill">
            Approved plan v{care?.plan?.version || "—"}
          </span>
          <span className="pill">Demonstration movement</span>
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Camera preview"
          />
          <button className="secondary" disabled={camera} onClick={startCamera}>
            Enable camera preview
          </button>
          <button className="secondary" onClick={stop}>
            Stop camera
          </button>
          <p className="muted">
            Frames stay in the browser. Preview does not count reps. If you feel
            discomfort, stop and contact your care team.
          </p>
          {onAskPanda ? <button type="button" className="secondary" onClick={onAskPanda}>Ask Panda for help</button> : <a className="button secondary" href="/">Ask Panda for help</a>}
        </section>
        <section>
          <div className="card">
            <h2>Session → report</h2>
            {!session ? (
              <button disabled={busy || !care?.plan} onClick={begin}>
                Start demo session
              </button>
            ) : (
              <>
                <small>Session {session.id}</small>
                <p>Live tracking is unavailable in this starter.</p>
                <button disabled={busy} onClick={() => finish(false)}>
                  Save interrupted / no measurements
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => finish(true)}
                >
                  Save simulated report · 3 reps
                </button>
              </>
            )}
            <p className="muted">
              Simulation verifies integration. Its evidence is explicitly
              “simulated”, never camera measured.
            </p>
          </div>
          <div className="card">
            <h2>Saved history</h2>
            {!reports.length && <p>No saved reports yet.</p>}
            {reports.map((r) => (
              <div className="row" key={r.sessionId}>
                <span className="pill">{r.evidence}</span>
                <p>
                  {r.repetitions} reps · {r.trackingQuality} · plan v
                  {r.planVersion}
                </p>
                <small>{r.sessionId}</small>
              </div>
            ))}
            <a className="button" href="/care">
              View clinician acknowledgement
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
