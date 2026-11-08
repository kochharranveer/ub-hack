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
import type { VoiceReply } from "../packages/contracts/voice";

async function setup(t:test.TestContext) {
  const dir=await mkdtemp(path.join(tmpdir(),"panda-checkin-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const care=careService(path.join(dir,"care.json")),rehab=rehabService(path.join(dir,"rehab.json"));
  const memory=new PatientMemoryRepository(path.join(dir,"memory.sqlite"));
  let writes=0, clock=Date.now(), seenContext="";
  const voice=voiceService(path.join(dir,"voice.sqlite"),{
    mode:"connected",snapshot:()=>care.snapshot(),
    write:async(route,body)=>{writes++;return route==="help" ? care.help(body) : care.confirm(route.split("/")[1],body);},
  },async(text,c,_signal,remembered)=>{seenContext=remembered||"";return {command:demoCommand(text,c),engine:"demo_rules"};},undefined,()=>clock,memory);
  const checkin=checkinService(memory,voice,{snapshot:()=>care.snapshot(),exerciseSession:id=>rehab.session(id),mode:"connected"},()=>clock);
  let counter=0;
  const id=()=> "checkin-request-"+(++counter);
  const start=()=>checkin.start({requestId:id()});
  const answer=(reply:VoiceReply,text:string)=>checkin.answer({requestId:id(),checkinId:reply.checkin!.id,expectedStage:reply.checkin!.stage,text});
  const confirm=async(reply:VoiceReply)=>{
    await voice.confirm({proposalId:reply.proposalId});
    return checkin.continueAfterConfirmation({requestId:id(),checkinId:reply.checkin!.id,proposalId:reply.proposalId});
  };
  const ready=async()=>{
    let r=await start();r=await answer(r,"No, not yet");r=await answer(r,"Oatmeal and an apple");r=await answer(r,"Yes");return r;
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
  return {care,rehab,memory,voice,checkin,start,answer,confirm,ready,exercise,id,writes:()=>writes,seenContext:()=>seenContext,setClock:(value:number)=>{clock=value;}};
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
  assert.equal(r.checkin?.stage,"readiness");assert.match(r.message,/availability is pending/);
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
  assert.equal(r.checkin?.stage,"pain_check");assert.match(r.message,/describe/);
  const quote="My left elbow hurts.  I stopped.";
  r=await x.answer(r,quote);
  assert.equal(r.checkin?.stage,"help_confirmation");assert.equal((await x.care.snapshot()).help.length,0);
  r=await x.confirm(r);assert.equal(r.checkin?.stage,"complete");
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
