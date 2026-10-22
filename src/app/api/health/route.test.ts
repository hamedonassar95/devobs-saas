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
  });

  it("returns 200 when the database probe succeeds", async () => {
    queryRaw.mockResolvedValue([] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("logs only safe database metadata and returns a generic 503 on failure", async () => {
    const privateConnectionDetails = "postgresql://db-user:private-password@db.example.test/app";
    const failure = Object.assign(new Error(`Connection failed: ${privateConnectionDetails}`), {
      errorCode: "P1001",
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(failure);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"unavailable"}');
    expect(body).not.toContain(privateConnectionDetails);
    expect(errorLog).toHaveBeenCalledWith("Health check database probe failed", {
      errorName: "Error",
      errorCode: "P1001",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(privateConnectionDetails);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not log unrecognized database error codes or messages", async () => {
    const failure = Object.assign(new Error("private diagnostic text"), {
      code: "password=do-not-log",
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(failure);

    await GET();

    expect(errorLog).toHaveBeenCalledWith("Health check database probe failed", {
      errorName: "Error",
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private diagnostic text");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("password=do-not-log");
  });
});
