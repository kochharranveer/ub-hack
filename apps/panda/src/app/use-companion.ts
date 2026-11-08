"use client";
import { useEffect, useRef, useState } from "react";
import { recordedRecognition, speechInputMode } from "./recorded-recognition";
import { spokenConfirmation } from "./voice-confirmation";
import { ConversationAudio } from "./conversation-audio";
import type { VoiceContext, VoiceHistoryTurn, VoiceReply } from "@contracts";
import type { CheckinSession, RehabBridgeEvent } from "../../../../packages/contracts/checkin";

export type Phase = "permission" | "ready" | "listening" | "thinking" | "confirmation" | "saving" | "speech_loading" | "speaking";
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string;message?:string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
};
type SpeechWindow = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}
async function api<T>(route: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch("/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal, cache: "no-store",
  });
  const out = await response.json();
  if (!response.ok || !out.ok) throw new ApiError(out.error?.message || "Request failed. Retry with the same action.", out.error?.code || "UNAVAILABLE", response.status);
  return out.data as T;
}
export function useCompanion() {
  const [context, setContext] = useState<VoiceContext | null>(null);
  const [history, setHistory] = useState<VoiceHistoryTurn[]>([]);
  const [reply, setReply] = useState<VoiceReply | null>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [micConsent, setMicConsent] = useState(false);
  const [speechConsent, setSpeechConsent] = useState(false);
  const micConsentRef=useRef(false),speechConsentRef=useRef(false);
  const [canMic, setCanMic] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checkin, setCheckin] = useState<VoiceReply["checkin"]>();
  const checkinRef=useRef<VoiceReply["checkin"]>(undefined);
  const startAttempt=useRef<{requestId:string}|null>(null);
  const continueAttempt=useRef<{requestId:string;checkinId:string;proposalId:string}|null>(null);
  const handsfree=useRef(false);
  const feedbackQueue=useRef<{requestId:string;checkinId:string;event:RehabBridgeEvent}[]>([]);
  const flushingFeedback=useRef(false);
  const live = useRef(true);
  const generation = useRef(0);
  const soundGeneration = useRef(0);
  const latestReply = useRef<VoiceReply | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const micRestart = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speaker = useRef(new ConversationAudio());
  const speechAbort = useRef<AbortController | null>(null);
  const requests = useRef(new Set<AbortController>());
  const pending = useRef<{ requestId: string; text: string; route:string; checkinId?:string; expectedStage?:string } | null>(null);
  const inFlight = useRef(false);
  const settledPhase = () => latestReply.current?.proposalId ? "confirmation" as const : "ready" as const;

  function stopMic() {
    if (micRestart.current) clearTimeout(micRestart.current);
    micRestart.current=null;
    const rec = recognition.current;
    recognition.current = null;
    if (rec) { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort(); }
  }
  function stopSound() {
    soundGeneration.current++;
    speechAbort.current?.abort();
    speechAbort.current = null;
    speaker.current.stop();
    window.speechSynthesis?.cancel();
  }
  function cleanup() {
    handsfree.current=false;
    generation.current++;
    stopMic(); stopSound();
    speaker.current.close();
    for (const controller of requests.current) controller.abort();
    requests.current.clear();
    inFlight.current = false;
  }
  function stop() {
    const wasSaving = phase === "saving";
    cleanup();
    setRefreshing(false);
    setPhase(settledPhase());
    setNotice(wasSaving
      ? "Stopped waiting. The action may already be recorded. Retry the same confirmation to check."
      : "Stopped. You can continue whenever you’re ready.");
  }
  function acceptReply(value: VoiceReply) {
    latestReply.current = value; setReply(value);
    if (value.checkin) {checkinRef.current=value.checkin;setCheckin(value.checkin);}
    setPhase(value.proposalId ? "confirmation" : "ready");
  }
  async function request<T>(route: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    requests.current.add(controller);
    try { return await api<T>(route, controller.signal, body); }
    finally { requests.current.delete(controller); }
  }
  async function loadContext() {
    const c = await request<VoiceContext>("context");
    if (live.current) setContext(c);
  }
  async function refresh() {
    setRefreshing(true); setError("");
    try { await loadContext(); }
    catch (e) { if (live.current && (e as Error).name !== "AbortError") setError((e as Error).message); }
    finally { if (live.current) setRefreshing(false); }
  }
  useEffect(()=>{
    setCanMic(window.isSecureContext && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition ||
      (context?.sttConfigured && "MediaRecorder" in window && "AudioContext" in window && navigator.mediaDevices?.getUserMedia)));
  },[context?.sttConfigured]);
  useEffect(() => {
    live.current = true;
    const initGeneration = generation.current;
    setCanMic(window.isSecureContext && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
    setCanSpeak(Boolean(window.speechSynthesis));
    const init = async () => {
      const results = await Promise.allSettled([
        loadContext(),
        request<VoiceHistoryTurn[]>("voice/history"),
        request<{checkin:CheckinSession|null}>("voice/memory"),
      ]);
      if (!live.current || initGeneration !== generation.current) return;
      const past = results[1];
      if (past.status === "fulfilled") {
        setHistory(past.value);
        const last = past.value.at(-1)?.reply;
        if (last) acceptReply(last);
      }
      const remembered=results[2];
      if (remembered.status==="fulfilled" && remembered.value.checkin && remembered.value.checkin.stage!=="complete") {
        checkinRef.current={id:remembered.value.checkin.id,stage:remembered.value.checkin.stage};setCheckin(checkinRef.current);
      }
      const failed = results.find(r => r.status === "rejected" && r.reason?.name !== "AbortError");
      if (failed?.status === "rejected") setError(failed.reason.message);
    };
    void init();
    const leave = () => cleanup();
    const hide = () => {
      if (document.visibilityState === "hidden") {
        cleanup();
        if (live.current) { setPhase(settledPhase()); setRefreshing(false); }
      }
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      live.current = false; cleanup();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
    };
    // Refs own resource cleanup; initialise once per mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(value = text, direct = false) {
    if (!value.trim() || value.length > 2000 || inFlight.current) return;
    stopMic(); stopSound();
    inFlight.current = true;
    const run = ++generation.current;
    setPhase("thinking"); setError(""); setNotice("");
    const activeCheckin=!direct && checkinRef.current && checkinRef.current.stage!=="complete" ? checkinRef.current : undefined;
    const route=activeCheckin ? "voice/checkin/answer" : "voice/turn";
    if (pending.current?.text !== value || pending.current.route!==route) pending.current = { requestId: crypto.randomUUID(), text: value, route, ...(activeCheckin ? {checkinId:activeCheckin.id,expectedStage:activeCheckin.stage} : {}) };
    const input = pending.current;
    try {
      const {route:target,...payload}=input;
      const result = await request<VoiceReply>(target, payload);
      if (!live.current || run !== generation.current) return;
      pending.current = null;
      inFlight.current = false;
      acceptReply(result);
      setText("");
      if (handsfree.current) void speak();
      setHistory(items => [...items.filter(i => i.requestId !== input.requestId), {
        requestId:input.requestId,text:input.text,reply: result, at: new Date().toISOString(),
      }].slice(-50));
      try { await loadContext(); }
      catch (e) { if ((e as Error).name !== "AbortError" && run === generation.current) setError("Reply saved. Context refresh failed: " + (e as Error).message); }
    } catch (e) {
      if (live.current && run === generation.current) { setPhase(settledPhase()); setError((e as Error).message); }
    } finally {
      if (run === generation.current) {inFlight.current = false;if (feedbackQueue.current.length) void flushFeedback();}
    }
  }
  async function resolveProposal(action: "confirm" | "cancel") {
    const proposalId = latestReply.current?.proposalId;
    if (!proposalId || inFlight.current) return;
    stopMic(); stopSound();
    inFlight.current = true;
    const run = ++generation.current;
    setPhase("saving"); setError(""); setNotice("");
    try {
      let result = await request<VoiceReply>("voice/" + action, { proposalId });
      const current=checkinRef.current;
      if (current && ["medication_confirmation","help_confirmation"].includes(current.stage)) {
        if (continueAttempt.current?.proposalId!==proposalId) continueAttempt.current={requestId:crypto.randomUUID(),checkinId:current.id,proposalId};
        result=await request<VoiceReply>("voice/checkin/continue",continueAttempt.current);
        continueAttempt.current=null;
      }
      if (!live.current || run !== generation.current) return;
      inFlight.current = false;
      acceptReply(result);
      setHistory(items => items.map(i => i.reply.proposalId === proposalId ? { ...i, reply: result } : i));
      if (handsfree.current) void speak();
      try { await loadContext(); }
      catch (e) { if ((e as Error).name !== "AbortError" && run === generation.current) setError("Action result received. Refresh Care status: " + (e as Error).message); }
    } catch (e) {
      if (!live.current || run !== generation.current) return;
      const err = e as ApiError;
      if (err.status === 409 || err.status === 404) {
        acceptReply({ ...latestReply.current!, proposalId: undefined, message: err.message });
        void refresh();
      } else setPhase("confirmation");
      setError(err.message);
    } finally {
      if (run === generation.current) {inFlight.current = false;if (feedbackQueue.current.length) void flushFeedback();}
    }
  }
  function mic() {
    const Ctor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!micConsentRef.current || !canMic || inFlight.current) return;
    stopMic(); stopSound(); setError(""); setNotice("");
    const selected=speechInputMode(Boolean(Ctor),Boolean("MediaRecorder" in window&&"AudioContext" in window&&navigator.mediaDevices?.getUserMedia),Boolean(context?.sttConfigured));
    const rec = selected==="native"&&Ctor ? new Ctor() : recordedRecognition(async(blob,signal)=>{
      const form=new FormData();form.set("file",blob,/mp4/.test(blob.type)?"microphone.mp4":"microphone.webm");
      const response=await fetch("/api/voice/transcribe",{method:"POST",body:form,signal});
      const out=await response.json();
      if(!response.ok||!out.ok)throw Error(out.error?.message||"Transcription unavailable");
      return out.data.text as string;
    },()=>{if(live.current)setPhase("thinking");},()=>speaker.current.captureContext());
    recognition.current = rec;
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
    const spokenProposal=latestReply.current?.proposalId;
    let received=false,failed=false;
    rec.onresult = e => {
      if (recognition.current !== rec || !live.current) return;
      received=true;
      const transcript=e.results[0][0].transcript;
      setText(transcript);
      if (handsfree.current && spokenProposal) {
        if (spokenProposal!==latestReply.current?.proposalId) return;
        const choice=spokenConfirmation(transcript);
        if(choice){setText("");void resolveProposal(choice);}
        else {
          stopMic();
          acceptReply({...latestReply.current!,message:"Please say confirm or cancel for this action.\n"+latestReply.current!.message.replace(/^Please say confirm or cancel for this action\.\n/,"")});
          void speak();
        }
      }
      else if (handsfree.current) void send(transcript);
      else setNotice("Transcript ready. Review it, then choose Send.");
    };
    rec.onerror = e => {
      if (recognition.current !== rec || !live.current) return;
      // Silence is normal in a conversation. Keep waiting until the patient ends or mutes it.
      if(e.error==="no-speech"&&handsfree.current){setPhase("listening");return;}
      failed=true;handsfree.current=false;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was denied. Allow it in browser settings, then tap the mic again. You can also use Keyboard."
        : e.error === "no-speech" ? "No speech was heard. Tap the mic to try again."
        : e.error === "transcription-unavailable" ? e.message||"Transcription is unavailable. Tap the mic to retry or use Keyboard."
        : e.error === "audio-capture" ? "The microphone could not record. Check your input device, then tap the mic again."
        : "Browser speech recognition failed. Tap the mic to retry or use Keyboard.");
      setPhase(settledPhase());
    };
    rec.onend = () => { if (recognition.current === rec && live.current) {
      recognition.current = null;
      if(handsfree.current&&!received&&!failed&&!inFlight.current){
        setPhase("listening");micRestart.current=setTimeout(()=>{micRestart.current=null;if(live.current&&handsfree.current)mic();},300);
      }else setPhase(settledPhase());
    } };
    try { rec.start(); setPhase("listening"); }
    catch { recognition.current = null; setError("Could not start the microphone. Type your message below."); setPhase(settledPhase()); }
  }
  async function speak(browserFallback = false) {
    const replyMessage = latestReply.current?.message;
    const message = replyMessage && (replyMessage+(latestReply.current?.proposalId?"\nSay confirm or cancel.":""));
    if (!message || inFlight.current) return;
    stopMic(); stopSound(); setError(""); setNotice("");
    const token = soundGeneration.current;
    const done = () => {
      if (live.current && token === soundGeneration.current) {
        stopSound(); setPhase(settledPhase());
        if (handsfree.current) mic();
      }
    };
    if (browserFallback || context?.ttsEngine !== "elevenlabs") {
      if (!window.speechSynthesis) { setError("Browser speech is unavailable. You can read the response above."); return; }
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.onend = done;
      utterance.onerror = () => {
        if (live.current && token === soundGeneration.current) { handsfree.current=false;setError("Browser speech could not play. Text remains available."); done(); }
      };
      setPhase("speaking"); window.speechSynthesis.speak(utterance);
      return;
    }
    if (!speechConsentRef.current) { setError("Enable speech consent before sending response text to ElevenLabs."); return; }
    const controller = new AbortController();
    speechAbort.current = controller;
    setPhase("speech_loading");
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }), signal: controller.signal,
      });
      if (!response.ok) {
        const out = await response.json();
        throw new Error(out.error?.message || "Speech could not load. Choose browser speech or read the text.");
      }
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted || token !== soundGeneration.current || !live.current) return;
      await speaker.current.play(bytes,done);
      if (token === soundGeneration.current && live.current) setPhase("speaking");
    } catch (e) {
      if (token === soundGeneration.current && live.current) { handsfree.current=false;setError((e as Error).message); done(); }
    }
  }

  async function beginCheckin(withVoice=false) {
    if (inFlight.current) return;
    stopMic(); stopSound(); inFlight.current=true;
    const run=++generation.current;
    setError("");setNotice("");setPhase("thinking");
    startAttempt.current ??= {requestId:crypto.randomUUID()};
    try {
      const result=await request<VoiceReply>("voice/checkin/start",startAttempt.current);
      if (!live.current || run!==generation.current) return;
      startAttempt.current=null;
      inFlight.current=false;
      acceptReply(result);
      handsfree.current=Boolean(withVoice && micConsentRef.current && canMic && (context?.ttsEngine!=="elevenlabs" || speechConsentRef.current));
      if (handsfree.current) void speak();
    } catch(e) {if (live.current && run===generation.current) {setError((e as Error).message);setPhase(settledPhase());}}
    finally {if (run===generation.current) {inFlight.current=false;if (feedbackQueue.current.length) void flushFeedback();}}
  }
  async function flushFeedback() {
    if (flushingFeedback.current || inFlight.current) return;
    flushingFeedback.current=true;
    try {
      while (feedbackQueue.current.length && live.current) {
        const item=feedbackQueue.current[0];
        const result=await request<VoiceReply>("voice/exercise-feedback",item);
        feedbackQueue.current.shift();
        if (!live.current) break;
        // Camera/tracking updates must not interrupt a patient mid-sentence.
        if (item.event.type==="report_saved") {
          stopMic();stopSound();acceptReply(result);
          if (handsfree.current) void speak();
        } else if (result.checkin) {checkinRef.current=result.checkin;setCheckin(result.checkin);}
      }
    } catch(e) {if (live.current) setError("Exercise is saved in Rehab, but Panda context sync needs a retry: "+(e as Error).message);}
    finally {flushingFeedback.current=false;}
  }
  function exerciseFeedback(event:RehabBridgeEvent) {
    const current=checkinRef.current;
    if (!current) return;
    feedbackQueue.current.push({requestId:crypto.randomUUID(),checkinId:current.id,event});
    void flushFeedback();
  }
  async function rememberedContext() {return request<{patientId:string;retention:string;totalEvents:number;events:{id:string;kind:string;quote:string;at:string;source:string}[]}>("voice/memory");}


  async function activateVoice() {
    if (inFlight.current) return;
    inFlight.current=true;
    const token=++generation.current;
    setError("");setNotice("");setPhase("permission");
    let permissionStream:MediaStream|undefined;
    try {
      if (!canMic) throw Error("Speech recognition is unavailable in this browser. Use the keyboard button below.");
      // Resume from the original tap before awaiting permission/network work.
      if(context?.ttsEngine==="elevenlabs"||context?.sttConfigured)await speaker.current.unlock();
      if (!live.current || token!==generation.current) return;
      if (!micConsentRef.current && navigator.mediaDevices?.getUserMedia) {
        permissionStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        permissionStream.getTracks().forEach(track=>track.stop());permissionStream=undefined;
      }
      if (!live.current || token!==generation.current) return;
      changeMicConsent(true);changeSpeechConsent(true);
      inFlight.current=false;
      await beginCheckin(true);
    } catch(e) {
      if (live.current && token===generation.current) {
        handsfree.current=false;
        setError((e as Error).name==="NotAllowedError" ? "Microphone permission was denied. Allow it in browser settings, or use the keyboard." : (e as Error).message);
        setPhase(settledPhase());
      }
    } finally {
      permissionStream?.getTracks().forEach(track=>track.stop());
      if (token===generation.current) inFlight.current=false;
    }
  }
  function listen() {
    if (!micConsentRef.current || !canMic) {void activateVoice();return;}
    const token=generation.current;
    const ready=context?.ttsEngine==="elevenlabs"||context?.sttConfigured?speaker.current.unlock():Promise.resolve();
    void ready.then(()=>{if(live.current&&token===generation.current){handsfree.current=true;mic();}}).catch(()=>{
      if(live.current&&token===generation.current)setError("Audio is unavailable. Use the keyboard to continue.");
    });
  }

  function changeMicConsent(value: boolean) {
    micConsentRef.current=value;setMicConsent(value);
    if (!value) { stopMic(); if (phase === "listening") setPhase(settledPhase()); }
  }
  function changeSpeechConsent(value: boolean) {
    speechConsentRef.current=value;setSpeechConsent(value);
    if (!value) { stopSound(); if (phase === "speaking" || phase === "speech_loading") setPhase(settledPhase()); }
  }
  return {
    context, history, reply, text, setText, phase, error, notice, checkin,
    micConsent, speechConsent, canMic, canSpeak, refreshing,
    busy: phase === "thinking" || phase === "saving",
    refresh, send, confirm: () => resolveProposal("confirm"), cancel: () => resolveProposal("cancel"),
    mic, listen, speak, stop, activateVoice, changeMicConsent, changeSpeechConsent, beginCheckin, exerciseFeedback, retryFeedback:flushFeedback, rememberedContext,
  };
}
