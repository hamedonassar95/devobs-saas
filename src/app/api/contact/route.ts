import { NextResponse } from "next/server";
import { z } from "zod";

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

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS = 4;
const submissions = new Map<string, { count: number; resetAt: number }>();

function takeSubmission(request: Request): boolean {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const key = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const current = submissions.get(key);

  if (!current || current.resetAt <= now) {
    if (submissions.size >= 256) {
      for (const [address, limit] of submissions) {
        if (limit.resetAt <= now) submissions.delete(address);
      }
      if (submissions.size >= 256) return false;
    }
    submissions.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_SUBMISSIONS) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request) {
  const parsed = contactSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the form fields and try again." },
      { status: 400 },
    );

  // Quietly accept honeypot submissions without forwarding them to the email provider.
  if (parsed.data.website) return NextResponse.json({ ok: true });
  if (!takeSubmission(request)) {
    return NextResponse.json(
      { error: "Too many messages. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const destination = process.env.CONTACT_EMAIL;
  const sender = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !destination || !sender) {
    return NextResponse.json(
      { error: "Contact is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const { name, email, company, message } = parsed.data;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
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
