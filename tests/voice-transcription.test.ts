import test from "node:test";
import assert from "node:assert/strict";
import { transcribe } from "../apps/panda/src/server/transcription";
import { recordedRecognition } from "../apps/panda/src/app/recorded-recognition";
function audio() { const form=new FormData();form.set("file",new Blob([new Uint8Array([73,68,51])],{type:"audio/mpeg"}),"test.mp3");return form; }
test("transcription uses a server-only key, bounded request and validated text",async()=>{
  const original=globalThis.fetch,old=process.env.PANDA_ELEVENLABS_API_KEY;
  process.env.PANDA_ELEVENLABS_API_KEY="fake-transcription-key";
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),"https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(new Headers(options?.headers).get("xi-api-key"),"fake-transcription-key");
    const form=options?.body as FormData;
    assert.equal(form.get("model_id"),"scribe_v2");
    assert.ok(form.get("file") instanceof Blob);
    assert.ok(options?.signal);
    return Response.json({text:"My exact spoken words."});
  };
  try {assert.equal(await transcribe(audio()),"My exact spoken words.");}
  finally {globalThis.fetch=original;if(old)process.env.PANDA_ELEVENLABS_API_KEY=old;else delete process.env.PANDA_ELEVENLABS_API_KEY;}
});
test("transcription rejects remote URLs and non-audio instead of fetching arbitrary inputs",async()=>{
  const url=new FormData();url.set("source_url","https://untrusted.example/audio");
  await assert.rejects(()=>transcribe(url),/Only a microphone/);
  const invalid=new FormData();invalid.set("file",new Blob(["{}"],{type:"application/json"}),"input.json");
  await assert.rejects(()=>transcribe(invalid),/supported audio/);
});
test("transcription provider errors are sanitized and do not invent a transcript",async()=>{
  const original=globalThis.fetch,old=process.env.PANDA_ELEVENLABS_API_KEY;
  process.env.PANDA_ELEVENLABS_API_KEY="fake-key";
  globalThis.fetch=async()=>Response.json({error:"secret upstream body"},{status:403});
  try {await assert.rejects(()=>transcribe(audio()),error=>String(error).includes("transcription failed")&&!String(error).includes("secret"));}
  finally {globalThis.fetch=original;if(old)process.env.PANDA_ELEVENLABS_API_KEY=old;else delete process.env.PANDA_ELEVENLABS_API_KEY;}
});
test("recorded microphone fallback releases a stream arriving after cancellation",async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  let deliver!:(stream:MediaStream)=>void,stopped=0;
  const stream={getTracks:()=>[{stop:()=>{stopped++;}}]} as unknown as MediaStream;
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(resolve=>{deliver=resolve;})}}});
  const port=recordedRecognition(async()=>{throw Error("must not transcribe cancelled audio");},()=>{throw Error("must not process cancelled audio");});
  try {
    port.start();port.abort();deliver(stream);
    await Promise.resolve();await Promise.resolve();
    assert.equal(stopped,1);
  } finally {if(descriptor)Object.defineProperty(globalThis,"navigator",descriptor);else Reflect.deleteProperty(globalThis,"navigator");}
});
