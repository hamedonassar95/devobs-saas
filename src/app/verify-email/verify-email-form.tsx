"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function VerifyEmailForm() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setToken(candidate && /^[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null);
    setTokenReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokenReady) return;
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = token
        ? await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, password: form.get("password") }),
          })
        : await fetch("/api/auth/resend-verification", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: form.get("email") }),
          });
      const result: { error?: string } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error ?? "Unable to process this request. Please try again.");
        return;
      }
      if (token) {
        router.replace("/billing");
        router.refresh();
        return;
      }
      setMessage("If a registration can be completed for that address, we sent a new verification link. It may take a few minutes to arrive.");
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!tokenReady) return <p className="auth-intro" role="status">Preparing verification…</p>;

  return (
    <>
      <form className="auth-form" onSubmit={submit} aria-busy={busy}>
        {token ? (
          <label className="auth-field">
            <span>Choose a password</span>
            <input className="auth-input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
        ) : (
          <label className="auth-field">
            <span>Email</span>
            <input className="auth-input" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={254} />
          </label>
        )}
        {error && <p className="auth-error" role="alert" aria-live="polite">{error}</p>}
        {message && <p className="auth-intro" role="status" aria-live="polite">{message}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : token ? "Verify email and continue" : "Resend verification email"}</button>
      </form>
      {token && <p className="auth-switch"><Link href="/verify-email">Request another verification link</Link></p>}
      <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>
    </>
  );
}
