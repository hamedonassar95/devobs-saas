import { describe, expect, it, vi } from "vitest";
import {
  analyzeAlertWithCloudflare,
  getCloudflareWorkersAiConfig,
  redactAlertText,
} from "./cloudflare";

const config = { accountId: "0123456789abcdef0123456789abcdef", apiToken: "test-token" };
const alert = {
  title: "Database failure for admin@example.com",
  description: "Postgres password=hunter2; request failed.",
  severity: "CRITICAL" as const,
  status: "OPEN" as const,
  sourceProvider: "PROMETHEUS" as const,
};
const freePlanEnvironment = {
  CLOUDFLARE_WORKERS_AI_ENABLED: "true",
  CLOUDFLARE_WORKERS_AI_FREE_PLAN_CONFIRMED: "true",
  CLOUDFLARE_ACCOUNT_ID: config.accountId,
  CLOUDFLARE_API_TOKEN: config.apiToken,
};

describe("Cloudflare Workers AI alert analysis", () => {
  it("fails closed unless the feature flag, free-plan confirmation, account ID, and token are all configured", () => {
    expect(getCloudflareWorkersAiConfig({})).toBeNull();
    expect(getCloudflareWorkersAiConfig({
      CLOUDFLARE_WORKERS_AI_ENABLED: "true",
      CLOUDFLARE_ACCOUNT_ID: "not-an-account-id",
      CLOUDFLARE_API_TOKEN: "token",
    })).toBeNull();
    expect(getCloudflareWorkersAiConfig({
      CLOUDFLARE_WORKERS_AI_ENABLED: "true",
      CLOUDFLARE_ACCOUNT_ID: config.accountId,
      CLOUDFLARE_API_TOKEN: config.apiToken,
    })).toBeNull();
    expect(getCloudflareWorkersAiConfig(freePlanEnvironment)).toEqual(config);
    expect(getCloudflareWorkersAiConfig({
      ...freePlanEnvironment,
      CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_PER_ORG: "101",
    })).toBeNull();
  });

  it("redacts credentials and email addresses before preparing provider input", () => {
    expect(redactAlertText("Bearer abc123 password=hunter2 sk-12345678901234567890 user@example.com"))
      .toBe("Bearer [REDACTED] password=[REDACTED] [REDACTED_SECRET] [REDACTED_EMAIL]");
  });

  it("sends one bounded request to the fixed Cloudflare endpoint and validates the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "Database connections are saturated.",
          likelyCause: "Connection pool exhaustion.",
          confidence: "medium",
          nextSteps: ["Check pool saturation and recent deployment changes."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await analyzeAlertWithCloudflare(alert, config, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
    expect(init?.redirect).toBe("error");
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }>; max_tokens: number };
    expect(body.messages[0].content).toContain("untrusted evidence");
    expect(body.messages[1].content).toContain("[REDACTED_EMAIL]");
    expect(body.messages[1].content).toContain("password=[REDACTED]");
    expect(body.messages[0].content).toContain("canonical alert contract");
    expect(body.messages[1].content).toContain('"sourceProvider":"PROMETHEUS"');
    expect(body.max_tokens).toBe(350);
    expect(result.details.engine).toBe("cloudflare-workers-ai");
    expect(result.details.sourceProvider).toBe("PROMETHEUS");
    expect(result.details.nextSteps).toHaveLength(1);
  });

  it("does not retry provider failures or accept malformed model output", async () => {
    const failedResponse = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(analyzeAlertWithCloudflare(alert, config, failedResponse)).rejects.toThrow("Cloudflare Workers AI request failed");
    expect(failedResponse).toHaveBeenCalledTimes(1);

    const malformedResponse = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ result: { response: "not-json" } }), { status: 200 }));
    await expect(analyzeAlertWithCloudflare(alert, config, malformedResponse)).rejects.toThrow("invalid analysis");
    expect(malformedResponse).toHaveBeenCalledTimes(1);
  });
});
