import test from "node:test";
import assert from "node:assert/strict";
import { ConversationAudio } from "../apps/panda/src/app/conversation-audio";
function fake(decode?:()=>Promise<AudioBuffer>){
  let starts=0,stops=0,disconnects=0,closes=0,resumes=0;
  const sources:{onended:(()=>void)|null;start:()=>void;stop:()=>void;disconnect:()=>void;connect:()=>void;buffer:unknown}[]=[];
  const context={state:"suspended",destination:{},
    resume:async()=>{resumes++;context.state="running";},close:async()=>{closes++;context.state="closed";},
    decodeAudioData:decode||(async()=>({} as AudioBuffer)),
    createBufferSource:()=>{const source={onended:null as (()=>void)|null,buffer:null as unknown,connect:()=>{},start:()=>{starts++;},stop:()=>{stops++;},disconnect:()=>{disconnects++;}};sources.push(source);return source;},
  };
  return {player:new ConversationAudio(()=>context as unknown as AudioContext),sources,counts:()=>({starts,stops,disconnects,closes,resumes})};
}
test("one tap unlocks successive spoken replies and their automatic next-turn callback",async()=>{
  const x=fake();let turns=0;
  await x.player.unlock();
  await x.player.play(new ArrayBuffer(1),()=>{turns++;});x.sources[0].onended?.();
  await x.player.play(new ArrayBuffer(1),()=>{turns++;});x.sources[1].onended?.();
  assert.equal(turns,2);assert.equal(x.counts().starts,2);assert.equal(x.counts().resumes,1);
  x.player.close();assert.equal(x.counts().closes,1);
});
test("mute during decoding prevents a late reply and prevents a next-turn callback",async()=>{
  let decoded!:(buffer:AudioBuffer)=>void;
  const x=fake(()=>new Promise(resolve=>{decoded=resolve;}));let turns=0;
  await x.player.unlock();const playing=x.player.play(new ArrayBuffer(1),()=>{turns++;});
  await Promise.resolve();x.player.stop();decoded({} as AudioBuffer);await playing;
  assert.equal(x.counts().starts,0);assert.equal(turns,0);x.player.close();
});
test("leaving the conversation stops and disconnects playback without resuming the microphone",async()=>{
  const x=fake();let turns=0;await x.player.play(new ArrayBuffer(1),()=>{turns++;});
  const lateEnd=x.sources[0].onended;x.player.close();lateEnd?.();
  assert.equal(turns,0);assert.equal(x.sources[0].onended,null);
  assert.deepEqual(x.counts(),{starts:1,stops:1,disconnects:1,closes:1,resumes:1});
});
