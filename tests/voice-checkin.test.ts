import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PatientMemoryRepository } from "../apps/panda/src/server/patient-memory";
import { checkinService } from "../apps/panda/src/server/checkin";
import { voiceService } from "../apps/panda/src/server/service";
import { careService } from "../apps/care/src/server/service";
import { rehabService } from "../apps/rehab/src/server/service";
import { demoCommand } from "../apps/panda/src/server/provider";
import { fixtureCare } from "../packages/contracts/fixtures";
import {dialogueTurn,medicationLanguage,type DialogueModel} from "../apps/panda/src/server/conversation";
import type { VoiceReply } from "../packages/contracts/voice";

async function setup(t:test.TestContext,model?:DialogueModel) {
  const dir=await mkdtemp(path.join(tmpdir(),"panda-checkin-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const care=careService(path.join(dir,"care.json")),rehab=rehabService(path.join(dir,"rehab.json"));
  const memory=new PatientMemoryRepository(path.join(dir,"memory.sqlite"));
  let writes=0, clock=Date.now(), seenContext="";
  const voice=voiceService(path.join(dir,"voice.sqlite"),{
    mode:"connected",snapshot:()=>care.snapshot(),
    write:async(route,body)=>{writes++;return route==="help" ? care.help(body) : care.confirm(route.split("/")[1],body);},
  },async(text,c,_signal,remembered)=>{seenContext=remembered||"";return {command:demoCommand(text,c),engine:"demo_rules"};},undefined,()=>clock,memory);
  const checkin=checkinService(memory,voice,{snapshot:()=>care.snapshot(),exerciseSession:id=>rehab.session(id),mode:"connected"},()=>clock,model);
  let counter=0;
  const id=()=> "checkin-request-"+(++counter);
  const greet=()=>checkin.start({requestId:id()});
  const start=async()=>{const r=await greet();return r.checkin?.stage==="greeting"?answer(r,"My elbow feels okay today."):r;};
  const answer=(reply:VoiceReply,text:string)=>checkin.answer({requestId:id(),checkinId:reply.checkin!.id,expectedStage:reply.checkin!.stage,text});
  const confirm=async(reply:VoiceReply)=>{
    await voice.confirm({proposalId:reply.proposalId});
    return checkin.continueAfterConfirmation({requestId:id(),checkinId:reply.checkin!.id,proposalId:reply.proposalId});
  };
  const ready=async()=>{
    let r=await start();r=await answer(r,"No, not yet");r=await answer(r,"Oatmeal and an apple");r=await answer(r,"Tomorrow morning");r=await answer(r,"Yes");return r;
  };
  const exercise=async(r:VoiceReply)=>{
    const c=await care.snapshot();
    const session=await rehab.start({requestId:id(),planId:c.plan!.id,planVersion:c.plan!.version,exerciseId:"demo-elbow"},c);
    await checkin.exerciseFeedback({requestId:id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"session_started",sessionId:session.id,planId:session.planId,planVersion:session.planVersion}});
    const report={sessionId:session.id,patientId:session.patientId,planId:session.planId,planVersion:session.planVersion,exerciseId:session.exerciseId,startedAt:session.startedAt,endedAt:new Date().toISOString(),
      repetitions:3,rangeDegrees:90,trackingQuality:"simulated",evidence:"simulated",terminationReason:"completed"};
    await rehab.finish(session.id,{requestId:id(),report});
    const feedback={requestId:id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"report_saved",sessionId:session.id}};
    return {reply:await checkin.exerciseFeedback(feedback),session,feedback};
  };
  return {care,rehab,memory,voice,checkin,start,greet,answer,confirm,ready,exercise,id,writes:()=>writes,seenContext:()=>seenContext,setClock:(value:number)=>{clock=value;}};
}
test("guided check-in requires medication confirmation, remembers food, and leaves scheduling pending",async t=>{
  const x=await setup(t);
  let r=await x.start();
  assert.equal(r.checkin?.stage,"medications");assert.match(r.message,/Atorvastatin/);
  r=await x.answer(r,"Yes");
  assert.equal(r.checkin?.stage,"medication_confirmation");assert.equal(x.writes(),0);
  await assert.rejects(()=>x.checkin.continueAfterConfirmation({requestId:x.id(),checkinId:r.checkin!.id,proposalId:r.proposalId}),/no saved result/);
  r=await x.confirm(r);
  assert.equal(r.checkin?.stage,"food");assert.equal(x.writes(),1);
  r=await x.answer(r,"I ate oatmeal, eggs, and a banana.");
  assert.equal(r.checkin?.stage,"followup");r=await x.answer(r,"Tomorrow morning");
  assert.equal(r.checkin?.stage,"readiness");assert.match(r.message,/isn.t booked/i);assert.doesNotMatch(r.message,/appointment confirmed/i);
  const remembered=await x.checkin.memory();
  assert.ok(remembered.events.some(e=>e.kind==="food" && e.quote==="I ate oatmeal, eggs, and a banana."));
  assert.ok(remembered.events.some(e=>e.kind==="scheduling_pending" && e.metadata.booked===false));
  r=await x.answer(r,"No, not today");
  assert.equal(r.checkin?.stage,"complete");
});
test("exercise uses owner reports and asks both feelings and pain after finishing",async t=>{
  const x=await setup(t);
  const ready=await x.ready();assert.equal(ready.navigation,"/rehab");
  const exercise=await x.exercise(ready);
  let r=exercise.reply;
  assert.equal(r.checkin?.stage,"exercise_review");assert.match(r.message,/simulated/);
  r=await x.answer(r,"My arm felt tired but the session was manageable.");
  assert.equal(r.checkin?.stage,"pain_check");
  r=await x.answer(r,"No pain or discomfort");
  assert.equal(r.checkin?.stage,"complete");
  assert.equal((await x.care.snapshot()).help.length,0);
  const memory=await x.checkin.memory();
  assert.ok(memory.events.some(e=>e.kind==="exercise_report" && e.metadata.sourceRoute && e.source==="rehab_report"));
  assert.ok(memory.events.some(e=>e.kind==="exercise_review"));
  assert.ok(memory.events.some(e=>e.kind==="pain_review" && e.metadata.possibleDiscomfort===false));
  const repeated=await x.checkin.exerciseFeedback({...exercise.feedback,requestId:x.id()});
  assert.equal(repeated.checkin?.stage,"complete");
  assert.equal((await x.rehab.reports()).length,1);
});
test("resuming an expired check-in confirmation returns to its question without writing Care",async t=>{
  const x=await setup(t);
  let r=await x.answer(await x.start(),"Yes");
  assert.equal(r.checkin?.stage,"medication_confirmation");
  x.setClock(Date.now()+6*60*1000);
  r=await x.start();
  assert.equal(r.checkin?.stage,"medications");
  assert.equal(r.proposalId,undefined);
  assert.equal(x.writes(),0);
  r=await x.answer(r,"Yes");
  assert.equal(r.checkin?.stage,"medication_confirmation");
  r=await x.confirm(r);
  assert.equal(r.checkin?.stage,"food");
});
test("pain reports preserve the patient's exact words and never contact Care before confirmation",async t=>{
  const x=await setup(t);let r=(await x.exercise(await x.ready())).reply;
  r=await x.answer(r,"It felt uncomfortable.");r=await x.answer(r,"Yes");
  assert.equal(r.checkin?.stage,"pain_check");assert.match(r.message,/tell me|describe/);
  const quote="My left elbow hurts.  I stopped.";
  r=await x.answer(r,quote);
  assert.equal(r.checkin?.stage,"help_confirmation");assert.equal((await x.care.snapshot()).help.length,0);
  r=await x.confirm(r);assert.equal(r.checkin?.stage,"wellbeing_followup");
  const help=(await x.care.snapshot()).help;
  assert.equal(help.length,1);assert.equal(help[0].quote,quote);assert.equal(help[0].status,"open");
});
test("check-in retries replay once and stale-step answers cannot become food reports",async t=>{
  const x=await setup(t);let r=await x.start();r=await x.answer(r,"No");
  const input={requestId:x.id(),checkinId:r.checkin!.id,expectedStage:r.checkin!.stage,text:"Soup and bread"};
  const first=await x.checkin.answer(input);
  assert.deepEqual(await x.checkin.answer(input),first);
  await assert.rejects(()=>x.checkin.answer({...input,text:"Changed meal"}),/reused/);
  await assert.rejects(()=>x.checkin.answer({...input,requestId:x.id()}),/another step/);
  assert.equal((await x.checkin.memory()).events.filter(e=>e.kind==="food").length,1);
});
test("memory survives a new repository and is strictly scoped to the current patient",async t=>{
  const x=await setup(t);
  await x.memory.transaction("patient-a",tx=>tx.append({id:"same",patientId:"patient-a",kind:"food",quote:"Patient A breakfast",at:"2020-01-01T00:00:00.000Z",source:"patient_report",metadata:{}}));
  await x.memory.transaction("patient-b",tx=>tx.append({id:"same",patientId:"patient-b",kind:"food",quote:"Patient B dinner",at:"2020-01-01T00:00:00.000Z",source:"patient_report",metadata:{}}));
  const reopened=new PatientMemoryRepository(x.memory.file);
  assert.equal((await reopened.snapshot("patient-a")).events[0].quote,"Patient A breakfast");
  assert.equal((await reopened.snapshot("patient-b")).events[0].quote,"Patient B dinner");
  assert.equal((await reopened.snapshot("patient-a")).retention,"until_deleted");
  await reopened.transaction("patient-a",tx=>tx.forget());
  assert.equal((await reopened.snapshot("patient-a")).totalEvents,0);
  assert.equal((await reopened.snapshot("patient-b")).totalEvents,1);
});
test("remembered patient reports are included in provider routing and can be read back with sources",async t=>{
  const x=await setup(t);let r=await x.start();r=await x.answer(r,"No");await x.answer(r,"Lentil soup and rice");
  const remembered=await x.voice.turn({requestId:x.id(),text:"What did I eat?"});
  assert.match(remembered.message,/Lentil soup and rice/);
  assert.ok(remembered.sourceRefs?.every(ref=>ref.startsWith("patient-memory:")));
  assert.match(x.seenContext(),/Lentil soup and rice/);
});
test("changed plans invalidate medication steps and starting again uses the new approved plan",async t=>{
  const x=await setup(t);const r=await x.start();
  const draft=await x.care.importPlan({requestId:x.id(),sourceText:"Medicine example: 1 synthetic tablet"});
  await x.care.approve(draft.id,{requestId:x.id(),expectedCurrentVersion:1});
  await assert.rejects(()=>x.answer(r,"Yes"),/plan changed/);
  const restarted=await x.start();assert.notEqual(restarted.checkin?.id,r.checkin?.id);
});
test("unsure medicine answers are recorded without a completion write",async t=>{
  const x=await setup(t);let r=await x.start();r=await x.answer(r,"I am not sure");
  assert.equal(r.checkin?.stage,"food");assert.equal(x.writes(),0);
  assert.equal((await x.care.snapshot()).tasks[0].status,"pending");
});
test("forged or unfinished exercise reports cannot advance a check-in",async t=>{
  const x=await setup(t);const r=await x.ready();const c=await x.care.snapshot();
  const session=await x.rehab.start({requestId:x.id(),planId:c.plan!.id,planVersion:1,exerciseId:"demo-elbow"},c);
  await assert.rejects(()=>x.checkin.exerciseFeedback({requestId:x.id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"report_saved",sessionId:session.id}}),/not saved/);
  const other=fixtureCare("pat-demo-002");
  const foreign=await x.rehab.start({requestId:x.id(),planId:other.plan!.id,planVersion:1,exerciseId:"demo-elbow"},other);
  await assert.rejects(()=>x.checkin.exerciseFeedback({requestId:x.id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"session_started",sessionId:foreign.id,planId:foreign.planId,planVersion:1}}),/different patient/);
});
test("forget requires explicit confirmation and only removes Panda's patient memory",async t=>{
  const x=await setup(t);await x.answer(await x.start(),"No");
  await assert.rejects(()=>x.checkin.forget({confirm:false}));
  assert.ok((await x.checkin.memory()).totalEvents);
  await x.checkin.forget({confirm:true});
  assert.equal((await x.checkin.memory()).totalEvents,0);
  assert.ok((await x.care.snapshot()).plan);
});

test("voice histories and receipts are partitioned by the trusted server patient identity",async t=>{
  const x=await setup(t);
  let active="pat-demo-001";
  const current=()=>fixtureCare(active);
  const voice=voiceService(path.join(path.dirname(x.memory.file),"scoped-voice.sqlite"),{
    mode:"fixture",snapshot:async()=>current(),write:async()=>{throw Error("no writes");},
  },async(text,care)=>({command:demoCommand(text,care),engine:"demo_rules"}),undefined,Date.now,x.memory,async()=>active);
  await voice.turn({requestId:"shared-request-id",text:"Show my plan"});
  active="pat-demo-002";
  assert.deepEqual(await voice.history(),[]);
  await voice.turn({requestId:"shared-request-id",text:"What did I eat?"});
  const history=await voice.history();
  assert.equal(history.length,1);assert.equal(history[0].text,"What did I eat?");
  active="pat-demo-001";
  assert.equal((await voice.history())[0].text,"Show my plan");
});
test("older food context remains retrievable after newer exercise feedback fills recent history",async t=>{
  const x=await setup(t);
  await x.memory.transaction("pat-demo-001",tx=>{
    tx.append({id:"old-meal",patientId:"pat-demo-001",kind:"food",quote:"Older lentil soup",at:"2020-01-01T00:00:00.000Z",source:"patient_report",metadata:{}});
    for(let i=0;i<60;i++)tx.append({id:"tracking-"+i,patientId:"pat-demo-001",kind:"exercise_feedback",quote:"Preview status",at:"2026-11-07T15:00:00.000Z",source:"client_observation",metadata:{}});
  });
  const reply=await x.voice.turn({requestId:x.id(),text:"What food did I eat?"});
  assert.match(reply.message,/Older lentil soup/);
});


test("conversation opens with wellbeing and routine speech omits strength and clock time",async t=>{
  const x=await setup(t);let r=await x.greet();
  assert.equal(r.checkin?.stage,"greeting");assert.match(r.message,/left knee.*feeling/i);assert.match(r.message,/check-in/i);assert.doesNotMatch(r.message,/atorvastatin|medication|food/i);
  r=await x.answer(r,"I'm doing okay today.");
  assert.equal(r.checkin?.stage,"medications");assert.match(r.message,/evening.*atorvastatin/i);assert.doesNotMatch(r.message,/10 mg|8:00|tablet/);
  r=await x.answer(r,"Yes, I took it.");
  assert.match(r.message,/10 mg/);assert.doesNotMatch(r.speechText!,/10 mg|8:00|tablet/);assert.equal(x.writes(),0);
});
test("filler-led patient questions stay questions and never become food reports",async t=>{
  const x=await setup(t);let r=await x.answer(await x.start(),"No");assert.equal(r.checkin?.stage,"food");
  r=await x.answer(r,"Uh, so tell me this, do you know my disease or what I got done?");
  assert.equal(r.checkin?.stage,"food");assert.match(r.message,/isn't recorded|don't have a diagnosis/i);assert.doesNotMatch(r.message,/10 mg|8:00/);
  assert.equal((await x.checkin.memory()).events.filter(e=>e.kind==="food").length,0);
});
test("worsening pain interrupts any checklist step and offers an exact-quote request without writing",async t=>{
  const x=await setup(t);let r=await x.answer(await x.start(),"No");
  const quote="My elbow is hurting more and more. The pain is increasing and throbbing.";
  r=await x.answer(r,quote);assert.equal(r.checkin?.stage,"help_confirmation");assert.ok(r.proposalId);assert.equal(x.writes(),0);
  assert.match(r.speechText!,/getting worse|pause|care team/i);assert.doesNotMatch(r.speechText!,/meal|sandwich|ready to exercise/);
  assert.equal((await x.checkin.memory()).events.filter(e=>e.kind==="food").length,0);
  r=await x.confirm(r);assert.equal(r.checkin?.stage,"wellbeing_followup");assert.equal((await x.care.snapshot()).help[0].quote,quote);
  r=await x.answer(r,"Yes, let's exercise");assert.notEqual(r.navigation,"/rehab");
});
test("recent dialogue is sent back on every model turn and the complete transcript survives reopening",async t=>{
  const calls:Parameters<DialogueModel>[0][]=[];
  const x=await setup(t,async(input)=>{calls.push(structuredClone(input));return dialogueTurn(input);});
  let r=await x.greet();const greeting=r.message;r=await x.answer(r,"My elbow feels okay today.");r=await x.answer(r,"No, not yet.");
  assert.ok(calls.at(-1)!.history.some(turn=>turn.text===greeting));assert.ok(calls.at(-1)!.history.some(turn=>turn.text==="My elbow feels okay today."));
  const saved=await new PatientMemoryRepository(x.memory.file).snapshot("pat-demo-001");
  assert.deepEqual(saved.transcript.map(t=>t.role),["assistant","user","assistant","user","assistant"]);
  assert.equal(saved.transcript[1].text,"My elbow feels okay today.");
  await x.checkin.forget({confirm:true});assert.deepEqual((await x.checkin.memory()).transcript,[]);
});
test("a changed prescription keeps exact details while a dose question gets a precise answer",async t=>{
  const x=await setup(t);let r=await x.start();r=await x.answer(r,"What dose am I supposed to take?");
  assert.match(r.message,/10 mg/);assert.match(r.message,/8:00 PM/);
  const draft=await x.care.importPlan({requestId:x.id(),sourceText:"Atorvastatin 20 mg · 1 tablet · 8:00 PM"});await x.care.approve(draft.id,{requestId:x.id(),expectedCurrentVersion:1});
  r=await x.start();assert.match(r.message,/20 mg/);
  assert.ok((await x.checkin.memory()).checkin?.medicationDetailsRequired?.length);
});
test("a new call reviews prior medication and meal reports without duplicate Care writes",async t=>{
  const x=await setup(t);let r=await x.confirm(await x.answer(await x.start(),"Yes"));r=await x.answer(r,"Oatmeal and fruit");r=await x.answer(r,"Tomorrow morning");r=await x.answer(r,"No");
  r=await x.greet();assert.equal(r.checkin?.stage,"greeting");r=await x.answer(r,"I feel okay.");assert.equal(r.checkin?.stage,"medications");assert.match(r.message,/recorded.*earlier/i);
  const writes=x.writes();r=await x.answer(r,"Yes");assert.equal(r.checkin?.stage,"food");assert.equal(x.writes(),writes);assert.equal(r.proposalId,undefined);
  r=await x.answer(r,"No, nothing else");assert.equal(r.checkin?.stage,"followup");
});
test("multiple strengths of the same medicine retain disambiguating details",()=>{
  const care=fixtureCare();const first=care.tasks[0];const second={...first,id:"other-dose",title:"Atorvastatin 20 mg · 1 tablet · 8:00 PM"};
  assert.equal(medicationLanguage(first,[first,second]).precise,true);assert.match(medicationLanguage(first,[first,second]).spoken,/10 mg/);
});

test("a patient can ask a question while an action is pending without yes becoming implicit confirmation",async t=>{
  const x=await setup(t);let r=await x.answer(await x.start(),"Yes");const proposalId=r.proposalId;
  r=await x.answer(r,"What dose is in my plan?");
  assert.equal(r.proposalId,proposalId);assert.equal(r.confirmationPrompt,false);assert.match(r.speechText!,/10 mg/);assert.equal(x.writes(),0);
});
test("declining exercise leaves ongoing questions available and an explicit later start can open it",async t=>{
  const x=await setup(t);let r=await x.answer(await x.start(),"No");r=await x.answer(r,"Soup");r=await x.answer(r,"Tomorrow morning");r=await x.answer(r,"No, not yet");
  assert.equal(r.checkin?.stage,"complete");r=await x.answer(r,"Do you know what operation I had?");assert.equal(r.checkin?.stage,"complete");
  r=await x.answer(r,"I'm ready to do exercise");assert.equal(r.navigation,"/rehab");
});
test("cancelled dialogue rolls back unsaved conversation state and transcript",async t=>{
  const controller=new AbortController();
  const x=await setup(t,async(_input,signal)=>{controller.abort();assert.equal(signal?.aborted,true);throw new DOMException("Stopped","AbortError");});
  await assert.rejects(()=>x.checkin.start({requestId:x.id()},controller.signal));
  const snapshot=await x.checkin.memory();assert.equal(snapshot.checkin,null);assert.equal(snapshot.transcript.length,0);assert.equal(snapshot.totalEvents,0);
});

test("conversational context retains older meal reports even after noisy exercise callbacks",async t=>{
  const calls:Parameters<DialogueModel>[0][]=[];const x=await setup(t,async input=>{calls.push(structuredClone(input));return dialogueTurn(input);});
  await x.memory.transaction("pat-demo-001",tx=>{
    tx.append({id:"meal-before-feedback",patientId:"pat-demo-001",kind:"food",quote:"Lentils before exercise",at:"2020-01-01T00:00:00.000Z",source:"patient_report",metadata:{}});
    for(let i=0;i<60;i++)tx.append({id:"camera-noise-"+i,patientId:"pat-demo-001",kind:"exercise_feedback",quote:"Preview updated",at:"2026-11-07T10:00:00.000Z",source:"client_observation",metadata:{}});
  });await x.greet();assert.ok(calls.at(-1)!.memory.some(e=>e.quote==="Lentils before exercise"));
});

test("a concern pauses the exercise view and a late owner report cannot replace the concern",async t=>{
  const x=await setup(t);let r=await x.ready();const care=await x.care.snapshot();
  const session=await x.rehab.start({requestId:x.id(),planId:care.plan!.id,planVersion:care.plan!.version,exerciseId:"demo-elbow"},care);
  const before=(await x.checkin.memory()).transcript.length;
  await x.checkin.exerciseFeedback({requestId:x.id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"session_started",sessionId:session.id,planId:session.planId,planVersion:session.planVersion}});
  assert.equal((await x.checkin.memory()).transcript.length,before);
  r=await x.answer(r,"My elbow pain is getting worse.");assert.equal(r.pauseExercise,true);const proposalId=r.proposalId;
  const report={sessionId:session.id,patientId:session.patientId,planId:session.planId,planVersion:session.planVersion,exerciseId:session.exerciseId,startedAt:session.startedAt,endedAt:new Date().toISOString(),repetitions:0,rangeDegrees:null,trackingQuality:"unavailable",evidence:"camera_estimated",terminationReason:"patient_stopped"};
  await x.rehab.finish(session.id,{requestId:x.id(),report});
  const late=await x.checkin.exerciseFeedback({requestId:x.id(),checkinId:r.checkin!.id,event:{version:"1.0.0",type:"report_saved",sessionId:session.id}});
  assert.equal(late.checkin?.stage,"help_confirmation");assert.equal(late.proposalId,proposalId);
  assert.ok((await x.checkin.memory()).events.some(e=>e.kind==="exercise_report"));assert.equal(x.writes(),0);
});

test("an older pain concern cannot suppress this call's medicine, food and follow-up agenda",async t=>{
  const x=await setup(t);await x.care.confirm("task-demo-001",{requestId:x.id(),expectedRevision:0,evidence:"patient_reported"});
  await x.care.help({requestId:x.id(),quote:"My elbow pain is getting worse and throbbing."});
  await x.memory.transaction("pat-demo-001",tx=>tx.append({id:"earlier-food",patientId:"pat-demo-001",kind:"food",quote:"Turkey sandwiches",at:new Date().toISOString(),source:"patient_report",metadata:{}}));
  let r=await x.greet();r=await x.answer(r,"It's better, but kind of sullen as well.");assert.equal(r.checkin?.stage,"wellbeing_followup");assert.match(r.message,/swollen/i);
  r=await x.answer(r,"No, let's go on. I don't think I have anything else.");assert.equal(r.checkin?.stage,"medications");assert.match(r.message,/recorded.*earlier/i);
  const writes=x.writes();r=await x.answer(r,"Yes, that's right");assert.equal(r.checkin?.stage,"food");assert.equal(x.writes(),writes);
  r=await x.answer(r,"No, nothing else");assert.equal(r.checkin?.stage,"followup");
  r=await x.answer(r,"Tomorrow morning");assert.equal(r.checkin?.stage,"complete");assert.equal(r.navigation,undefined);
  const saved=await x.checkin.memory();assert.equal(saved.checkin?.foodReviewed,true);assert.equal(saved.checkin?.followupReviewed,true);assert.equal(saved.checkin?.concernPending,true);
  assert.ok(saved.events.some(e=>e.kind==="scheduling_pending"&&e.quote==="Tomorrow morning"&&e.metadata.booked===false));
});
test("polite acknowledgement during a concern resumes check-ins; explicit goodbye can end early",async t=>{
  const x=await setup(t);let r=await x.greet();r=await x.answer(r,"Okay, thank you");assert.equal(r.checkin?.stage,"medications");assert.notEqual(r.conversationEnded,true);
  r=await x.answer(r,"Please end the call");assert.equal(r.conversationEnded,true);assert.equal((await x.checkin.memory()).checkin?.foodReviewed,false);
  r=await x.greet();assert.equal(r.checkin?.stage,"greeting");
});

test("politeness does not override a patient's actual question during the greeting",async t=>{
  const x=await setup(t);let r=await x.greet();r=await x.answer(r,"Thanks. What dose is in my plan?");
  assert.equal(r.checkin?.stage,"greeting");assert.match(r.message,/10 mg/i);assert.equal(x.writes(),0);
});

test("a confirmation response cannot replace the next required question with generic availability",async t=>{
  const x=await setup(t,async input=>input.moves.length===1&&input.moves[0].id==="respond"&&input.session.stage==="food"
    ?{move:"respond",response:"I'm here whenever you need me.",foodQuote:null,engine:"checkin_workflow"}:dialogueTurn(input));
  let r=await x.start();r=await x.answer(r,"Yes");r=await x.confirm(r);
  assert.equal(r.checkin?.stage,"food");assert.match(r.message,/what.*eat.*\?/i);assert.equal(x.writes(),1);
});

test('exercise setup and spoken controls work without a conversation provider and preserve unfinished checks',async t=>{
  let calls=0;
  const x=await setup(t,async()=>{calls++;throw Error('Conversation provider unavailable');});
  const opened=await x.checkin.openExercise({requestId:x.id()});
  const exerciseContext={exerciseId:'seated-knee-extension',label:'Seated knee extension',side:'left',stage:'ready',completedReps:0,targetReps:10};
  const input={requestId:x.id(),checkinId:opened.checkin!.id,expectedStage:'exercise',text:'start the set',exerciseContext};
  const started=await x.checkin.answer(input);
  assert.equal(started.exerciseControl?.action,'start');
  assert.equal(started.exerciseControl?.id,input.requestId);
  assert.deepEqual(await x.checkin.answer(input),started);
  const greeting=await x.checkin.answer({...input,requestId:x.id(),text:'hello',exerciseContext:{...exerciseContext,stage:'framing'}});
  assert.match(greeting.message,/left hip, knee and ankle/);
  assert.equal(calls,0);
  const memory=await x.checkin.memory();
  assert.equal(memory.checkin?.stage,'exercise');
  assert.equal(memory.checkin?.exerciseResumeStage,'medications');
  assert.equal(memory.checkin?.foodReviewed,false);
});

test('a saved exercise report reaches review even when the conversational model is rate limited',async t=>{
 const {DomainError}=await import('../packages/platform/json-store');
 const x=await setup(t,async(input,signal)=>{
   if(input.session.stage==='exercise_review')throw new DomainError('AI_RATE_LIMITED','quota unavailable',503);
   return dialogueTurn(input,signal);
 });
 const ready=await x.ready();
 const result=await x.exercise(ready);
 assert.equal(result.reply.checkin?.stage,'exercise_review');
 assert.match(result.reply.message,/feel/);
 const memory=await x.checkin.memory();
 assert.ok(memory.events.some(e=>e.kind==='exercise_report'));
});

test('a worsening-pain report holds exercise even when the conversational model is unavailable',async t=>{
 const x=await setup(t,async()=>{throw Error('Model unavailable');});
 const opened=await x.checkin.openExercise({requestId:x.id()});
 const result=await x.checkin.answer({requestId:x.id(),checkinId:opened.checkin!.id,expectedStage:'exercise',text:'My knee pain is getting worse',exerciseContext:{exerciseId:'seated-knee-extension',label:'Seated knee extension',side:'left',stage:'running',completedReps:1,targetReps:10}});
 assert.equal(result.pauseExercise,true);
 assert.equal(result.checkin?.stage,'help_confirmation');
 assert.doesNotMatch(result.speechText??'',/elbow/);
 assert.equal((await x.checkin.memory()).checkin?.concernPending,true);
});

test('a reviewed set releases its session binding before the next set starts',async t=>{
 const x=await setup(t);
 const first=await x.exercise(await x.ready());
 let r=await x.answer(first.reply,'It felt fine');
 r=await x.answer(r,'No pain');
 const opened=await x.checkin.openExercise({requestId:x.id()});
 assert.equal(opened.checkin?.stage,'exercise');
 assert.equal((await x.checkin.memory()).checkin?.exerciseSessionId,undefined);
 const second=await x.exercise(opened);
 assert.notEqual(second.session.id,first.session.id);
 assert.equal((await x.checkin.memory()).events.filter(e=>e.kind==='exercise_report').length,2);
});

test('a fresh recovery greeting explicitly offers a knee check-in even when model wording omits it',async t=>{
 const x=await setup(t,async()=>({move:'respond',response:'Hi. How are you today?',foodQuote:null,engine:'gemini'}));
 const r=await x.greet();assert.equal(r.checkin?.stage,'greeting');assert.match(r.message,/recovery check-in/i);assert.match(r.message,/left knee/i);assert.doesNotMatch(r.message,/elbow/);
});
