"use client";
import { useEffect, useRef, useState } from "react";
import { useCompanion, type Phase } from "./use-companion";
import styles from "./panda.module.css";
import { approvedMedicationTasks } from "./today-actions";
const labels: Record<Phase, string> = {
  ready: "Ready when you are", listening: "Listening… tap to stop", thinking: "Thinking… tap to stop",
  confirmation: "Review your action below", saving: "Saving… tap to stop waiting",
  speech_loading: "Preparing audio… tap to stop", speaking: "Speaking… tap to stop",
};
function PandaFace() {
  return <svg viewBox="0 0 120 108" aria-hidden="true">
    <circle cx="29" cy="28" r="18" fill="var(--ink)" /><circle cx="91" cy="28" r="18" fill="var(--ink)" />
    <ellipse cx="60" cy="59" rx="48" ry="43" fill="var(--card)" stroke="var(--line)" strokeWidth="2" />
    <ellipse cx="40" cy="56" rx="13" ry="17" transform="rotate(25 40 56)" fill="var(--ink)" />
    <ellipse cx="80" cy="56" rx="13" ry="17" transform="rotate(-25 80 56)" fill="var(--ink)" />
    <circle cx="43" cy="54" r="4" fill="var(--card)" /><circle cx="77" cy="54" r="4" fill="var(--card)" />
    <path d="M54 74 Q60 70 66 74 Q60 83 54 74 M60 80 Q52 89 48 82 M60 80 Q68 89 72 82" fill="var(--ink)" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
export default function Panda() {
  const c = useCompanion();
  const [typing, setTyping] = useState(false);
  const [panel, setPanel] = useState<"voice" | "emergency" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const active = !["ready", "confirmation"].includes(c.phase);
  const medicines = approvedMedicationTasks(c.context);
  const plan = c.context?.plan;
  const engine = c.context?.aiEngine === "gemini" ? "Gemini" : c.context?.aiEngine === "openai" ? "OpenAI" : "Demo rules · no LLM";
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
    if (!panel && dialog.current?.open) dialog.current?.close();
  }, [panel]);
  useEffect(() => { if (typing) composer.current?.focus(); }, [typing]);
  function talk() {
    if (active) { c.stop(); return; }
    if (!c.canMic) { setTyping(true); composer.current?.focus(); return; }
    if (!c.micConsent) { setPanel("voice"); return; }
    setTyping(true); c.mic();
  }
  function help() {
    if (active) c.stop();
    c.setText("I would like help from my care team. ");
    setTyping(true);
    composer.current?.focus();
  }
  function scheduleCheckIn() {
    if (active) c.stop();
    c.setText("I would like help scheduling a check-in with my care team.");
    setTyping(true);
    composer.current?.focus();
  }
  return <div className={styles.app}>
    <div className={styles.topbar}>
      <button type="button" className={styles.emergency} onClick={() => setPanel("emergency")}><span aria-hidden="true">＋</span> Emergency</button>
      <a className={styles.brand} href="/" aria-label="Panda home">panda<span>care</span></a>
      <button type="button" className={styles.careTeam} onClick={help}><span aria-hidden="true">↗</span> Care team</button>
    </div>
    <div className={styles.mode} role="status"><span className={styles.dot} />
      {c.context ? c.context.mode === "fixture" ? "Fixture demo · actions are dry runs" : "Connected apps · synthetic demo" : "Loading your care context…"}
    </div>
    <section className={styles.greeting} aria-labelledby="welcome-title">
      <h1 id="welcome-title">{c.context?.patient ? "Hey, " + c.context.patient.firstName + "." : "Hey there."}</h1>
      <p>Let’s take today one step at a time.</p>
    </section>
    <section className={styles.today} aria-labelledby="today-title">
      <div className={styles.sectionHeading}><h2 id="today-title">Today</h2><span className="pill">{plan ? "Approved plan · v" + plan.version : "No approved plan"}</span></div>
      <ol className={styles.tasks}>
        <li>
          <span className={styles.taskNumber} aria-hidden="true">1</span>
          <div><strong>Take medicines</strong>
            {medicines.length ? <ul className={styles.medicines}>{medicines.map(task => <li key={task.id}>
              <div><span>{task.title}</span><small>{task.status === "completed" ? "Completed · patient-reported" : "Exactly as listed in your approved plan"}</small></div>
              {task.status === "pending" && <button type="button" className={styles.reportButton} disabled={c.busy} onClick={() => void c.send("Confirm task " + task.id)}>Report done</button>}
            </li>)}</ul> : <small>{!c.context ? "Loading medicine details…" : "Medicine details pending in your approved plan."}</small>}
          </div>
          {!medicines.length && <a className={styles.actionLink} href="/care" onClick={c.stop}>View plan</a>}
        </li>
        <li>
          <span className={styles.taskNumber} aria-hidden="true">2</span>
          <div><strong>Exercise</strong><small>Open your demonstration exercise workspace.</small></div>
          <a className={styles.actionLink} href="/rehab" onClick={c.stop}>Start ↗</a>
        </li>
        <li>
          <span className={styles.taskNumber} aria-hidden="true">3</span>
          <div><strong>Schedule check-in</strong><small>Request a time with your care team.<br />A request is not a booked appointment.</small></div>
          <button type="button" className={styles.reportButton} disabled={c.busy || !plan || plan.status !== "approved"} onClick={scheduleCheckIn}>Request</button>
        </li>
      </ol>
      <button className={styles.refresh} type="button" disabled={c.refreshing || c.busy} onClick={() => void c.refresh()}>{c.refreshing ? "Refreshing…" : "↻ Refresh care status"}</button>
    </section>
    <section className={styles.voiceStage} aria-label="Talk to Panda">
      <button className={styles.talk} type="button" data-active={active} aria-label={active ? "Stop current voice activity" : "Talk to Panda"} onClick={talk}>
        <span className={styles.face}><PandaFace /></span>
        <span className={styles.talkHint}>{c.phase === "listening" ? "I’m listening" : active ? "Tap to stop" : "Tap to talk to"}</span>
        <strong>panda</strong>
        <span className={styles.micIcon} aria-hidden="true">{active ? "■" : "◉"}</span>
      </button>
      <p className={styles.voiceStatus} role="status" aria-live="polite">{labels[c.phase]}</p>
      <small className={styles.engine}>{engine}{c.context && !c.context.aiConfigured ? " · needs setup" : ""}</small>
      {!c.canMic && <p className={styles.inputHint}>Speech isn’t supported here. Tap Panda or the keyboard to type.</p>}
      <button type="button" className={styles.privacyButton} onClick={() => setPanel("voice")}>Voice permissions & privacy</button>
    </section>
    {c.notice && <p className={styles.notice} role="status">{c.notice}</p>}
    {c.error && <div className={styles.error} role="alert"><strong>Let’s try that again.</strong><p>{c.error}</p><small>Retry the same confirmation if its result is uncertain.</small></div>}
    {c.reply && <section className={styles.response} aria-label="Latest response">
      <div className={styles.sectionHeading}><strong>Panda</strong><small>{c.reply.engine === "demo_rules" ? "Demo rules" : c.reply.engine} · {c.reply.mode}</small></div>
      <p className={styles.reply}>{c.reply.message}</p>
      {c.reply.sourceRefs?.length ? <small>Approved sources: {c.reply.sourceRefs.join(" · ")}</small> : null}
      {c.reply.proposalId && <div className={styles.confirmation}>
        <strong>Your choice. Your confirmation.</strong><p>{c.reply.mode === "fixture" ? "Dry run only. No Care record will change." : "Confirm to send this action to Care."} This proposal expires after 5 minutes.</p>
        <button type="button" disabled={c.busy} onClick={() => void c.confirm()}>{c.reply.mode === "fixture" ? "Confirm dry run" : "Confirm this action"}</button>
        <button type="button" className="secondary" disabled={c.busy} onClick={() => void c.cancel()}>Dismiss proposal</button>
      </div>}
      {c.reply.navigation && <a className="button" href={c.reply.navigation} onClick={c.stop}>Open exercise app →</a>}
      <div className={styles.playback}>
        <button type="button" className="secondary" disabled={c.busy || (c.context?.ttsEngine === "elevenlabs" && (!c.speechConsent || c.reply.message.length > 4000)) || (c.context?.ttsEngine !== "elevenlabs" && !c.canSpeak)} onClick={() => void c.speak()}>▷ Read aloud · {c.context?.ttsEngine === "elevenlabs" ? "ElevenLabs" : "browser"}</button>
        {c.context?.ttsEngine === "elevenlabs" && <button type="button" className="secondary" disabled={c.busy || !c.canSpeak} onClick={() => void c.speak(true)}>Use browser speech</button>}
        {c.context?.ttsEngine === "elevenlabs" && !c.context.ttsConfigured && <small>ElevenLabs needs server configuration. Choose browser speech when supported.</small>}
        {c.context?.ttsEngine === "elevenlabs" && c.reply.message.length > 4000 && <small>Use browser speech for this longer reply.</small>}
      </div>
    </section>}
    {typing && <form id="text-composer" className={styles.composer} onSubmit={e => { e.preventDefault(); void c.send(); }}>
      <div className={styles.sectionHeading}><label htmlFor="message">Type to Panda</label><button type="button" className={styles.closeComposer} onClick={() => setTyping(false)} aria-label="Hide keyboard input">×</button></div>
      <textarea ref={composer} id="message" value={c.text} maxLength={2000} rows={3} placeholder="What’s on your mind?" onChange={e => c.setText(e.target.value)} aria-describedby="input-hint" />
      <div className={styles.composeActions}><small id="input-hint">Review your words.<br />Nothing is sent until you choose Send.</small><button type="submit" disabled={c.busy || !c.text.trim()}>Send ↑</button></div>
    </form>}
    <div className={styles.quickActions} aria-label="Suggested questions">
      <button type="button" className="secondary" disabled={c.busy} onClick={() => void c.send("Show my plan")}>Read my plan</button>
      <button type="button" className="secondary" disabled={c.busy} onClick={() => void c.send("Open exercise")}>Start exercise ↗</button>
    </div>
    {c.context?.help.length ? <section className={styles.helpStatus}><h2>Care team requests</h2>
      {c.context.help.slice(-3).map(item => <div key={item.id}><p>“{item.quote}”</p><span className="pill">{item.status === "acknowledged" ? "Acknowledged by clinician" : "Recorded · awaiting acknowledgement"}</span></div>)}
      <a href="/care" onClick={c.stop}>Check care status →</a>
    </section> : null}
    {c.history.length > 0 && <details className={styles.history}><summary>Conversation · {c.history.length} saved turns</summary>
      <ol>{c.history.map(turn => <li key={turn.requestId}><span className="eyebrow">You</span><p>{turn.text}</p><span className="eyebrow">Panda</span><p>{turn.reply.message}</p></li>)}</ol>
      <small>Last 50 turns within 24 hours. Expired records are removed on next access or maintenance.</small>
    </details>}
    <p className={styles.disclosure}>Synthetic patient · Demo identities<br />Help is recorded for separate acknowledgement. No emergency dispatch or automatic treatment changes.</p>
    <nav className={styles.dock} aria-label="Companion navigation">
      <a href="/care" onClick={c.stop}><span aria-hidden="true">▤</span><div>My plan<small>Plan & checklist</small></div></a>
      <button type="button" aria-expanded={typing} aria-controls="text-composer" onClick={() => { setTyping(value => !value); if (!typing) composer.current?.focus(); }}><span aria-hidden="true">⌨</span><div>Keyboard<small>Type instead</small></div></button>
    </nav>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); setPanel(null); }}>
      <button type="button" className={styles.dialogClose} aria-label="Close dialog" onClick={() => setPanel(null)}>×</button>
      {panel === "emergency" ? <>
        <span className="eyebrow">Emergency information</span><h2 id="dialog-title">Panda cannot call for help.</h2>
        <p>This demonstration is not monitored and cannot contact emergency services. If you need urgent help, contact your local emergency services directly.</p>
        <p>Care requests here are recorded for later acknowledgement. They are not an emergency response.</p>
        <button type="button" onClick={() => setPanel(null)}>Understood</button>
      </> : <>
        <span className="eyebrow">You’re in control</span><h2 id="dialog-title">Choose how we talk.</h2>
        <label><input type="checkbox" checked={c.micConsent} onChange={e => c.changeMicConsent(e.target.checked)} /> Allow browser speech recognition. Your browser may send audio to its speech service.</label>
        {!c.canMic && <p>Speech recognition is unavailable in this browser or connection. The keyboard works with the same actions.</p>}
        {c.context?.ttsEngine === "elevenlabs" && <label><input type="checkbox" checked={c.speechConsent} onChange={e => c.changeSpeechConsent(e.target.checked)} /> Allow response text to be sent to ElevenLabs when I choose Read aloud.</label>}
        <p>{engine} routes messages using your approved plan and current tasks. Microphone transcripts are drafts for you to review. Voice stops when you hide or leave this page.</p>
        <button type="button" disabled={!c.canMic || !c.micConsent || c.busy} onClick={() => { setPanel(null); setTyping(true); c.mic(); }}>Start listening</button>
        <button type="button" className="secondary" onClick={() => { setPanel(null); setTyping(true); }}>Use keyboard</button>
      </>}
    </dialog>
  </div>;
}
