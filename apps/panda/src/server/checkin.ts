import { randomUUID } from "node:crypto";
import { StartCheckinSchema, AnswerCheckinSchema, ContinueCheckinSchema, ExerciseFeedbackSchema,
  type CheckinSession, type PatientMemoryEvent, type MemoryKind } from "../../../../packages/contracts/checkin";
import type { CareSnapshot } from "../../../../packages/contracts/care";
import type { VoiceReply } from "../../../../packages/contracts/voice";
import { ReportSchema, SessionSchema, type Session } from "../../../../packages/contracts/rehab";
import { DomainError } from "../../../../packages/platform/json-store";
import { getCare, callPeer, connected } from "../../../../packages/platform/peers";
import { approvedMedicationTasks } from "../app/today-actions";
import { PatientMemoryRepository, patientMemory, fingerprint, type MemoryTransaction } from "./patient-memory";
import { voice, type voiceService } from "./service";
import {dialogueTurn,medicationLanguage,worseningConcern,type DialogueModel,type Move,type Decision} from "./conversation";
import {demoPatientProfile} from "../../../../packages/contracts/fixtures";

type Voice = ReturnType<typeof voiceService>;
type Dependencies = {
  snapshot: () => Promise<CareSnapshot>;
  exerciseSession: (id: string) => Promise<Session>;
  mode: "fixture" | "connected";
};
export function polarity(text: string): "yes" | "no" | "unknown" {
  const value = text.toLowerCase().trim();
  if (/\b(not sure|don't know|do not know|maybe|unsure)\b/.test(value)) return "unknown";
  if (/\b(no|nope|not|haven't|didn't|dont|don't|unable|not yet)\b/.test(value)) return "no";
  if (/^(yes|yeah|yep|sure|ready|i have|i did|i took|already taken|taken|done)\b/.test(value)) return "yes";
  return "unknown";
}
function medicationTasks(care: CareSnapshot) {
  return approvedMedicationTasks({plan:care.plan,tasks:care.tasks,help:care.help,mode:"fixture",
    aiEngine:"demo_rules",aiConfigured:true,ttsEngine:"browser",ttsConfigured:true});
}
export function checkinService(
  memory: PatientMemoryRepository = patientMemory,
  assistant: Voice = voice,
  bridge: Dependencies = {
    snapshot: getCare,
    exerciseSession: async id => SessionSchema.parse(await callPeer("rehab","sessions/"+encodeURIComponent(id))),
    mode: connected() ? "connected" : "fixture",
  },
  now = Date.now,
  model:DialogueModel=dialogueTurn,
) {
  const time = () => new Date(now()).toISOString();
  function event(tx: MemoryTransaction, s: CheckinSession, requestId: string, kind: MemoryKind, quote: string,
    source: PatientMemoryEvent["source"] = "patient_report", metadata: Record<string,unknown> = {}) {
    tx.append({id:requestId+":"+kind,patientId:s.patientId,kind,quote,at:time(),source,
      metadata:{checkinId:s.id,planId:s.planId,planVersion:s.planVersion,...metadata}});
  }
  function save(tx: MemoryTransaction,s: CheckinSession) { s.updatedAt=time(); tx.saveSession(s); }
  function reply(s: CheckinSession,message: string,extra: Partial<VoiceReply> = {}): VoiceReply {
    return {mode:bridge.mode,engine:"checkin_workflow",message,checkin:{id:s.id,stage:s.stage},
      ...(s.exerciseSessionId ? {exerciseSessionId:s.exerciseSessionId} : {}),...extra};
  }
  function remaining(s:CheckinSession) {
    return s.concernPending ? "wellbeing_followup" : s.medicationIndex<s.medicationTaskIds.length ? "medications" : s.foodKnown ? "readiness" : "food";
  }
  function question(s: CheckinSession,care: CareSnapshot): VoiceReply {
    const task=care.tasks.find(task=>task.id===s.medicationTaskIds[s.medicationIndex]);
    const medicine=task&&medicationLanguage(task,medicationTasks(care),s.medicationDetailsRequired?.includes(task.id));
    const first=demoPatientProfile(care.patientId)?.firstName;
    const subject=/\belbow\b/i.test(care.plan?.sourceText||"")?"your elbow":"you";
    if(s.stage==="greeting")return reply(s,`Hey${first?", "+first:""}, it's Panda. How ${subject==="you"?"are you feeling":"is "+subject+" feeling"} today?`);
    if(s.stage==="wellbeing_followup")return reply(s,s.concernPending?"Let's put the routine questions aside. What would you like to talk through?":"Can you tell me a little more about how it feels?");
    if(s.stage==="medications"&&medicine&&task&&s.medicationDetailsRequired?.includes(task.id))return reply(s,"Your plan now lists "+medicine.exact+". Have you taken that updated dose?");
    if(s.stage==="medications")return reply(s,medicine?`Have you taken ${medicine.spoken} ${medicine.precise?"as listed in your plan":medicine.daypart?"":"today"}?`:"What have you had to eat today?");
    if(s.stage==="medication_confirmation"||s.stage==="help_confirmation")return reply(s,"Would you like me to record that?",{proposalId:s.pendingProposalId});
    if(s.stage==="food")return reply(s,"What have you had to eat today?");
    if(s.stage==="readiness")return reply(s,"How are you feeling about doing a little exercise?");
    if(s.stage==="exercise")return reply(s,"Let's open your exercise. I'll stay here with you.",{navigation:"/rehab"});
    if(s.stage==="exercise_review")return reply(s,"How did your arm feel during that?");
    if(s.stage==="pain_check")return reply(s,"Did you notice any pain or discomfort?");
    return reply(s,"We've covered the check-in. What's on your mind?");
  }
  function utterance(tx:MemoryTransaction,s:CheckinSession,id:string,text:string,role:"user"|"assistant") {
    tx.appendDialogue({id:id+":"+role,checkinId:s.id,role,text,at:time()});
  }
  function presented(s:CheckinSession,base:VoiceReply,d:Decision):VoiceReply {
    return {...base,engine:d.engine,checkin:{id:s.id,stage:s.stage},...(base.proposalId?{speechText:d.response,confirmationPrompt:["respond","med_yes","care_request","care_concern","pain_report"].includes(d.move)}:{message:d.response})};
  }
  function reports(tx:MemoryTransaction) {
    const topics:MemoryKind[]=["wellbeing","food","medication_report","pain_review","exercise_report","exercise_review","exercise_readiness"];
    const values=[...topics.flatMap(kind=>tx.events(kind,2)),...tx.events(undefined,10)];
    return [...new Map(values.map(value=>[value.id,value])).values()];
  }
  async function say(tx:MemoryTransaction,s:CheckinSession,care:CareSnapshot,id:string,base:VoiceReply,goal:string,text?:string,signal?:AbortSignal) {
    const d=await model({care,session:s,history:tx.dialogue(),memory:reports(tx),text,moves:[{id:"respond",goal,fallback:base.message}]},signal);
    return presented(s,base,d);
  }
  function requireSession(tx: MemoryTransaction,id: string,care: CareSnapshot) {
    const s=tx.session(id);
    if (!s) throw new DomainError("NOT_FOUND","This check-in is not available for the current patient.",404);
    if (!["exercise","exercise_review","pain_check","help_confirmation","complete"].includes(s.stage) &&
      (care.plan?.id !== s.planId || care.plan?.version !== s.planVersion))
      throw new DomainError("CONFLICT","The approved plan changed. Start a refreshed check-in before continuing.");
    return s;
  }
  async function once(raw: {requestId:string}, payload: unknown, signal:AbortSignal|undefined, fn: (tx: MemoryTransaction,care: CareSnapshot)=>Promise<VoiceReply>|VoiceReply) {
    const care=await bridge.snapshot();
    if (!care.plan || care.plan.status !== "approved") throw new DomainError("CONFLICT","An approved plan is required for this check-in.");
    return memory.transaction(care.patientId,async tx => {
      const previous=tx.receipt(raw.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint(payload)) throw new DomainError("CONFLICT","Request ID reused with different check-in input.");
        return previous.result as VoiceReply;
      }
      signal?.throwIfAborted();
      const result=await fn(tx,care);
      signal?.throwIfAborted();
      const silent=(payload as {op?:string;event?:{type:string}}).op==="exercise-feedback"&&((payload as {event:{type:string}}).event.type!=="report_saved"||["help_confirmation","wellbeing_followup"].includes(result.checkin?.stage||""));
      if(result.checkin&&!silent){const session=tx.session(result.checkin.id);if(session){
        const input=payload as {text?:string};if(input.text)utterance(tx,session,raw.requestId,input.text,"user");
        utterance(tx,session,raw.requestId,result.speechText||result.message,"assistant");
      }}
      tx.saveReceipt(raw.requestId,payload,result);
      return result;
    });
  }
  function nextMedication(tx: MemoryTransaction,s: CheckinSession,care: CareSnapshot) {
    s.medicationIndex++;
    s.pendingProposalId=undefined;
    s.stage=remaining(s);
    save(tx,s);
    return question(s,care);
  }
  function rememberReport(tx:MemoryTransaction,s:CheckinSession,captured:Session) {
    if(!captured.report)throw new DomainError("CONFLICT","Rehab has not saved this report yet.");
    const report=ReportSchema.parse(captured.report);
    if(report.planId!==s.planId||report.planVersion!==s.planVersion)throw new DomainError("CONFLICT","Report plan does not match the captured check-in.");
    event(tx,s,"report:"+captured.id,"exercise_report","Rehab report summary: "+report.repetitions+" repetitions; range "+(report.rangeDegrees===null?"unavailable":report.rangeDegrees+" degrees")+"; evidence: "+report.evidence+"; tracking: "+report.trackingQuality+"; ended: "+report.terminationReason+".","rehab_report",{sessionId:captured.id,sourceRoute:"/rehab/api/sessions/"+captured.id,evidence:report.evidence,trackingQuality:report.trackingQuality});
    return report;
  }
  return {
    async start(raw: unknown,signal?:AbortSignal) {
      const v=StartCheckinSchema.parse(raw);
      return once(v,{op:"start",...v},signal,async(tx,care) => {
        let s=tx.latestSession();
        const changed=s && (s.planId !== care.plan!.id || s.planVersion !== care.plan!.version);
        const tooOld=s && now()-Date.parse(s.updatedAt)>24*60*60*1000;
        if (!s || s.stage==="complete" || changed || tooOld) {
          const meds=medicationTasks(care).filter(t=>t.status==="pending");
          const baseline=tx.events("medication_context",200);
          const required=meds.filter(task=>{const current=medicationLanguage(task,meds);const old=baseline.find(e=>e.metadata.name===current.key);return Boolean(old&&old.metadata.title!==task.title);}).map(t=>t.id);
          s={id:randomUUID(),patientId:care.patientId,planId:care.plan!.id,planVersion:care.plan!.version,
            stage:"greeting",foodKnown:tx.events("food").some(e=>time().slice(0,10)===e.at.slice(0,10)),concernPending:care.help.some(h=>h.status==="open"&&worseningConcern(h.quote)),medicationDetailsRequired:required,medicationTaskIds:meds.map(t=>t.id),medicationIndex:0,startedAt:time(),updatedAt:time()};
          save(tx,s);
          for(const task of meds)event(tx,s,v.requestId+":"+task.id,"medication_context",task.title,"system",{name:medicationLanguage(task,meds).key,title:task.title});
        }
        if (["medication_confirmation","help_confirmation"].includes(s.stage) && s.pendingProposalId) {
          const pending=await assistant.proposalStatus(s.pendingProposalId,care.patientId);
          if (!pending || (pending.confirmedAt===undefined && !pending.result && pending.expiresAt<=now())) {
            s.pendingProposalId=undefined;s.stage=s.stage==="medication_confirmation"?"medications":"pain_check";save(tx,s);
          }
        }
        let base=question(s,care);
        if(s.pendingProposalId){
          const pending=await assistant.proposalStatus(s.pendingProposalId,care.patientId);
          if(pending?.command.name==="confirm_task"){const taskId=pending.command.args.taskId;base={...base,message:"Record your completion of “"+care.tasks.find(t=>t.id===taskId)?.title+"”? This is patient-reported."};}
          else if(pending?.command.name==="request_help")base={...base,message:"Record this for care-team review? “"+pending.command.args.quote+"”"};
        }
        return say(tx,s,care,v.requestId,base,s.stage==="greeting"?"Greet warmly as Panda, ask how the documented elbow/body part feels. If a prior concern is pending acknowledge it gently. No checklist, medicines, meals or booking at hello.":"Resume the actual unfinished topic naturally. Do not restart completed items or recite the plan. Pending action details remain in the visible proposal.",undefined,signal);
      });
    },
    async answer(raw: unknown,signal?:AbortSignal) {
      const v=AnswerCheckinSchema.parse(raw);
      const currentCare=await bridge.snapshot();
      const previous=await memory.transaction(currentCare.patientId,tx=>tx.receipt(v.requestId));
      if (previous) {
        if (previous.fingerprint!==fingerprint({op:"answer",...v})) throw new DomainError("CONFLICT","Request ID reused with different check-in input.");
        return previous.result as VoiceReply;
      }
      return once(v,{op:"answer",...v},signal,async(tx,care)=>{
        const s=requireSession(tx,v.checkinId,care);
        if(v.expectedStage&&s.stage!==v.expectedStage)throw new DomainError("CONFLICT","The conversation moved to another step. Resume it before answering.");
        const next={...s,medicationIndex:s.medicationIndex+1};
        const task=care.tasks.find(t=>t.id===s.medicationTaskIds[s.medicationIndex]);
        const med=task&&medicationLanguage(task,medicationTasks(care),s.medicationDetailsRequired?.includes(task.id));
        const goal=(stage:CheckinSession["stage"])=>question({...s,stage},care).message;
        const moves:Move[]=[
          {id:"question",goal:"Answer the patient's actual question from documented facts and attributed reports. If diagnosis/procedure is missing say so, without guessing or dumping instructions. Stay with their question; don't advance the check-in.",fallback:"I can help with what's in your plan, but I don't have a diagnosis or procedure recorded here. What would you like to know?"},
          {id:"chat",goal:"Respond to this social/ambiguous turn naturally. Stay on the current topic without forcing yes/no. Do not mark any check-in answered.",fallback:s.stage==="complete"?"I'm here. What would you like to talk about?":question(s,care).message},
          {id:"care_request",goal:"Acknowledge their explicit wish to contact the care team. Ask permission to record the exact concern for review, never claim delivery or acknowledgement.",fallback:"Would you like me to record that for your care team to review?"},
          {id:"care_concern",goal:"Their pain is worsening or concerning. Put exercise and routine questions aside. Acknowledge it, suggest contacting their care team promptly, and ask permission to record their exact words for review. This app is not monitored, so don't imply this request replaces getting medical help.",fallback:"I'm sorry your elbow's getting worse. Let's pause the exercise and contact your care team promptly. Would you like me to record what you've told me for their review?"},
          {id:"symptom_detail",goal:"Acknowledge the discomfort in their own words and ask ONE relevant follow-up about what changed or when it started. Pause routine check-in questions and don't diagnose or reassure.",fallback:"I'm sorry it's bothering you. What's changed since we last spoke?"},
        ];
        if(["greeting","wellbeing_followup"].includes(s.stage))moves.push({id:"wellbeing_answer",goal:s.concernPending?"Acknowledge how they feel now. A care concern is still pending, so stay available for their questions without suggesting exercise or routine checklist progression.":"Acknowledge how they feel, then gently transition to this one next topic: "+goal(remaining(s)),fallback:"Good to hear how you're doing. "+goal(remaining(s))});
        if(s.stage==="medications")moves.push(
          {id:"med_yes",goal:`They clearly report taking the medicine. Acknowledge briefly and ask if you should mark ${med?.spoken||"it"} taken. This only creates a proposal; it has not been saved in Care yet.`,fallback:`Got it. Shall I mark ${med?.spoken||"it"} as taken?`},
          {id:"med_no",goal:"They have not taken it. Acknowledge without judgment or catch-up dosing advice, then move to: "+goal(remaining(next)),fallback:"Okay, thanks for letting me know. "+goal(remaining(next))},
          {id:"med_unsure",goal:"They are unsure. Do not mark the task done or recommend another dose. Acknowledge uncertainty and move gently to: "+goal(remaining(next)),fallback:"That's okay—let's leave it unconfirmed. "+goal(remaining(next))});
        if(s.stage==="food")moves.push({id:"food_report",goal:"They reported a meal/snack or not eating. Acknowledge what they actually said without judging it. Then ask this one next question: "+goal(s.concernPending?"wellbeing_followup":"readiness")+". Booking availability is pending; do not announce it unless they asked about booking.",fallback:"Got it. "+goal(s.concernPending?"wellbeing_followup":"readiness")});
        if(s.stage==="readiness"||s.stage==="complete"&&!s.concernPending)moves.push({id:"ready_yes",goal:s.concernPending?"Do not open exercise with an unresolved worsening-pain concern. Keep the conversation with their care concern.":"Only select this if they clearly want to start exercise now. Say you'll stay with them and open the exercise workspace; don't claim measured feedback or correct technique.",fallback:"Let's open the exercise. I'll stay here with you."},{id:"ready_no",goal:"They aren't ready or prefer to talk. Don't close the conversation. Acknowledge and invite their questions; no booking status recitation.",fallback:"No rush—we can leave exercise for later. What would you like to talk about?"});
        if(s.stage==="exercise_review")moves.push({id:"review",goal:"Acknowledge how the session felt specifically, then ask whether there was any pain or discomfort. Don't call the exercise beneficial or correct.",fallback:"Thanks for telling me. Did you notice any pain or discomfort?"});
        if(s.stage==="pain_check")moves.push({id:"pain_none",goal:"They report no pain/discomfort. Acknowledge briefly and leave the conversation open for their questions. No redundant medical/scheduling boilerplate.",fallback:"Good to know. Is there anything else you'd like to talk through?"},{id:"pain_report",goal:"They described pain/discomfort. Acknowledge, suggest stopping exercise, and offer to record their exact words for care-team review. Do not diagnose or claim someone has been notified.",fallback:"Let's leave exercise there. Would you like me to record that discomfort for your care team to review?"},{id:"pain_more",goal:"They said there was pain but haven't described it. Ask one natural follow-up, not a yes/no form prompt.",fallback:"Can you tell me what the discomfort felt like?"});
        const allowed=worseningConcern(v.text)?moves.filter(m=>m.id==="care_concern"):moves;
        const d=await model({care,session:s,history:tx.dialogue(),memory:reports(tx),text:v.text,moves:allowed},signal);
        if(!allowed.some(m=>m.id===d.move)||d.foodQuote&&!v.text.includes(d.foodQuote))throw new DomainError("VALIDATION_ERROR","Unsupported conversation decision or patient quote.",400);
        let base=question(s,care);
        if(d.foodQuote&&!["question","care_concern","symptom_detail","care_request"].includes(d.move)){
          event(tx,s,v.requestId,"food",d.foodQuote);s.foodKnown=true;
        }
        if(d.move==="care_concern"||d.move==="care_request"||d.move==="pain_report"){
          if(d.move!=="care_request"){s.concernPending=true;event(tx,s,v.requestId,"pain_review",v.text,"patient_report",{possibleDiscomfort:true,worsening:d.move==="care_concern"});}
          base=await assistant.turn({requestId:v.requestId,text:v.text},undefined,{name:"request_help",args:{quote:v.text}});
          s.pendingProposalId=base.proposalId;s.stage="help_confirmation";
        }else if(d.move==="symptom_detail"){
          event(tx,s,v.requestId,"wellbeing",v.text);s.stage="wellbeing_followup";
        }else if(d.move==="wellbeing_answer"){
          event(tx,s,v.requestId,"wellbeing",v.text);s.stage=remaining(s);
        }else if(["med_yes","med_no","med_unsure"].includes(d.move)){
          if(!task)throw new DomainError("CONFLICT","Medication task changed. Start a refreshed conversation.");
          event(tx,s,v.requestId,"medication_report",v.text,"patient_report",{taskId:task.id,answer:d.move.slice(4),careStatus:task.status});
          if(d.move==="med_yes"&&task.status==="pending"){
            base=await assistant.turn({requestId:v.requestId,text:v.text},undefined,{name:"confirm_task",args:{taskId:task.id,expectedRevision:task.revision}});
            s.pendingProposalId=base.proposalId;s.stage="medication_confirmation";
          }else{base=nextMedication(tx,s,care);}
        }else if(d.move==="food_report"){
          if(!d.foodQuote){event(tx,s,v.requestId,"food",v.text);s.foodKnown=true;}
          event(tx,s,v.requestId,"scheduling_pending","Doctor availability is not connected; no follow-up was booked.","system",{booked:false});
          s.stage=s.concernPending?"wellbeing_followup":"readiness";
        }else if(d.move==="ready_yes"||d.move==="ready_no"){
          event(tx,s,v.requestId,"exercise_readiness",v.text,"patient_report",{ready:d.move==="ready_yes"&&!s.concernPending});
          s.stage=s.concernPending?"wellbeing_followup":d.move==="ready_yes"?"exercise":"complete";
          base=question(s,care);
        }else if(d.move==="review"){
          event(tx,s,v.requestId,"exercise_review",v.text,"patient_report",{sessionId:s.exerciseSessionId});s.stage="pain_check";
        }else if(d.move==="pain_more"){
          event(tx,s,v.requestId,"pain_review",v.text,"patient_report",{sessionId:s.exerciseSessionId,reportedPain:true});s.painReported=true;
        }else if(d.move==="pain_none"){
          event(tx,s,v.requestId,"pain_review",v.text,"patient_report",{sessionId:s.exerciseSessionId,possibleDiscomfort:false});s.stage="complete";
        }
        save(tx,s);
        if(s.pendingProposalId){
          base={...base,proposalId:s.pendingProposalId};
          const pending=await assistant.proposalStatus(s.pendingProposalId,care.patientId);
          if(pending?.command.name==="confirm_task"){const taskId=pending.command.args.taskId;base.message="Record your completion of “"+care.tasks.find(t=>t.id===taskId)?.title+"”? This is patient-reported.";}
          else if(pending?.command.name==="request_help")base.message="Record this for care-team review? “"+pending.command.args.quote+"”";
        }
        return {...presented(s,base,d),...(["care_concern","symptom_detail","pain_report"].includes(d.move)?{pauseExercise:true}:{})};
      });
    },
    async continueAfterConfirmation(raw: unknown,signal?:AbortSignal) {
      const v=ContinueCheckinSchema.parse(raw);
      const care=await bridge.snapshot();
      const proposal=await assistant.proposalResult(v.proposalId,care.patientId);
      if (!proposal) throw new DomainError("CONFLICT","The action has no saved result yet. Confirm or dismiss it first.");
      return once(v,{op:"continue",...v},signal,async(tx,current) => {
        const s=requireSession(tx,v.checkinId,current);
        if (s.pendingProposalId!==v.proposalId) throw new DomainError("CONFLICT","This proposal does not belong to the active check-in step.");
        const sent=proposal.confirmedAt!==undefined;
        utterance(tx,s,v.requestId,v.confirmationText||(sent?"Confirm action":"Dismiss action"),"user");
        if (s.stage==="medication_confirmation") {
          event(tx,s,v.requestId,"medication_report",sent ? "Patient confirmed the preceding medication self-report." : "Patient dismissed the medication completion proposal.",
            "system",{proposalId:v.proposalId,careWrite:sent && bridge.mode==="connected",dryRun:bridge.mode==="fixture"});
          const next=nextMedication(tx,s,current);
          return say(tx,s,current,v.requestId,next,(sent?(bridge.mode==="fixture"?"This was only a dry run; no Care record changed.":"The medication self-report was recorded successfully."):"The patient dismissed the medication action; no completion was recorded.")+" Acknowledge briefly and continue with just this next topic: "+next.message,undefined,signal);
        }
        if (s.stage!=="help_confirmation") throw new DomainError("CONFLICT","No confirmation is pending in this step.");
        s.pendingProposalId=undefined; s.stage=s.concernPending?"wellbeing_followup":"complete"; save(tx,s);
        return say(tx,s,current,v.requestId,reply(s,proposal.result!.message),"Actual action outcome: "+proposal.result!.message+". Say plainly whether it was only a dry run, recorded for review, or dismissed. A recorded request has NOT been acknowledged, delivered or reviewed. Don't imply care is coming or this is monitored. Keep the conversation open; don't jump into exercises/checklists after a concern.",undefined,signal);
      });
    },
    async exerciseFeedback(raw: unknown,signal?:AbortSignal) {
      const v=ExerciseFeedbackSchema.parse(raw);
      const care=await bridge.snapshot();
      const captured=("sessionId" in v.event) ? SessionSchema.parse(await bridge.exerciseSession(v.event.sessionId)) : undefined;
      if (captured && captured.patientId!==care.patientId) throw new DomainError("FORBIDDEN","Exercise session belongs to a different patient.",403);
      return once(v,{op:"exercise-feedback",...v},signal,async(tx,current) => {
        const s=requireSession(tx,v.checkinId,current);
        if (s.stage!=="exercise") {
          if (v.event.type==="camera_status") return question(s,current);
          if (v.event.type==="report_saved" && captured && captured.id===s.exerciseSessionId && ["exercise_review","pain_check","help_confirmation","wellbeing_followup","complete"].includes(s.stage)) {rememberReport(tx,s,captured);return question(s,current);}
          throw new DomainError("CONFLICT","No exercise is active in this check-in.");
        }
        if (v.event.type==="session_started") {
          if (!captured || captured.planId!==s.planId || captured.planVersion!==s.planVersion)
            throw new DomainError("CONFLICT","Exercise session does not match the captured plan.");
          if (s.exerciseSessionId && s.exerciseSessionId!==captured.id) throw new DomainError("CONFLICT","Finish the current exercise session before starting another.");
          s.exerciseSessionId=captured.id;
        } else if (v.event.type==="report_saved") {
          if (!captured?.report) throw new DomainError("CONFLICT","Rehab has not saved this report yet.");
          if (s.exerciseSessionId && s.exerciseSessionId!==captured.id) throw new DomainError("CONFLICT","Report does not match this exercise check-in.");
          const report=rememberReport(tx,s,captured);
          s.exerciseSessionId=captured.id;
          s.stage="exercise_review"; save(tx,s);
          const review=question(s,current);
          return say(tx,s,current,v.requestId,{...review,message:(report.evidence==="simulated"?"That was a simulated demo session. ":"Your report is saved. ")+review.message},"The exercise report is saved. "+(report.evidence==="simulated"?"You MUST explicitly say this was simulated/a demo, not measured exercise. ":"")+"Ask how the patient felt, one question. Don't read statistics or technical report fields aloud.",undefined,signal);
        } else {
          if (v.event.type==="tracking_status" && (!captured || s.exerciseSessionId!==captured.id))
            throw new DomainError("CONFLICT","Tracking feedback does not match the active session.");
          event(tx,s,v.requestId,"exercise_feedback",v.event.type==="camera_status"
            ? (v.event.status==="preview_on" ? "Camera preview enabled. Preview alone does not measure exercise." : "Camera preview stopped.")
            : "Exercise module tracking status: "+v.event.status+".","client_observation",{event:v.event});
        }
        save(tx,s);
        return question(s,current);
      });
    },
    async memory() { const care=await bridge.snapshot(); return memory.snapshot(care.patientId); },
    async forget(raw: unknown) {
      const { z }=await import("zod");
      z.object({confirm:z.literal(true)}).strict().parse(raw);
      const care=await bridge.snapshot();
      await memory.transaction(care.patientId,tx=>tx.forget());
      return {patientId:care.patientId,forgotten:true,careRecordsUnchanged:true};
    },
  };
}
export const checkins=checkinService();
