import { describe, expect, it, vi } from "vitest";
import { analyzeAlert } from "./service";

const alert = {
  title: "Database connection pool",
  description: "Connections are saturated.",
  severity: "CRITICAL" as const,
  status: "OPEN" as const,
};
const enabledEnv = {
  CLOUDFLARE_WORKERS_AI_ENABLED: "true",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "test-token",
};

describe("alert analysis selection", () => {
  it("keeps organization analysis local unless the organization opted in", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await analyzeAlert(alert, false, { env: enabledEnv, fetcher });

    expect(result.model).toBe("local-rules-v1");
    expect(result.details.note).toContain("opt-in is disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses local rules without calling a provider when the global provider is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await analyzeAlert(alert, true, { env: {}, fetcher });

    expect(result.model).toBe("local-rules-fallback");
    expect(result.details.note).toContain("without an external request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns deterministic guidance after one provider failure without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("provider error", { status: 503 }));
    const result = await analyzeAlert(alert, true, { env: enabledEnv, fetcher });

    expect(result.model).toBe("local-rules-fallback");
    expect(result.details.note).toContain("no provider retry");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
