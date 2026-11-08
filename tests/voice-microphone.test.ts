import test from "node:test";
import assert from "node:assert/strict";
import {ConversationMicrophone} from "../apps/panda/src/app/conversation-microphone";
test("successive voice turns reuse one input device until the call ends",async()=>{
  let captures=0,stops=0;const stream={getTracks:()=>[{readyState:"live",stop:()=>{stops++;}}]} as unknown as MediaStream;
  const microphone=new ConversationMicrophone(async()=>{captures++;return stream;});
  assert.equal(await microphone.open(),await microphone.open());assert.equal(captures,1);assert.equal(stops,0);
  microphone.close();assert.equal(stops,1);await microphone.open();assert.equal(captures,2);microphone.close();
});
test("stopping a call releases input permission that arrives later",async()=>{
  let deliver!:(stream:MediaStream)=>void,stops=0;
  const microphone=new ConversationMicrophone(()=>new Promise(resolve=>{deliver=resolve;}));
  const capture=microphone.open();microphone.close();deliver({getTracks:()=>[{stop:()=>{stops++;}}]} as unknown as MediaStream);
  await assert.rejects(()=>capture,/Call stopped/);assert.equal(stops,1);
});
test("concurrent capture requests share permission and a denial can be retried",async()=>{
  let calls=0;const microphone=new ConversationMicrophone(async()=>{calls++;if(calls===1)throw new DOMException("Denied","NotAllowedError");return {getTracks:()=>[{readyState:"live",stop:()=>{}}]} as unknown as MediaStream;});
  const first=microphone.open();assert.equal(first,microphone.open());await assert.rejects(()=>first);await microphone.open();assert.equal(calls,2);microphone.close();
});
