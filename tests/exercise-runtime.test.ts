import test from 'node:test';
import assert from 'node:assert/strict';
import { settleCalibration } from '../packages/rehab-bridge/calibration-settling';
import { exerciseCommand, routineExerciseTurn, type ExerciseRuntime } from '../packages/contracts/exercise-runtime';
const result = {detectedPosition:'rest' as const,accepted:true,angleDeg:90,confidence:.95,stable:true,cue:'Hold here.',workingMemory:'Rest.'};
test('three consistent calibration replies settle even when each provider call takes seven seconds',()=>{
 let state=settleCalibration(null,result,0);
 state=settleCalibration(state.candidate,{...result,angleDeg:92},7000);
 assert.equal(state.angle,null);
 state=settleCalibration(state.candidate,{...result,angleDeg:91},14000);
 assert.equal(state.angle,91);
});
test('pose transitions, inconsistent angles and long gaps cannot settle a reference',()=>{
 const first=settleCalibration(null,result,0);
 assert.equal(settleCalibration(first.candidate,{...result,angleDeg:140},7000).candidate?.angles.length,1);
 assert.equal(settleCalibration(first.candidate,result,31000).candidate?.angles.length,1);
 assert.equal(settleCalibration(first.candidate,{...result,detectedPosition:'transition'},7000).candidate,null);
 assert.equal(settleCalibration(first.candidate,{...result,confidence:.4},7000).candidate,null);
});
test('spoken set controls distinguish actions from questions, negations and discomfort',()=>{
 for(const text of ['start','Start the set','let’s start','begin the exercise']) {
   assert.equal(exerciseCommand(text),'start',text);
 }
 assert.equal(exerciseCommand('pause the set'),'pause');
 assert.equal(exerciseCommand('resume'),'resume');
 assert.equal(exerciseCommand('finish and save'),'finish');
 for(const text of ["don't start",'why did the set not start?','start but my knee hurts','what should I do?'])assert.equal(exerciseCommand(text),undefined);
});
test('exercise greetings guide the current knee setup instead of restarting the elbow check-in',()=>{
 const state:ExerciseRuntime={exerciseId:'seated-knee-extension',label:'Seated knee extension',side:'left',stage:'framing',completedReps:0,targetReps:10};
 const reply=routineExerciseTurn('hello',state);
 assert.match(reply!.message,/left hip, knee and ankle/);
 assert.doesNotMatch(reply!.message,/elbow|taken.*medicine/);
 assert.equal(routineExerciseTurn('start the set',state)?.control,'start');
});

test('one Gemini check can settle when a full stable local window independently agrees',()=>{
 assert.equal(settleCalibration(null,result,0,{ready:true,angleDeg:91}).angle,90);
 assert.equal(settleCalibration(null,result,0,{ready:false,angleDeg:90}).angle,null);
 assert.equal(settleCalibration(null,result,0,{ready:true,angleDeg:120}).angle,null);
});
