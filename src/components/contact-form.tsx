"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage(null);

    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error ?? "We couldn't send your message. Please try again.",
        );
      formElement.reset();
      setMessage({
        kind: "success",
        text: "Thanks for reaching out. Your message is on its way.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "We couldn't send your message. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="form-field-row">
        <label>
          Name
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={100}
            placeholder="Your name"
          />
        </label>
        <label>
          Work email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@company.com"
          />
        </label>
      </div>
      <label>
        Company <span className="optional-label">OPTIONAL</span>
        <input
          name="company"
          type="text"
          autoComplete="organization"
          maxLength={120}
          placeholder="Your company"
        />
      </label>
      <label>
        How can we help?
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={3000}
          rows={4}
          placeholder="Tell us what your team is working on…"
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Leave this field empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {message && (
        <p
          className={`form-feedback ${message.kind}`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      <button
        className="button button-primary form-submit"
        type="submit"
        disabled={busy}
      >
        {busy ? "Sending…" : "Send message"}
        <span aria-hidden="true">→</span>
      </button>
      <p className="form-privacy">
        Your details are only used to reply to this message.
      </p>
    </form>
  );
}
