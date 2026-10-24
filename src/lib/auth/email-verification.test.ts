import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailVerificationToken, hashEmailVerificationToken, sendVerificationEmail } from "./email-verification";

const validToken = "s".repeat(43);

describe("email verification tokens and delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates a high-entropy URL-safe token and stores only its SHA-256 digest", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    const result = createEmailVerificationToken(now);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.tokenHash).toBe(createHash("sha256").update(result.token).digest("hex"));
    expect(result.tokenHash).not.toContain(result.token);
    expect(result.expiresAt.toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(hashEmailVerificationToken(result.token)).toBe(result.tokenHash);
  });

  it("sends a fixed-purpose Resend message with a no-redirect HTTPS confirmation URL", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response("provider response", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendVerificationEmail("person@example.test", validToken)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer resend-test-key");
    const body = JSON.parse(String(init.body)) as { from: string; to: string[]; subject: string; text: string };
    expect(body.from).toBe("Devobs <verified@example.test>");
    expect(body.to).toEqual(["person@example.test"]);
    expect(body.subject).toBe("Verify your Devobs email");
    expect(body.text).toContain(`https://app.example.test/verify-email#token=${validToken}`);
    expect(body.text).not.toContain("/verify-email?token=");
    expect(body.text).not.toContain("person@example.test");
  });

  it("fails closed when mail settings are missing or the public URL is insecure", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "http://app.example.test");

    await expect(sendVerificationEmail("person@example.test", validToken)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendVerificationEmail("person@example.test", validToken)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose provider error details", async () => {
    const providerCanary = "private-provider-response-canary";
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(providerCanary)));

    await expect(sendVerificationEmail("person@example.test", validToken)).resolves.toBe(false);
  });

  it("returns false for a provider rejection without reading or logging its response body", async () => {
    const providerCanary = "private-provider-response-canary";
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    const providerResponse = new Response(providerCanary, { status: 500 });
    const cancel = vi.spyOn(providerResponse.body!, "cancel");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse));

    await expect(sendVerificationEmail("person@example.test", validToken)).resolves.toBe(false);

    expect(cancel).toHaveBeenCalledOnce();
    expect(errorLog).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(providerCanary);
  });

  it("rejects malformed tokens before contacting the email provider", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Devobs <verified@example.test>");
    vi.stubEnv("APP_URL", "https://app.example.test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendVerificationEmail("person@example.test", "not-a-token")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
