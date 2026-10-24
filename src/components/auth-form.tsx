"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState("");
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setEmailVerificationRequired(false);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: { error?: string; code?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? (mode === "register" ? "Unable to create your account. Please try again." : "Unable to sign in. Please try again."));
        setEmailVerificationRequired(result.code === "EMAIL_NOT_VERIFIED");
        return;
      }
      router.replace(mode === "register" ? "/verify-email" : "/dashboard/ai");
      router.refresh();
    } catch {
      setError("Unable to connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      {mode === "register" && <>
        <label className="auth-field">
          <span>Name</span>
          <input className="auth-input" name="name" autoComplete="name" required maxLength={100} />
        </label>
        <label className="auth-field">
          <span>Organization</span>
          <input className="auth-input" name="organizationName" autoComplete="organization" required minLength={2} maxLength={100} />
        </label>
      </>}
      <label className="auth-field">
        <span>Email</span>
        <input className="auth-input" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={254} />
      </label>
      {mode === "login" && <label className="auth-field">
        <span>Password</span>
          <input className="auth-input" name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={72} />
      </label>}
      {error && <p className="auth-error" role="alert" aria-live="polite">{error}</p>}
      {emailVerificationRequired && <p className="auth-switch"><Link href="/verify-email">Resend the verification email</Link></p>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    </form>
  );
}
