"use client";
import { useState } from "react";
export function AuthForm({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(recovery = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        reset ? "/auth/password" : recovery ? "/auth/recover" : "/auth/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reset ? { password } : recovery ? { email } : { email, password },
          ),
        },
      );
      const out = await response.json();
      if (!out.ok) throw Error(out.error.message);
      if (recovery) {
        setMessage(out.data.message);
        return;
      }
      if (reset) {
        window.location.assign("/");
        return;
      }
      const session = await (await fetch("/auth/session")).json();
      if (!session.ok) throw Error(session.error.message);
      window.location.assign(session.data.role === "clinician" ? "/care" : "/");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        width: "min(100%, 400px)",
        margin: "auto",
        padding: "28px",
        borderRadius: 24,
        background: "#f4f7f2",
        color: "#183f36",
        boxSizing: "border-box",
      }}
    >
      <p style={{ fontWeight: 750, letterSpacing: "-.06em", fontSize: 28 }}>
        panda
      </p>
      <h1 style={{ fontSize: 28, margin: "20px 0 8px" }}>
        {reset ? "Choose your password" : "Welcome back"}
      </h1>
      <p>
        {reset
          ? "Use at least 12 characters."
          : "Sign in to your care companion."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!reset && (
          <label style={{ display: "block", margin: "18px 0" }}>
            Email
            <input
              style={{ width: "100%", boxSizing: "border-box", marginTop: 8 }}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        <label style={{ display: "block", margin: "18px 0" }}>
          Password
          <input
            style={{ width: "100%", boxSizing: "border-box", marginTop: 8 }}
            type="password"
            autoComplete={reset ? "new-password" : "current-password"}
            minLength={reset ? 12 : 1}
            maxLength={256}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button style={{ width: "100%" }} disabled={busy}>
          {busy ? "Please wait…" : reset ? "Save password" : "Sign in"}
        </button>
      </form>
      {!reset && (
        <>
          <button
            style={{ width: "100%", marginTop: 12 }}
            className="secondary"
            disabled={busy || !email}
            onClick={() => void submit(true)}
          >
            Forgot password?
          </button>
          <p style={{ fontSize: 13 }}>
            New here? Use the invitation from your care team.
          </p>
        </>
      )}
      <p role="status" aria-live="polite" style={{ fontSize: 14 }}>
        {message}
      </p>
    </section>
  );
}
