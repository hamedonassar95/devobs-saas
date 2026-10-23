import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { GET } from "./route";

const queryRaw = vi.mocked(prisma.$queryRaw);

describe("GET /api/health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    queryRaw.mockReset();
  });

  it("returns 200 when the database probe succeeds", async () => {
    queryRaw.mockResolvedValue([] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("logs only safe database metadata and returns a generic 503 on failure", async () => {
    const databaseUrlCanary = "database-url-canary-do-not-log";
    const messageCanary = "private-diagnostic-canary-do-not-log";
    vi.stubEnv("DATABASE_URL", databaseUrlCanary);
    const failure = Object.assign(new Error(messageCanary), {
      cause: Object.assign(new Error(messageCanary), { errorCode: "P1001" }),
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(failure);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain(databaseUrlCanary);
    expect(body).not.toContain(messageCanary);
    expect(errorLog).toHaveBeenCalledWith(
      "[health] Database connectivity check failed; returning HTTP 503.",
      JSON.stringify({
        event: "health_check.database_probe_failed",
        databaseUrlConfigured: true,
        errorName: "Error",
        errorCode: "P1001",
      }),
    );
    const serializedLogs = JSON.stringify(errorLog.mock.calls);
    expect(serializedLogs).not.toContain(databaseUrlCanary);
    expect(serializedLogs).not.toContain(messageCanary);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not log unrecognized database error codes or messages", async () => {
    const messageCanary = "private-message-canary-do-not-log";
    vi.stubEnv("DATABASE_URL", "");
    const failure = Object.assign(new Error(messageCanary), {
      code: "unrecognized-code-canary",
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(failure);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"status":"unavailable"}');
    expect(errorLog).toHaveBeenCalledWith(
      "[health] Database connectivity check failed; returning HTTP 503.",
      JSON.stringify({
        event: "health_check.database_probe_failed",
        databaseUrlConfigured: false,
        errorName: "Error",
      }),
    );
    const serializedLogs = JSON.stringify(errorLog.mock.calls);
    expect(serializedLogs).not.toContain(messageCanary);
    expect(serializedLogs).not.toContain("unrecognized-code-canary");
  });

  it("extracts only a Prisma code from a nested message and never logs connection details", async () => {
    const messageCanary =
      "Prisma error code P1000: failed for postgresql://private-user:private-password@db.example";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "configured-but-private");
    queryRaw.mockRejectedValue(
      Object.assign(new Error("Database initialization failed"), {
        cause: new Error(messageCanary),
      }),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(errorLog).toHaveBeenCalledWith(
      "[health] Database connectivity check failed; returning HTTP 503.",
      JSON.stringify({
        event: "health_check.database_probe_failed",
        databaseUrlConfigured: true,
        errorName: "Error",
        errorCode: "P1000",
      }),
    );
    const serializedLogs = JSON.stringify(errorLog.mock.calls);
    expect(serializedLogs).not.toContain(messageCanary);
    expect(serializedLogs).not.toContain("private-user");
    expect(serializedLogs).not.toContain("private-password");
    expect(serializedLogs).not.toContain("db.example");
  });

  it("extracts only an allowlisted connection code from a nested message", async () => {
    const messageCanary =
      "connection failed with ECONNREFUSED for postgresql://private-user:private-password@db.example";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "configured-but-private");
    queryRaw.mockRejectedValue(
      Object.assign(new Error("Database initialization failed"), {
        cause: new Error(messageCanary),
      }),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(errorLog).toHaveBeenCalledWith(
      "[health] Database connectivity check failed; returning HTTP 503.",
      JSON.stringify({
        event: "health_check.database_probe_failed",
        databaseUrlConfigured: true,
        errorName: "Error",
        errorCode: "ECONNREFUSED",
      }),
    );
    const serializedLogs = JSON.stringify(errorLog.mock.calls);
    expect(serializedLogs).not.toContain(messageCanary);
    expect(serializedLogs).not.toContain("private-user");
    expect(serializedLogs).not.toContain("private-password");
    expect(serializedLogs).not.toContain("db.example");
  });
});
