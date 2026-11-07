"use client";
import { useEffect, useRef, useState } from "react";
import type { VoiceContext, VoiceHistoryTurn, VoiceReply } from "@contracts";

export type Phase = "ready" | "listening" | "thinking" | "confirmation" | "saving" | "speech_loading" | "speaking";
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
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
  const [canMic, setCanMic] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const live = useRef(true);
  const generation = useRef(0);
  const soundGeneration = useRef(0);
  const latestReply = useRef<VoiceReply | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const speechAbort = useRef<AbortController | null>(null);
  const requests = useRef(new Set<AbortController>());
  const pending = useRef<{ requestId: string; text: string } | null>(null);
  const inFlight = useRef(false);
  const settledPhase = () => latestReply.current?.proposalId ? "confirmation" as const : "ready" as const;

  function stopMic() {
    const rec = recognition.current;
    recognition.current = null;
    if (rec) { rec.onresult = null; rec.onerror = null; rec.onend = null; rec.abort(); }
  }
  function stopSound() {
    soundGeneration.current++;
    speechAbort.current?.abort();
    speechAbort.current = null;
    if (audio.current) {
      audio.current.onended = null; audio.current.onerror = null;
      audio.current.pause(); audio.current.removeAttribute("src"); audio.current.load();
    }
    audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    window.speechSynthesis?.cancel();
  }
  function cleanup() {
    generation.current++;
    stopMic(); stopSound();
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
  useEffect(() => {
    live.current = true;
    const initGeneration = generation.current;
    setCanMic(window.isSecureContext && Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
    setCanSpeak(Boolean(window.speechSynthesis));
    const init = async () => {
      const results = await Promise.allSettled([
        loadContext(),
        request<VoiceHistoryTurn[]>("voice/history"),
      ]);
      if (!live.current || initGeneration !== generation.current) return;
      const past = results[1];
      if (past.status === "fulfilled") {
        setHistory(past.value);
        const last = past.value.at(-1)?.reply;
        if (last) acceptReply(last);
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

  async function send(value = text) {
    if (!value.trim() || value.length > 2000 || inFlight.current) return;
    stopMic(); stopSound();
    inFlight.current = true;
    const run = ++generation.current;
    setPhase("thinking"); setError(""); setNotice("");
    if (pending.current?.text !== value) pending.current = { requestId: crypto.randomUUID(), text: value };
    const input = pending.current;
    try {
      const result = await request<VoiceReply>("voice/turn", input);
      if (!live.current || run !== generation.current) return;
      pending.current = null;
      inFlight.current = false;
      acceptReply(result);
      setText("");
      setHistory(items => [...items.filter(i => i.requestId !== input.requestId), {
        ...input, reply: result, at: new Date().toISOString(),
      }].slice(-50));
      try { await loadContext(); }
      catch (e) { if ((e as Error).name !== "AbortError" && run === generation.current) setError("Reply saved. Context refresh failed: " + (e as Error).message); }
    } catch (e) {
      if (live.current && run === generation.current) { setPhase(settledPhase()); setError((e as Error).message); }
    } finally {
      if (run === generation.current) inFlight.current = false;
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
      const result = await request<VoiceReply>("voice/" + action, { proposalId });
      if (!live.current || run !== generation.current) return;
      inFlight.current = false;
      acceptReply(result);
      setHistory(items => items.map(i => i.reply.proposalId === proposalId ? { ...i, reply: result } : i));
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
      if (run === generation.current) inFlight.current = false;
    }
  }
  function mic() {
    const Ctor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor || !micConsent || !canMic || inFlight.current) return;
    stopMic(); stopSound(); setError(""); setNotice("");
    const rec = new Ctor();
    recognition.current = rec;
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = e => {
      if (recognition.current !== rec || !live.current) return;
      setText(e.results[0][0].transcript);
      setNotice("Transcript ready. Review it, then choose Send.");
    };
    rec.onerror = e => {
      if (recognition.current !== rec || !live.current) return;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow it in browser settings, or type below."
        : e.error === "no-speech" ? "No speech was heard. Try again or type below."
        : "Speech recognition is unavailable right now. Type your message below.");
      setPhase(settledPhase());
    };
    rec.onend = () => { if (recognition.current === rec && live.current) { recognition.current = null; setPhase(settledPhase()); } };
    try { rec.start(); setPhase("listening"); }
    catch { recognition.current = null; setError("Could not start the microphone. Type your message below."); setPhase(settledPhase()); }
  }
  async function speak(browserFallback = false) {
    const message = latestReply.current?.message;
    if (!message || inFlight.current) return;
    stopMic(); stopSound(); setError(""); setNotice("");
    const token = soundGeneration.current;
    const done = () => {
      if (live.current && token === soundGeneration.current) { stopSound(); setPhase(settledPhase()); }
    };
    if (browserFallback || context?.ttsEngine !== "elevenlabs") {
      if (!window.speechSynthesis) { setError("Browser speech is unavailable. You can read the response above."); return; }
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.onend = done;
      utterance.onerror = () => {
        if (live.current && token === soundGeneration.current) { setError("Browser speech could not play. Text remains available."); done(); }
      };
      setPhase("speaking"); window.speechSynthesis.speak(utterance);
      return;
    }
    if (!speechConsent) { setError("Enable speech consent before sending response text to ElevenLabs."); return; }
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
      const blob = await response.blob();
      if (controller.signal.aborted || token !== soundGeneration.current || !live.current) return;
      audioUrl.current = URL.createObjectURL(blob);
      const player = new Audio(audioUrl.current);
      audio.current = player;
      player.onended = done;
      player.onerror = () => { if (token === soundGeneration.current && live.current) { setError("Audio could not play. Try browser speech."); done(); } };
      await player.play();
      if (token === soundGeneration.current && live.current) setPhase("speaking");
    } catch (e) {
      if (token === soundGeneration.current && live.current) { setError((e as Error).message); done(); }
    }
  }
  function changeMicConsent(value: boolean) {
    setMicConsent(value);
    if (!value) { stopMic(); if (phase === "listening") setPhase(settledPhase()); }
  }
  function changeSpeechConsent(value: boolean) {
    setSpeechConsent(value);
    if (!value) { stopSound(); if (phase === "speaking" || phase === "speech_loading") setPhase(settledPhase()); }
  }
  return {
    context, history, reply, text, setText, phase, error, notice,
    micConsent, speechConsent, canMic, canSpeak, refreshing,
    busy: phase === "thinking" || phase === "saving",
    refresh, send, confirm: () => resolveProposal("confirm"), cancel: () => resolveProposal("cancel"),
    mic, speak, stop, changeMicConsent, changeSpeechConsent,
  };
}
