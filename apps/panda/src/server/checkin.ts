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
  function question(s: CheckinSession,care: CareSnapshot): VoiceReply {
    const task = care.tasks.find(task => task.id === s.medicationTaskIds[s.medicationIndex]);
    if (s.stage === "medications") return reply(s,task ? "Before we begin, have you taken this medicine as listed in your approved plan?\n"+task.title+"\nPlease say yes, no, or that you’re unsure." : "No medicine task is available in this approved plan. What have you eaten today?");
    if (s.stage === "medication_confirmation" || s.stage === "help_confirmation") return reply(s,
      "Your previous action still needs review. Confirm it below, or dismiss it.",{proposalId:s.pendingProposalId});
    if (s.stage === "food") return reply(s,"What have you eaten today? You can tell me about meals, snacks, or if you haven’t eaten yet.");
    if (s.stage === "readiness") return reply(s,"Doctor availability is pending, so I can’t book a follow-up yet. Are you ready to exercise?");
    if (s.stage === "exercise") return reply(s,"I’ll stay with you in the exercise module. You can use Panda while the camera runs. Live pose feedback is only available when the exercise module provides it.",{navigation:"/rehab"});
    if (s.stage === "exercise_review") return reply(s,"How did the exercise feel? Tell me anything you noticed.");
    if (s.stage === "pain_check") return reply(s,"Did you feel any pain or discomfort during or after the exercise? Describe it in your own words.");
    return reply(s,"Your check-in is saved in your patient context. Doctor availability and booking are still pending.");
  }
  function requireSession(tx: MemoryTransaction,id: string,care: CareSnapshot) {
    const s=tx.session(id);
    if (!s) throw new DomainError("NOT_FOUND","This check-in is not available for the current patient.",404);
    if (!["exercise","exercise_review","pain_check","help_confirmation","complete"].includes(s.stage) &&
      (care.plan?.id !== s.planId || care.plan?.version !== s.planVersion))
      throw new DomainError("CONFLICT","The approved plan changed. Start a refreshed check-in before continuing.");
    return s;
  }
  async function once(raw: {requestId:string}, payload: unknown, fn: (tx: MemoryTransaction,care: CareSnapshot)=>Promise<VoiceReply>|VoiceReply) {
    const care=await bridge.snapshot();
    if (!care.plan || care.plan.status !== "approved") throw new DomainError("CONFLICT","An approved plan is required for this check-in.");
    return memory.transaction(care.patientId,async tx => {
      const previous=tx.receipt(raw.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint(payload)) throw new DomainError("CONFLICT","Request ID reused with different check-in input.");
        return previous.result as VoiceReply;
      }
      const result=await fn(tx,care);
      tx.saveReceipt(raw.requestId,payload,result);
      return result;
    });
  }
  function nextMedication(tx: MemoryTransaction,s: CheckinSession,care: CareSnapshot) {
    s.medicationIndex++;
    s.pendingProposalId=undefined;
    s.stage=s.medicationIndex < s.medicationTaskIds.length ? "medications" : "food";
    save(tx,s);
    return question(s,care);
  }
  return {
    async start(raw: unknown) {
      const v=StartCheckinSchema.parse(raw);
      return once(v,{op:"start",...v},async(tx,care) => {
        let s=tx.latestSession();
        const changed=s && (s.planId !== care.plan!.id || s.planVersion !== care.plan!.version);
        const tooOld=s && now()-Date.parse(s.updatedAt)>24*60*60*1000;
        if (!s || s.stage==="complete" || changed || tooOld) {
          const meds=medicationTasks(care);
          s={id:randomUUID(),patientId:care.patientId,planId:care.plan!.id,planVersion:care.plan!.version,
            stage:meds.length ? "medications" : "food",medicationTaskIds:meds.map(t=>t.id),medicationIndex:0,startedAt:time(),updatedAt:time()};
          save(tx,s);
        }
        if (["medication_confirmation","help_confirmation"].includes(s.stage) && s.pendingProposalId) {
          const pending=await assistant.proposalStatus(s.pendingProposalId,care.patientId);
          if (!pending || (pending.confirmedAt===undefined && !pending.result && pending.expiresAt<=now())) {
            s.pendingProposalId=undefined;s.stage=s.stage==="medication_confirmation"?"medications":"pain_check";save(tx,s);
          }
        }
        return question(s,care);
      });
    },
    async answer(raw: unknown) {
      const v=AnswerCheckinSchema.parse(raw);
      const currentCare=await bridge.snapshot();
      const previous=await memory.transaction(currentCare.patientId,tx=>tx.receipt(v.requestId));
      if (previous) {
        if (previous.fingerprint!==fingerprint({op:"answer",...v})) throw new DomainError("CONFLICT","Request ID reused with different check-in input.");
        return previous.result as VoiceReply;
      }
      const currentSession=await memory.transaction(currentCare.patientId,tx=>requireSession(tx,v.checkinId,currentCare));
      if (v.expectedStage && currentSession.stage!==v.expectedStage) throw new DomainError("CONFLICT","The check-in moved to another step. Resume it before answering.");
      if (currentSession.stage==="exercise" || /^(what|when|where|which|how|why|can you|could you|do you remember)\b/i.test(v.text.trim())) {
        const s=currentSession;
        const answer=await assistant.turn({requestId:v.requestId,text:v.text});
        return {...answer,checkin:{id:s.id,stage:s.stage}};
      }
      return once(v,{op:"answer",...v},async(tx,care) => {
        const s=requireSession(tx,v.checkinId,care);
        if (s.stage==="medications") {
          const task=care.tasks.find(t=>t.id===s.medicationTaskIds[s.medicationIndex]);
          if (!task) throw new DomainError("CONFLICT","Medication task changed. Start a refreshed check-in.");
          const answer=polarity(v.text);
          if (answer==="unknown") {
            if (/\b(unsure|not sure|don't know|do not know|maybe)\b/i.test(v.text)) {
              event(tx,s,v.requestId,"medication_report",v.text,"patient_report",{taskId:task.id,answer:"unsure",careWrite:false});
              return nextMedication(tx,s,care);
            }
            return reply(s,"I don’t want to guess about your medicine. For this exact task, is your answer yes, no, or not sure?\n"+task.title);
          }
          event(tx,s,v.requestId,"medication_report",v.text,"patient_report",{taskId:task.id,answer,careStatus:task.status});
          if (answer==="yes" && task.status==="pending") {
            const proposal=await assistant.turn({requestId:v.requestId,text:v.text},undefined,
              {name:"confirm_task",args:{taskId:task.id,expectedRevision:task.revision}});
            s.pendingProposalId=proposal.proposalId; s.stage="medication_confirmation"; save(tx,s);
            return {...proposal,checkin:{id:s.id,stage:s.stage}};
          }
          return nextMedication(tx,s,care);
        }
        if (s.stage==="food") {
          event(tx,s,v.requestId,"food",v.text);
          event(tx,s,v.requestId,"scheduling_pending","Doctor availability is not connected; no follow-up was booked.","system",{booked:false});
          s.stage="readiness"; save(tx,s); return question(s,care);
        }
        if (s.stage==="readiness") {
          const answer=polarity(v.text);
          if (answer==="unknown") return reply(s,"Are you ready to open the exercise module now? Please say yes or no.");
          event(tx,s,v.requestId,"exercise_readiness",v.text,"patient_report",{ready:answer==="yes"});
          s.stage=answer==="yes" ? "exercise" : "complete"; save(tx,s);
          return answer==="yes" ? question(s,care) : reply(s,"Okay. We can return to exercise later. I’ve saved your check-in; no appointment was booked.");
        }
        if (s.stage==="exercise_review") {
          event(tx,s,v.requestId,"exercise_review",v.text,"patient_report",{sessionId:s.exerciseSessionId});
          s.stage="pain_check"; save(tx,s); return question(s,care);
        }
        if (s.stage==="pain_check") {
          const answer=polarity(v.text);
          if (answer==="yes" && !/\b(pain|hurt|discomfort|sore|ache)\b/i.test(v.text)) {
            s.painReported=true; save(tx,s);
            event(tx,s,v.requestId,"pain_review",v.text,"patient_report",{sessionId:s.exerciseSessionId,reportedPain:true});
            return reply(s,"Please describe the pain or discomfort in your own words. We can prepare a care-team request for you to review.");
          }
          const possibleDiscomfort=answer!=="no" && (s.painReported || /\b(pain|hurt|hurts|hurting|discomfort|sore|soreness|ache|aching)\b/i.test(v.text));
          event(tx,s,v.requestId,"pain_review",v.text,"patient_report",{sessionId:s.exerciseSessionId,possibleDiscomfort});
          if (possibleDiscomfort) {
            const proposal=await assistant.turn({requestId:v.requestId,text:v.text},undefined,{name:"request_help",args:{quote:v.text}});
            s.pendingProposalId=proposal.proposalId; s.stage="help_confirmation"; save(tx,s);
            return {...proposal,message:"I’ve saved your own words. If you’re uncomfortable, stop exercising. Would you like to record this for care-team review?\n"+proposal.message,checkin:{id:s.id,stage:s.stage}};
          }
          s.stage="complete"; save(tx,s); return question(s,care);
        }
        if (s.stage==="medication_confirmation" || s.stage==="help_confirmation")
          return reply(s,"Use the explicit confirmation or dismiss button for the pending action.",{proposalId:s.pendingProposalId});
        return question(s,care);
      });
    },
    async continueAfterConfirmation(raw: unknown) {
      const v=ContinueCheckinSchema.parse(raw);
      const care=await bridge.snapshot();
      const proposal=await assistant.proposalResult(v.proposalId,care.patientId);
      if (!proposal) throw new DomainError("CONFLICT","The action has no saved result yet. Confirm or dismiss it first.");
      return once(v,{op:"continue",...v},(tx,current) => {
        const s=requireSession(tx,v.checkinId,current);
        if (s.pendingProposalId!==v.proposalId) throw new DomainError("CONFLICT","This proposal does not belong to the active check-in step.");
        const sent=proposal.confirmedAt!==undefined;
        if (s.stage==="medication_confirmation") {
          event(tx,s,v.requestId,"medication_report",sent ? "Patient confirmed the preceding medication self-report." : "Patient dismissed the medication completion proposal.",
            "system",{proposalId:v.proposalId,careWrite:sent && bridge.mode==="connected",dryRun:bridge.mode==="fixture"});
          const next=nextMedication(tx,s,current);
          return {...next,message:proposal.result!.message+"\n\n"+next.message};
        }
        if (s.stage!=="help_confirmation") throw new DomainError("CONFLICT","No confirmation is pending in this step.");
        s.pendingProposalId=undefined; s.stage="complete"; save(tx,s);
        return reply(s,proposal.result!.message+"\n\nYour post-exercise review is saved.");
      });
    },
    async exerciseFeedback(raw: unknown) {
      const v=ExerciseFeedbackSchema.parse(raw);
      const care=await bridge.snapshot();
      const captured=("sessionId" in v.event) ? SessionSchema.parse(await bridge.exerciseSession(v.event.sessionId)) : undefined;
      if (captured && captured.patientId!==care.patientId) throw new DomainError("FORBIDDEN","Exercise session belongs to a different patient.",403);
      return once(v,{op:"exercise-feedback",...v},(tx,current) => {
        const s=requireSession(tx,v.checkinId,current);
        if (s.stage!=="exercise") {
          if (v.event.type==="camera_status") return question(s,current);
          if (v.event.type==="report_saved" && captured?.id===s.exerciseSessionId && ["exercise_review","pain_check","help_confirmation","complete"].includes(s.stage)) return question(s,current);
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
          const report=ReportSchema.parse(captured.report);
          if (report.planId!==s.planId || report.planVersion!==s.planVersion) throw new DomainError("CONFLICT","Report plan does not match the captured check-in.");
          s.exerciseSessionId=captured.id;
          event(tx,s,"report:"+captured.id,"exercise_report","Rehab report summary: "+report.repetitions+" repetitions; range "+(report.rangeDegrees===null ? "unavailable" : report.rangeDegrees+" degrees")+"; evidence: "+report.evidence+"; tracking: "+report.trackingQuality+"; ended: "+report.terminationReason+".","rehab_report",
            {sessionId:captured.id,sourceRoute:"/rehab/api/sessions/"+captured.id,evidence:report.evidence,trackingQuality:report.trackingQuality});
          s.stage="exercise_review"; save(tx,s);
          const review=question(s,current);
          return {...review,message:(report.evidence==="simulated" ? "This was an explicitly simulated exercise report.\n" : "Your exercise report is saved.\n")+review.message};
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
