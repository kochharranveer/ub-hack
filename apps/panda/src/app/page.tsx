"use client";
import { useEffect, useRef, useState } from "react";
import type { Plan, Task, VoiceReply } from "@contracts";
type SpeechResult = {
  results: { [key: number]: { [key: number]: { transcript: string } } };
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json();
  if (!out.ok) throw Error(out.error.message);
  return out.data;
}
export default function Panda() {
  const [plan, setPlan] = useState<Plan | null>(null),
    [tasks, setTasks] = useState<Task[]>([]),
    [text, setText] = useState(""),
    [reply, setReply] = useState<VoiceReply | null>(null),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [listening, setListening] = useState(false),
    [canMic, setCanMic] = useState(false),
    [tts, setTts] = useState("browser");
  const recognition = useRef<Recognition | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const audioAbort = useRef<AbortController | null>(null);
  function stopAudio() {
    audioAbort.current?.abort();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    window.speechSynthesis?.cancel();
  }
  const pending = useRef<{ requestId: string; text: string } | null>(null);
  async function load() {
    const c = await api("context");
    setPlan(c.plan);
    setTasks(c.tasks);
    setTts(c.ttsEngine);
  }
  useEffect(() => {
    setCanMic(
      Boolean(
        (window as SpeechWindow).SpeechRecognition ||
          (window as SpeechWindow).webkitSpeechRecognition,
      ),
    );
    void load().catch((e) => setStatus(e.message));
    return () => {
      recognition.current?.abort();
      stopAudio();
    };
  }, []);
  async function send(value = text) {
    if (!value.trim()) return;
    setBusy(true);
    recognition.current?.abort();
    stopAudio();
    if (pending.current?.text !== value)
      pending.current = { requestId: crypto.randomUUID(), text: value };
    try {
      setReply(await api("voice/turn", pending.current));
      setStatus("");
      pending.current = null;
      await load();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!reply?.proposalId) return;
    setBusy(true);
    try {
      setReply(await api("voice/confirm", { proposalId: reply.proposalId }));
      await load();
      setStatus("");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function mic() {
    const Ctor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Ctor || !consent) return;
    stopAudio();
    recognition.current?.abort();
    const rec = new Ctor();
    recognition.current = rec;
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      setText(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => {
      setListening(false);
      setStatus("Speech recognition failed. Use the text box.");
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setStatus("Could not start microphone. Use text instead.");
    }
  }
  async function speak() {
    if (!reply) return;
    stopAudio();
    if (tts !== "elevenlabs") {
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(reply.message),
      );
      return;
    }
    if (!consent) {
      setStatus(
        "Consent is required before sending response text to ElevenLabs.",
      );
      return;
    }
    const controller = new AbortController();
    audioAbort.current = controller;
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.message }),
        signal: controller.signal,
      });
      if (!r.ok) {
        const e = await r.json();
        throw Error(e.error.message);
      }
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      audioUrl.current = URL.createObjectURL(blob);
      audio.current = new Audio(audioUrl.current);
      await audio.current.play();
    } catch (e) {
      if (!controller.signal.aborted) setStatus((e as Error).message);
    }
  }
  return (
    <>
      <div className="eyebrow">Ranveer / Panda companion</div>
      <h1>
        A little help.
        <br />
        One clear next step.
      </h1>
      <p className="intro">
        Ask Panda about the approved plan, record your own completion, or
        request help. Every care action goes through Asmita’s care APIs.
      </p>
      <div className="grid">
        <section className="card">
          <div className="voice-orb" aria-hidden="true">
            ●
          </div>
          <h2>Talk to Panda</h2>
          <p className="muted">
            Without an API key, Panda uses labelled demo commands. With Gemini
            or OpenAI server configuration, an AI model selects the same
            validated tools.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label>
              Your question
              <textarea
                placeholder="Show my plan…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button disabled={busy || !text.trim()} type="submit">
              {busy ? "Working…" : "Send to Panda"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canMic || !consent || busy || listening}
              onClick={mic}
            >
              {listening ? "Listening…" : "Use microphone"}
            </button>
            {listening && (
              <button
                type="button"
                className="secondary"
                onClick={() => recognition.current?.abort()}
              >
                Stop listening
              </button>
            )}
          </form>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (!e.target.checked) recognition.current?.abort();
              }}
            />{" "}
            I consent to browser speech recognition for this synthetic demo. The
            browser may send audio to its speech service; ElevenLabs mode sends
            response text to ElevenLabs.
          </label>
          {!canMic && (
            <small>
              Speech input is unavailable in this browser. Text works with the
              same tools.
            </small>
          )}
          <div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => send("Show my plan")}
            >
              My plan
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => send("Open exercise")}
            >
              Exercise
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => send("I would like help from my care team")}
            >
              Request help
            </button>
          </div>
          <p role="status" className="status">
            {status}
          </p>
        </section>
        <section>
          <div className="card">
            <h2>Panda’s response</h2>
            {reply ? (
              <>
                <span className="pill">
                  {reply.engine === "demo_rules"
                    ? "Demo rules · no LLM"
                    : "AI tool routing"}
                </span>
                <span className="pill">{reply.mode}</span>
                <p className="message">{reply.message}</p>
                {reply.sourceRefs && (
                  <small>Sources: {reply.sourceRefs.join(", ")}</small>
                )}
                {reply.proposalId && (
                  <>
                    <button disabled={busy} onClick={confirm}>
                      Confirm this action
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setReply(null)}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {reply.navigation && (
                  <a className="button" href={reply.navigation}>
                    Open exercise app
                  </a>
                )}
                <button className="secondary" onClick={speak}>
                  Read aloud ·{" "}
                  {tts === "elevenlabs" ? "ElevenLabs" : "browser voice"}
                </button>
                <button className="secondary" onClick={stopAudio}>
                  Stop audio
                </button>
              </>
            ) : (
              <p>Try asking about today’s plan.</p>
            )}
          </div>
          <div className="card">
            <h2>Your approved context</h2>
            <span className="pill">Plan v{plan?.version || "—"}</span>
            {tasks.map((t) => (
              <div className="row" key={t.id}>
                <p>{t.title}</p>
                <span className="pill">{t.status}</span>
                {t.status === "pending" && (
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() => send("Confirm task " + t.id)}
                  >
                    Report completed
                  </button>
                )}
              </div>
            ))}
            <a href="/care">Open the full plan and care status →</a>
            <p className="muted">
              Panda records a request; clinician acknowledgement happens
              separately in the care hub. No emergency dispatch is connected.
            </p>
            <button
              className="secondary"
              onClick={() => void load().catch((e) => setStatus(e.message))}
            >
              Refresh approved context
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
