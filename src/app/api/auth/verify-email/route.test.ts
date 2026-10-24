import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashEmailVerificationToken } from "@/lib/auth/email-verification";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    pendingRegistration: { findUnique: vi.fn(), deleteMany: vi.fn() },
  },
  tx: {
    pendingRegistration: { findUnique: vi.fn(), delete: vi.fn() },
    user: { create: vi.fn() },
    organization: { create: vi.fn() },
    membership: { create: vi.fn() },
  },
  consumeAuthAttempt: vi.fn(),
  hashPassword: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeAuthAttempt: mocks.consumeAuthAttempt }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));

import { POST } from "./route";

const token = "a".repeat(43);
const pending = {
  id: "pending-1",
  email: "person@example.test",
  name: "Example Person",
  organizationName: "Example Team",
  tokenHash: hashEmailVerificationToken(token),
  expiresAt: new Date("2026-10-25T00:00:00.000Z"),
};

function verificationRequest(password = "long-enough-password") {
  return new Request("https://app.example.test/api/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));
    mocks.consumeAuthAttempt.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.hashPassword.mockResolvedValue("newly-hashed-password");
    mocks.prisma.pendingRegistration.findUnique.mockResolvedValue(pending);
    mocks.prisma.pendingRegistration.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.pendingRegistration.findUnique.mockResolvedValue(pending);
    mocks.tx.pendingRegistration.delete.mockResolvedValue(pending);
    mocks.tx.user.create.mockResolvedValue({ id: "user-1" });
    mocks.tx.organization.create.mockResolvedValue({ id: "org-1" });
    mocks.tx.membership.create.mockResolvedValue({ id: "membership-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(mocks.tx));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.consumeAuthAttempt.mockReset();
    mocks.hashPassword.mockReset();
    mocks.createSession.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.pendingRegistration.findUnique.mockReset();
    mocks.prisma.pendingRegistration.deleteMany.mockReset();
    mocks.tx.pendingRegistration.findUnique.mockReset();
    mocks.tx.pendingRegistration.delete.mockReset();
    mocks.tx.user.create.mockReset();
    mocks.tx.organization.create.mockReset();
    mocks.tx.membership.create.mockReset();
  });

  it("creates a verified account and workspace atomically, then creates its session", async () => {
    const response = await POST(verificationRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: pending.email,
        passwordHash: "newly-hashed-password",
        emailVerifiedAt: expect.any(Date),
        emailVerificationRequired: true,
      }),
    }));
    expect(mocks.tx.organization.create).toHaveBeenCalledOnce();
    expect(mocks.tx.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "user-1", organizationId: "org-1", role: "OWNER", status: "ACTIVE" }),
    }));
    expect(mocks.tx.pendingRegistration.delete).toHaveBeenCalledWith({ where: { id: pending.id } });
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
  });

  it("does not activate the registration when the chosen password is invalid", async () => {
    const response = await POST(verificationRequest("short"));

    expect(response.status).toBe(400);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects expired links without creating an account", async () => {
    mocks.prisma.pendingRegistration.findUnique.mockResolvedValue({ ...pending, expiresAt: new Date("2026-10-24T11:59:59.000Z") });

    const response = await POST(verificationRequest());

    expect(response.status).toBe(400);
    expect(mocks.prisma.pendingRegistration.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
