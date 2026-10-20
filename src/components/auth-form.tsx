"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Unable to sign in.");
      setBusy(false);
      return;
    }
    router.replace(mode === "register" ? "/billing" : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      {mode === "register" && <>
        <label>Name <input name="name" autoComplete="name" required maxLength={100} /></label>
        <label>Organization <input name="organizationName" required minLength={2} maxLength={100} /></label>
      </>}
      <label>Email <input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={12} maxLength={128} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    </form>
  );
}
