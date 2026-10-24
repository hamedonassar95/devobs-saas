import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAuthAttempt } from "@/lib/auth/rate-limit";
import { readBoundedJson } from "@/lib/http/bounded-json";

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => !/[\r\n]/.test(value)),
  email: z.email().max(254),
  company: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(10).max(3000),
  website: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const body = await readBoundedJson(request);
  if (body && "tooLarge" in body) {
    return NextResponse.json({ error: "The contact message is too large." }, { status: 413 });
  }
  const parsed = contactSchema.safeParse(body?.data ?? null);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the form fields and try again." },
      { status: 400 },
    );

  // Quietly accept honeypot submissions without forwarding them to the email provider.
  if (parsed.data.website) return NextResponse.json({ ok: true });

  const apiKey = process.env.RESEND_API_KEY;
  const destination = process.env.CONTACT_EMAIL;
  const sender = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !destination || !sender) {
    return NextResponse.json(
      { error: "Contact is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const emailLimit = await consumeAuthAttempt("contactEmail", parsed.data.email);
  const globalLimit = emailLimit.allowed
    ? await consumeAuthAttempt("contactGlobal", "all-contact-submissions")
    : emailLimit;
  if (!emailLimit.allowed || !globalLimit.allowed) {
    const retryAfterSeconds = Math.max(emailLimit.retryAfterSeconds, globalLimit.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many messages. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const { name, email, company, message } = parsed.data;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [destination],
        reply_to: email,
        subject: `New Devobs inquiry from ${name}`,
        text: [
          `Name: ${name}`,
          `Email: ${email}`,
          `Company: ${company || "Not provided"}`,
          "",
          message,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok)
      return NextResponse.json(
        { error: "We couldn't send your message. Please try again later." },
        { status: 502 },
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "We couldn't send your message. Please try again later." },
      { status: 502 },
    );
  }
}
