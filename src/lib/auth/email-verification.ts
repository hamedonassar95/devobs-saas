import { createHash, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function createEmailVerificationToken(now = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_LIFETIME_MS),
  };
}

export function hashEmailVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createVerificationUrl(token: string): string | null {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return null;

  try {
    const baseUrl = new URL(appUrl);
    const isLocalHttp = process.env.NODE_ENV !== "production"
      && baseUrl.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
    if ((baseUrl.protocol !== "https:" && !isLocalHttp) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
      return null;
    }
    const verificationUrl = new URL("/verify-email", baseUrl.origin);
    verificationUrl.hash = new URLSearchParams({ token }).toString();
    return verificationUrl.toString();
  } catch {
    return null;
  }
}

/** Send a verification link through the configured Resend account without exposing provider details. */
export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.CONTACT_FROM_EMAIL;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const verificationUrl = createVerificationUrl(token);
  if (!apiKey || !sender || !verificationUrl) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: "Verify your Devobs email",
        text: [
          "Use the link below to verify your email address and finish creating your Devobs account.",
          "",
          verificationUrl,
          "",
          "The link expires in 24 hours. After opening it, enter the password you chose during registration to complete signup.",
          "If you did not request this, you can ignore this message.",
        ].join("\n"),
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}
