"use client";

import { useEffect, useState } from "react";
import type { PatientRecord, PatientRecordUpdate, PatientRow } from "@/server/patient-portal";
import styles from "./portal.module.css";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/care/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const envelope = await response.json();
  if (!response.ok || !envelope.ok) throw new Error(envelope.error?.message || "Request failed");
  return envelope.data as T;
}

function updateFrom(record: PatientRecord): PatientRecordUpdate {
  const { id: _id, lastVisit: _lastVisit, updatedAt: _updatedAt, ...update } = record;
  return update;
}

function lines(value: string[]) {
  return value.join("\n");
}

function fromLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function appointmentLabel(appointment: PatientRow["nextAppointment"]) {
  if (!appointment) return "Not scheduled";
  const date = new Date(`${appointment.date}T12:00:00`);
  const label = Number.isNaN(date.getTime()) ? appointment.date : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${label}${appointment.time ? ` · ${appointment.time}` : ""}`;
}

export default function ClinicianPortal() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setError("");
    const index = await api<{ patients: PatientRow[]; selectedPatientId: string }>("patients");
    setPatients(index.patients);
    const nextId = index.patients.some((patient) => patient.id === index.selectedPatientId)
      ? index.selectedPatientId
      : index.patients[0]?.id;
    if (!nextId) {
      setRecord(null);
      setSelectedId("");
      return;
    }
    setSelectedId(nextId);
    setRecord(await api<PatientRecord>(`patients/${encodeURIComponent(nextId)}`));
    setDirty(false);
  }

  useEffect(() => {
    void load().catch((cause) => setError((cause as Error).message));
  }, []);

  async function choosePatient(id: string) {
    if (id === selectedId) return;
    if (dirty && !window.confirm("Discard your unsaved changes and switch patients?")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api(`patients/${encodeURIComponent(id)}/select`, "POST");
      const selected = await api<PatientRecord>(`patients/${encodeURIComponent(id)}`);
      setSelectedId(id);
      setRecord(selected);
      setDirty(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function edit(patch: Partial<PatientRecord>) {
    setRecord((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
    setStatus("");
  }

  async function save() {
    if (!record) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await api<PatientRecord>(`patients/${encodeURIComponent(record.id)}`, "PATCH", updateFrom(record));
      setRecord(saved);
      setDirty(false);
      setPatients((current) => current.map((row) => row.id === saved.id ? {
        id: saved.id,
        name: saved.name,
        dateOfBirth: saved.dateOfBirth,
        primaryConcern: saved.primaryConcern,
        status: saved.status,
        nextAppointment: saved.nextAppointment,
      } : row));
      setStatus("Patient record saved locally.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const updateAppointment = (patch: Partial<NonNullable<PatientRecord["nextAppointment"]>>) => {
    if (!record) return;
    edit({ nextAppointment: { date: "", time: "", clinician: "", purpose: "", ...record.nextAppointment, ...patch } });
  };

  return (
    <div className={styles.portal}>
      <div className={styles.topline}>
        <div>
          <div className="eyebrow">Care · Clinician portal</div>
          <h1>Patient records</h1>
          <p className={styles.subtitle}>Select a patient to review and update the context used for their care experience.</p>
        </div>
        <div className={styles.topActions}>
          <span className={styles.localBadge}>Local demo data</span>
          <a className="button secondary" href="/care">Care plan review</a>
        </div>
      </div>

      {status && <p className={styles.success} role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-labelledby="patient-list-heading">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="patient-list-heading">Patients</h2>
              <p>{patients.length} local records</p>
            </div>
            <button className="secondary" onClick={() => void load().catch((cause) => setError((cause as Error).message))} disabled={busy}>Refresh</button>
          </div>
          <div className={styles.patientList}>
            {patients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                className={`${styles.patientRow} ${patient.id === selectedId ? styles.patientRowSelected : ""}`}
                onClick={() => void choosePatient(patient.id)}
                disabled={busy}
                aria-current={patient.id === selectedId ? "true" : undefined}
              >
                <span className={styles.patientAvatar} aria-hidden="true">{patient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
                <span className={styles.patientRowBody}>
                  <span className={styles.patientName}>{patient.name}</span>
                  <span className={styles.patientConcern}>{patient.primaryConcern || "No primary concern entered"}</span>
                  <span className={styles.patientMeta}>{patient.status} · Next: {appointmentLabel(patient.nextAppointment)}</span>
                </span>
                <span className={`${styles.statusDot} ${patient.status === "Needs review" ? styles.statusDotAlert : patient.status === "Follow-up due" ? styles.statusDotDue : ""}`} aria-hidden="true" />
              </button>
            ))}
            {!patients.length && !error && <p className={styles.empty}>No local patient records yet.</p>}
          </div>
        </section>

        <section className={styles.detailPanel} aria-labelledby="patient-details-heading">
          {!record ? (
            <div className={styles.empty}>Choose a patient record to see details.</div>
          ) : (
            <>
              <div className={styles.detailHeading}>
                <div>
                  <p className={styles.recordKicker}>Patient details · synthetic record</p>
                  <h2 id="patient-details-heading">{record.name}</h2>
                  <p className={styles.patientMeta}>Last visit: {record.lastVisit || "Not recorded"} · Updated: {new Date(record.updatedAt).toLocaleString()}</p>
                </div>
                <label className={styles.statusField}>
                  Record status
                  <select value={record.status} onChange={(event) => edit({ status: event.target.value as PatientRecord["status"] })}>
                    <option>Active</option>
                    <option>Follow-up due</option>
                    <option>Needs review</option>
                  </select>
                </label>
              </div>

              <div className={styles.formGrid}>
                <label>Full name<input value={record.name} onChange={(event) => edit({ name: event.target.value })} /></label>
                <label>Date of birth<input type="date" value={record.dateOfBirth} onChange={(event) => edit({ dateOfBirth: event.target.value })} /></label>
                <label>Phone<input type="tel" value={record.phone} onChange={(event) => edit({ phone: event.target.value })} /></label>
                <label className={styles.wide}>Primary concern<input value={record.primaryConcern} onChange={(event) => edit({ primaryConcern: event.target.value })} /></label>
              </div>

              <div className={styles.sectionTitle}><h3>Care context</h3><span>Editable patient information</span></div>
              <div className={styles.formGrid}>
                <label>Allergies <small>One per line</small><textarea rows={3} value={lines(record.allergies)} onChange={(event) => edit({ allergies: fromLines(event.target.value) })} /></label>
                <label>Current medications <small>One per line; include schedule only if confirmed</small><textarea rows={3} value={lines(record.medications)} onChange={(event) => edit({ medications: fromLines(event.target.value) })} /></label>
                <label>Care goals <small>One per line</small><textarea rows={3} value={lines(record.goals)} onChange={(event) => edit({ goals: fromLines(event.target.value) })} /></label>
                <label>Patient instructions <small>One per line</small><textarea rows={3} value={lines(record.patientInstructions)} onChange={(event) => edit({ patientInstructions: fromLines(event.target.value) })} /></label>
              </div>

              <div className={styles.sectionTitle}><h3>Next appointment</h3><span>Local planning details</span></div>
              <div className={styles.formGrid}>
                <label>Date<input type="date" value={record.nextAppointment?.date || ""} onChange={(event) => updateAppointment({ date: event.target.value })} /></label>
                <label>Time<input type="text" placeholder="e.g. 10:30 AM" value={record.nextAppointment?.time || ""} onChange={(event) => updateAppointment({ time: event.target.value })} /></label>
                <label>Clinician<input value={record.nextAppointment?.clinician || ""} onChange={(event) => updateAppointment({ clinician: event.target.value })} /></label>
                <label>Purpose<input value={record.nextAppointment?.purpose || ""} onChange={(event) => updateAppointment({ purpose: event.target.value })} /></label>
              </div>
              <button className="secondary" type="button" onClick={() => edit({ nextAppointment: null })}>Clear appointment</button>

              <div className={styles.formGrid}>
                <label>Care alert <small>Patient-safe context for the assistant</small><textarea rows={2} value={record.careAlert} onChange={(event) => edit({ careAlert: event.target.value })} /></label>
                <label>Doctor-only notes <small>Excluded from the patient assistant context</small><textarea rows={2} value={record.clinicianNotes} onChange={(event) => edit({ clinicianNotes: event.target.value })} /></label>
              </div>

              <div className={styles.footerActions}>
                <p className={styles.patientMeta}>{dirty ? "Unsaved changes" : "All changes saved"}</p>
                <button onClick={() => void save()} disabled={busy || !dirty}>{busy ? "Saving…" : "Save patient record"}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
