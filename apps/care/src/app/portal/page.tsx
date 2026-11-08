"use client";

import { useEffect, useMemo, useState } from "react";
import type { CareSnapshot } from "@contracts";
import type { PatientRecord, PatientRecordUpdate, PatientRow } from "@/server/patient-portal";
import styles from "./portal.module.css";

type Appointment = PatientRecord["appointments"][number];

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
  return { ...update, medications: update.medications.map((medication) => medication.trim()).filter(Boolean) };
}

function dateKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function displayDate(value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, options);
}

function statusLabel(status: PatientRow["status"]) {
  return status === "Needs review" ? "Needs action" : status;
}

export default function ClinicianPortal() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [snapshot, setSnapshot] = useState<CareSnapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [shownMonth, setShownMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [addingAppointment, setAddingAppointment] = useState(false);
  const [appointmentDraft, setAppointmentDraft] = useState({ date: dateKey(new Date()), time: "", clinician: "", purpose: "" });

  useEffect(() => {
    document.body.classList.add("care-doctor-theme");
    return () => document.body.classList.remove("care-doctor-theme");
  }, []);

  async function loadPatients() {
    setError("");
    const index = await api<{ patients: PatientRow[] }>("patients");
    setPatients(index.patients);
  }

  useEffect(() => {
    void loadPatients().catch((cause) => setError((cause as Error).message));
  }, []);

  useEffect(() => {
    if (!record) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dirty) setRecord(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [record, dirty]);

  async function openPatient(id: string) {
    if (dirty && !window.confirm("Discard unsaved changes and open another patient?")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await api("patients/" + encodeURIComponent(id) + "/select", "POST", {});
      const [patient, care] = await Promise.all([
        api<PatientRecord>("patients/" + encodeURIComponent(id)),
        api<CareSnapshot>("state"),
      ]);
      setRecord(patient);
      setSnapshot(care);
      const firstDate = patient.appointments[0]?.date || dateKey(new Date());
      setSelectedDate(firstDate);
      const [year, month] = firstDate.split("-").map(Number);
      setShownMonth(new Date(year, month - 1, 1));
      setDirty(false);
      setAddingAppointment(false);
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
      const saved = await api<PatientRecord>("patients/" + encodeURIComponent(record.id), "PATCH", updateFrom(record));
      setRecord(saved);
      setPatients((current) => current.map((row) => row.id === saved.id ? {
        ...row,
        name: saved.name,
        dateOfBirth: saved.dateOfBirth,
        primaryConcern: saved.primaryConcern,
        status: saved.status,
        nextAppointment: saved.nextAppointment,
      } : row));
      setDirty(false);
      setStatus("Saved to local demo data.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const appointments = record?.appointments || [];
  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1).getDay();
    const dayCount = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  }, [shownMonth]);
  const selectedAppointments = appointments.filter((appointment) => appointment.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const patientProgress = record && snapshot?.patientId === record.id ? snapshot : null;
  const completedTasks = patientProgress?.tasks.filter((task) => task.status === "completed").length || 0;
  const totalTasks = patientProgress?.tasks.length || 0;
  const actionCount = patients.filter((patient) => patient.status !== "Active").length;

  function addAppointment() {
    if (!record || !appointmentDraft.date || !appointmentDraft.time || !appointmentDraft.purpose.trim()) return;
    const next: Appointment = { id: crypto.randomUUID(), ...appointmentDraft, purpose: appointmentDraft.purpose.trim() };
    edit({ appointments: [...record.appointments, next] });
    setSelectedDate(next.date);
    const [year, month] = next.date.split("-").map(Number);
    setShownMonth(new Date(year, month - 1, 1));
    setAppointmentDraft({ date: next.date, time: "", clinician: "", purpose: "" });
    setAddingAppointment(false);
  }

  function removeAppointment(id: string) {
    if (!record) return;
    edit({ appointments: record.appointments.filter((appointment) => appointment.id !== id) });
  }

  function closeDrawer() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setRecord(null);
  }

  return (
    <div className={styles.portal}>
      <div className={styles.pageIntro}>
        <div>
          <div className="eyebrow">Care · Doctor workspace</div>
          <h1>Patient overview</h1>
          <p className={styles.subtitle}>Review progress and manage follow-up for your patients.</p>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNumber}>{actionCount}</span>
          <span>patients need attention</span>
        </div>
      </div>

      {status && <p className={styles.success} role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      <section className={styles.listPanel} aria-labelledby="patients-heading">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="patients-heading">Patients</h2>
            <p>{patients.length} local records · patients needing action are shown first</p>
          </div>
          <button className="secondary" onClick={() => void loadPatients().catch((cause) => setError((cause as Error).message))} disabled={busy}>Refresh</button>
        </div>
        <div className={styles.patientList}>
          {patients.map((patient) => (
            <button key={patient.id} type="button" className={styles.patientRow} onClick={() => void openPatient(patient.id)} disabled={busy}>
              <span className={styles.patientAvatar} aria-hidden="true">{patient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
              <span className={styles.patientRowBody}>
                <span className={styles.patientName}>{patient.name}</span>
                <span className={styles.patientConcern}>{patient.primaryConcern || "No primary concern entered"}</span>
                <span className={styles.patientMeta}>Next appointment: {patient.nextAppointment ? displayDate(patient.nextAppointment.date) + " · " + patient.nextAppointment.time : "Not scheduled"}</span>
              </span>
              <span className={styles.statusBadge + " " + (patient.status === "Needs review" ? styles.statusAlert : patient.status === "Follow-up due" ? styles.statusDue : styles.statusActive)}>
                {patient.status !== "Active" && <span className={styles.statusDot} aria-hidden="true" />}{statusLabel(patient.status)}
              </span>
              <span className={styles.rowArrow} aria-hidden="true">›</span>
            </button>
          ))}
          {!patients.length && !error && <p className={styles.empty}>No local patient records yet.</p>}
        </div>
      </section>

      {record && (
        <>
          <button className={styles.backdrop} aria-label="Close patient details" onClick={closeDrawer} />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className={styles.drawerHeader}>
              <div>
                <div className="eyebrow">Patient details · synthetic record</div>
                <h2 id="drawer-title">{record.name}</h2>
                <p>{record.primaryConcern || "No primary concern entered"} · DOB {displayDate(record.dateOfBirth)}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeDrawer} aria-label="Close patient details">×</button>
            </div>

            <div className={styles.drawerBody}>
              <section className={styles.drawerSection} aria-labelledby="progress-heading">
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionNumber}>01</span><h3 id="progress-heading">Current progress</h3></div>
                  {patientProgress && <span className={styles.progressCount}>{completedTasks}/{totalTasks} complete</span>}
                </div>
                {patientProgress?.plan ? (
                  <>
                    <div className={styles.planSummary}><span className={styles.planDot} />Approved plan · v{patientProgress.plan.version}</div>
                    {patientProgress.tasks.map((task) => (
                      <div className={styles.progressRow} key={task.id}>
                        <span className={styles.taskMark + " " + (task.status === "completed" ? styles.taskComplete : "")}>{task.status === "completed" ? "✓" : ""}</span>
                        <span>{task.title}</span><small>{task.status === "completed" ? "Done" : "In progress"}</small>
                      </div>
                    ))}
                    {patientProgress.plan.instructions.filter((item) => item.audience === "clinician").map((item) => <p className={styles.clinicianItem} key={item.id}><strong>Doctor review:</strong> {item.text}</p>)}
                  </>
                ) : (
                  <div className={styles.emptyState}><strong>No linked plan progress yet</strong><span>There is no approved plan connected to this local record.</span></div>
                )}
                {record.goals.length > 0 && <div className={styles.goals}><span className={styles.fieldLabel}>Care goals</span>{record.goals.map((goal) => <p key={goal}>{goal}</p>)}</div>}
              </section>

              <section className={styles.drawerSection} aria-labelledby="medications-heading">
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionNumber}>02</span><h3 id="medications-heading">Medications</h3></div>
                  <span className={styles.sectionHint}>Doctor editable</span>
                </div>
                <p className={styles.sectionDescription}>Review the current list. Confirm details with the patient before changing a medication.</p>
                <div className={styles.medicationList}>
                  {record.medications.map((medication, index) => (
                    <div className={styles.medicationRow} key={record.id + "-med-" + index}>
                      <span className={styles.medicationIcon} aria-hidden="true">Rx</span>
                      <input aria-label={"Medication " + (index + 1)} value={medication} onChange={(event) => edit({ medications: record.medications.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} />
                      <button type="button" className={styles.iconButton} onClick={() => edit({ medications: record.medications.filter((_, itemIndex) => itemIndex !== index) })} aria-label={"Remove medication " + (index + 1)}>×</button>
                    </div>
                  ))}
                  {!record.medications.length && <div className={styles.emptyState}><strong>No medications listed</strong><span>Add one after confirming the current list.</span></div>}
                </div>
                <button type="button" className={styles.addButton} onClick={() => edit({ medications: [...record.medications, ""] })}>＋ Add medication</button>
              </section>

              <section className={styles.drawerSection + " " + styles.calendarSection} aria-labelledby="calendar-heading">
                <div className={styles.sectionHeading}>
                  <div><span className={styles.sectionNumber}>03</span><h3 id="calendar-heading">Appointments</h3></div>
                  <button type="button" className={styles.addButtonCompact} onClick={() => { setAppointmentDraft({ date: selectedDate, time: "", clinician: "", purpose: "" }); setAddingAppointment(true); }}>＋ Add appointment</button>
                </div>
                <div className={styles.calendar}>
                  <div className={styles.calendarHeader}>
                    <button type="button" className={styles.monthButton} onClick={() => setShownMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                    <strong>{shownMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
                    <button type="button" className={styles.monthButton} onClick={() => setShownMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
                  </div>
                  <div className={styles.calendarGrid} role="grid" aria-label="Appointment calendar">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => <span className={styles.weekday} key={weekday}>{weekday}</span>)}
                    {calendarCells.map((day, index) => {
                      if (!day) return <span className={styles.blankDay} key={"blank-" + index} />;
                      const date = dateKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day));
                      const hasAppointment = appointments.some((appointment) => appointment.date === date);
                      return <button type="button" role="gridcell" aria-label={displayDate(date) + (hasAppointment ? ", appointment scheduled" : "")} aria-pressed={selectedDate === date} className={styles.dayButton + " " + (selectedDate === date ? styles.daySelected : "") + " " + (hasAppointment ? styles.dayHasAppointment : "")} key={date} onClick={() => setSelectedDate(date)}>{day}{hasAppointment && <span className={styles.calendarDot} />}</button>;
                    })}
                  </div>
                </div>
                <div className={styles.agendaHeading}><strong>{displayDate(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</strong><span>{selectedAppointments.length} scheduled</span></div>
                {selectedAppointments.map((appointment) => (
                  <div className={styles.appointmentCard} key={appointment.id}>
                    <span className={styles.appointmentTime}>{appointment.time}</span>
                    <div><strong>{appointment.purpose}</strong><span>{appointment.clinician || "Clinician not assigned"}</span></div>
                    <button type="button" className={styles.removeAppointment} onClick={() => removeAppointment(appointment.id)}>Remove</button>
                  </div>
                ))}
                {!selectedAppointments.length && <div className={styles.emptyAgenda}>No appointment scheduled for this day.</div>}
                {addingAppointment && (
                  <div className={styles.appointmentForm}>
                    <div className={styles.formTitle}><strong>New appointment</strong><button type="button" className={styles.iconButton} onClick={() => setAddingAppointment(false)} aria-label="Cancel adding appointment">×</button></div>
                    <label>Date<input type="date" value={appointmentDraft.date} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, date: event.target.value })} /></label>
                    <label>Time<input type="time" value={appointmentDraft.time} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, time: event.target.value })} /></label>
                    <label>Clinician<input type="text" value={appointmentDraft.clinician} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, clinician: event.target.value })} placeholder="e.g. Dr. Avery" /></label>
                    <label>Purpose<input type="text" value={appointmentDraft.purpose} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, purpose: event.target.value })} placeholder="e.g. Follow-up" /></label>
                    <button type="button" onClick={addAppointment} disabled={!appointmentDraft.date || !appointmentDraft.time || !appointmentDraft.purpose.trim()}>Add to calendar</button>
                  </div>
                )}
              </section>
            </div>

            <div className={styles.drawerFooter}>
              <span className={styles.saveMessage}>{dirty ? "Unsaved changes" : status || "All changes saved"}</span>
              <button className="secondary" type="button" onClick={closeDrawer}>Close</button>
              <button type="button" onClick={() => void save()} disabled={!dirty || busy}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
