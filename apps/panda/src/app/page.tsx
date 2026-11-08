"use client";
import { useEffect, useRef, useState } from "react";
import { useCompanion } from "./use-companion";
import { approvedMedicationTasks } from "./today-actions";
import styles from "./panda.module.css";
import RehabWorkspace from "../../../../packages/rehab-bridge/Workspace";
function PandaFace() {
  return <svg viewBox="0 0 120 108" aria-hidden="true"><circle cx="29" cy="28" r="18" fill="var(--ink)" /><circle cx="91" cy="28" r="18" fill="var(--ink)" /><ellipse cx="60" cy="59" rx="48" ry="43" fill="var(--card)" stroke="var(--line)" strokeWidth="2" /><ellipse cx="40" cy="56" rx="13" ry="17" transform="rotate(25 40 56)" fill="var(--ink)" /><ellipse cx="80" cy="56" rx="13" ry="17" transform="rotate(-25 80 56)" fill="var(--ink)" /><circle cx="43" cy="54" r="4" fill="var(--card)" /><circle cx="77" cy="54" r="4" fill="var(--card)" /><path d="M54 74 Q60 70 66 74 Q60 83 54 74 M60 80 Q52 89 48 82 M60 80 Q68 89 72 82" fill="var(--ink)" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" /></svg>;
}
function MicIcon() {
  return <svg width="18" height="22" viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M6 10v3a6 6 0 0 0 12 0v-3M12 19v5M8 24h8" /></svg>;
}
type Panel="medicines"|"memory"|"emergency"|null;
type Mode="idle"|"voice"|"text";
export default function Panda() {
  const c=useCompanion();
  const [panel,setPanel]=useState<Panel>(null),[mode,setMode]=useState<Mode>("idle");
  const [exerciseOpen,setExerciseOpen]=useState(false),[directDraft,setDirectDraft]=useState(false);
  const [remembered,setRemembered]=useState<Awaited<ReturnType<typeof c.rememberedContext>>|null>(null);
  const [memoryError,setMemoryError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null),composer=useRef<HTMLTextAreaElement>(null);
  const medicines=approvedMedicationTasks(c.context),plan=c.context?.plan,firstName=c.context?.patient?.firstName;
  const active=!["ready","confirmation"].includes(c.phase);
  const engine=c.reply?.engine==="checkin_workflow" ? "Guided check-in" : c.context?.aiEngine==="gemini" ? "Gemini" : c.context?.aiEngine==="openai" ? "OpenAI" : "Demo rules";
  useEffect(()=>{
    if(panel&&!dialog.current?.open)dialog.current?.showModal();
    if(!panel&&dialog.current?.open)dialog.current?.close();
  },[panel]);
  useEffect(()=>{if(mode==="text")composer.current?.focus();},[mode,exerciseOpen]);
  useEffect(()=>{if(!c.text)setDirectDraft(false);},[c.text]);
  useEffect(()=>{
    if(c.reply?.checkin?.stage==="exercise"&&c.reply.navigation==="/rehab")setExerciseOpen(true);
    if(c.reply?.checkin&&["exercise_review","pain_check"].includes(c.reply.checkin.stage))setMode(current=>current==="idle"?"voice":current);
  },[c.reply]);
  function talk() {
    setMode("voice");
    if(exerciseOpen&&c.checkin&&c.checkin.stage!=="complete")c.listen();
    else void c.activateVoice();
  }
  function keyboard() {
    c.stop();
    if(mode==="text"){setMode("idle");return;}
    setMode("text");
    if(c.checkin?.stage!=="complete")void c.beginCheckin(false);
  }
  function prepare(text:string) {c.stop();c.setText(text);setDirectDraft(true);setMode("text");}
  async function memoryPanel() {
    setPanel("memory");setMemoryError("");
    try{setRemembered(await c.rememberedContext());}catch(e){setMemoryError((e as Error).message);}
  }
  const voiceHeading=c.phase==="permission"?"Allow microphone access":c.phase==="listening"?"I’m listening":c.phase==="thinking"?"One moment":c.phase==="speaking"?"Panda is speaking":c.phase==="speech_loading"?"Preparing your reply":"Panda is here";
  function confirmations() {
    return c.reply?.proposalId ? <div className={styles.inlineConfirm}><button type="button" disabled={c.busy} onClick={()=>void c.confirm()}>{c.reply.mode==="fixture"?"Confirm dry run":"Confirm action"}</button><button type="button" className="secondary" disabled={c.busy} onClick={()=>void c.cancel()}>Dismiss</button></div>:null;
  }
  function replyText() {
    return <div className={styles.inlineReply} role="status" aria-live="polite">
      {c.busy&&<strong>{c.phase==="saving"?"Saving your choice…":"Thinking…"}</strong>}
      {c.error?<p className="error">{c.error}</p>:c.reply?<p>{c.reply.message}</p>:<p>What’s on your mind?</p>}
      {c.reply?.sourceRefs?.length?<small>Sources: {c.reply.sourceRefs.join(" · ")}</small>:null}
    </div>;
  }
  function interaction() {
    if(mode==="text")return <div className={styles.inlineText} aria-label="Text conversation">
      {replyText()}{confirmations()}
      <form onSubmit={event=>{event.preventDefault();void c.send(c.text,directDraft);}}>
        <label className={styles.srOnly} htmlFor="message">Your message</label>
        <textarea ref={composer} id="message" rows={2} value={c.text} maxLength={2000} placeholder="Type to Panda…" onChange={event=>c.setText(event.target.value)} />
        <div className={styles.inlineSend}><small>{engine} · {c.checkin?.stage?.replaceAll("_"," ")??"patient context"}</small><button type="submit" disabled={c.busy||!c.text.trim()}>Send ↑</button></div>
      </form>
    </div>;
    if(mode==="voice")return <div className={styles.inlineVoice} data-active={active} aria-label="Voice conversation">
      <div className={styles.inlineOrb} aria-hidden="true" />
      <h2>{voiceHeading}{c.phase==="listening"&&firstName?", "+firstName+"…":""}</h2>
      {replyText()}{confirmations()}
      <div className={styles.inlineVoiceControls}>
        <button type="button" className="secondary" aria-label="End voice conversation" onClick={()=>{c.stop();setMode("idle");}}>×</button>
        <button type="button" aria-label={active?"Mute conversation":"Resume conversation"} onClick={()=>active?c.stop():c.listen()}>{active?"■":<MicIcon />}</button>
      </div>
      <small className={styles.inlineCaption}>{engine} · {c.context?.ttsEngine==="elevenlabs"?"ElevenLabs":"browser voice"}</small>
    </div>;
    return <><button type="button" className={styles.panda} onClick={talk} aria-label="Talk to Panda"><span className={styles.face}><PandaFace /></span><small>Tap to talk to</small><strong>panda</strong><span className={styles.micMark} aria-hidden="true">◉</span></button>
      {c.reply?.proposalId?<button type="button" className={styles.textButton} onClick={()=>setMode("text")}>Review pending action →</button>:<p className={styles.privacyCaption}>Voice uses browser speech{c.context?.sttConfigured?" or ElevenLabs transcription":""}.<br/>Check-in answers are remembered for this patient.</p>}
    </>;
  }
  return <div className={styles.app}>
    <div className={styles.topbar}><button type="button" onClick={()=>setPanel("emergency")}>＋ Emergency</button><a className={styles.brand} href="/" aria-label="Panda home">panda<span>care</span></a><button type="button" onClick={()=>prepare("I would like help from my care team. ")}>↗ Care team</button></div>
    <div className={styles.mode} role="status"><span/>{c.context?c.context.mode==="fixture"?"Synthetic demo · dry runs only":"Connected apps · synthetic demo":c.error?"Care context unavailable":"Loading care context…"}</div>
    <div className={styles.greeting}><h1>{firstName?"Hey, "+firstName+".":"Hey there."}</h1><p>Let’s take today one step at a time. <button type="button" className={styles.textButton} onClick={()=>void memoryPanel()}>My context</button></p></div>
    <section className={styles.today} aria-labelledby="today-title"><div className={styles.sectionHeading}><h2 id="today-title">Today</h2><button type="button" className={styles.refresh} disabled={c.refreshing||c.busy} onClick={()=>void c.refresh()} aria-label="Refresh care status">↻ <span>Plan v{plan?.version??"—"}</span></button></div>
      <ol className={styles.actions}>
        <li><span className={styles.number}>1</span><div><strong>Take medicines</strong><small title={medicines[0]?.title}>{medicines.length?medicines[0].title:"Medicine details pending"}{medicines.length>1?" · +"+(medicines.length-1)+" more":""}</small></div><button type="button" onClick={()=>setPanel("medicines")}>View</button></li>
        <li><span className={styles.number}>2</span><div><strong>Exercise</strong><small>Demonstration elbow movement</small></div><button type="button" disabled={c.busy||!plan} onClick={talk}>Start ↗</button></li>
        <li><span className={styles.number}>3</span><div><strong>Follow-up check-in</strong><small>Doctor availability pending</small></div><button type="button" disabled title="Doctor availability is not connected yet">Pending</button></li>
      </ol>
    </section>
    <section className={styles.center} aria-label="Panda interaction">{!exerciseOpen&&interaction()}</section>
    <nav className={styles.dock} aria-label="Companion navigation"><a href="/care" onClick={c.stop}><span aria-hidden="true">▤</span> My plan</a><button type="button" aria-label={mode==="text"?"Use microphone mode":"Use keyboard"} onClick={keyboard}>{mode==="text"?<MicIcon />:<span aria-hidden="true">⌨</span>}{mode==="text"?"Microphone":"Keyboard"}</button></nav>
    {exerciseOpen&&<section className={styles.exerciseShell} aria-label="Exercise with Panda">
      <div className={styles.exerciseHeader}><strong>Exercise · Panda stays with you</strong><button type="button" className="secondary" onClick={()=>{c.stop();setExerciseOpen(false);}}>Exit exercise</button></div>
      <RehabWorkspace onEvent={c.exerciseFeedback} resumeSessionId={c.reply?.exerciseSessionId} onAskPanda={talk}/>
      <div className={styles.exerciseInline}><div className={styles.exerciseInlineTop}><strong>Panda · {c.checkin?.stage?.replaceAll("_"," ")}</strong><button type="button" className="secondary" onClick={keyboard}>{mode==="text"?<MicIcon/>:"⌨"}</button><button type="button" className="secondary" onClick={()=>void c.retryFeedback()}>Sync</button></div>{interaction()}</div>
    </section>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="dialog-title" onCancel={event=>{event.preventDefault();setPanel(null);}}>
      <button type="button" className={styles.dialogClose} aria-label="Close dialog" onClick={()=>setPanel(null)}>×</button>
      {panel==="emergency"?<><span className="eyebrow">Emergency information</span><h2 id="dialog-title">Panda cannot call for help.</h2><p>This demonstration is not monitored and cannot contact emergency services. For urgent help, contact your local emergency services directly.</p><p>Care requests are recorded for separate acknowledgement.</p></>:
        panel==="memory"?<><span className="eyebrow">Patient-scoped memory</span><h2 id="dialog-title">What Panda remembers</h2><p>Check-in answers remain until explicitly deleted. Plans and exercise reports remain in their own apps.</p>{memoryError&&<p role="alert">{memoryError}</p>}{!remembered?<p>Loading…</p>:<><small>{remembered.totalEvents} remembered entries · current patient only</small>{remembered.events.map(entry=><div className={styles.memoryEntry} key={entry.id}><small>{entry.kind.replaceAll("_"," ")} · {entry.at}</small><p>{entry.quote}</p><small>{entry.source.replaceAll("_"," ")}</small></div>)}{!remembered.events.length&&<p>No check-in answers yet.</p>}</>}</>:
        <><span className="eyebrow">Approved plan · v{plan?.version??"—"}</span><h2 id="dialog-title">Your medicines</h2>{medicines.length?medicines.map(task=><div className={styles.medicine} key={task.id}><p>{task.title}</p><small>{task.status==="completed"?"Completed · patient-reported":"Exact text from the approved demonstration plan"}</small>{task.status==="pending"&&<button type="button" disabled={c.busy} onClick={()=>{setPanel(null);setMode("text");void c.send("Confirm task "+task.id,true);}}>Report done</button>}</div>):<p>Medicine details are not available in your approved plan yet.</p>}<a className="button secondary" href="/care" onClick={c.stop}>Open full plan</a><small className={styles.finePrint}>Synthetic examples only.</small></>}
    </dialog>
  </div>;
}
