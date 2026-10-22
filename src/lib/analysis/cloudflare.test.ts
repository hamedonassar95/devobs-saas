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
    expect(getCloudflareWorkersAiConfig({
      ...freePlanEnvironment,
      CLOUDFLARE_WORKERS_AI_MAX_DAILY_REQUESTS_TOTAL: "101",
    })).toBeNull();
  });

  it("redacts credentials and email addresses before preparing provider input", () => {
    expect(redactAlertText("Bearer abc123 password=hunter2 sk-12345678901234567890 user@example.com"))
      .toBe("Bearer [REDACTED] password=[REDACTED] [REDACTED_SECRET] [REDACTED_EMAIL]");
  });

  it("redacts Stripe, Google, package-registry, JWT, and database URL credentials", () => {
    const text = [
      `stripe=sk_live_${"s".repeat(24)}`,
      `webhook=whsec_${"w".repeat(24)}`,
      `google=AIza${"G".repeat(35)}`,
      `npm=npm_${"n".repeat(24)}`,
      `token=eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`,
      "postgresql://db_user:db_password@db.example.test:5432/app",
      "authorization=Bearer opaque-access-token",
    ].join(" ");

    const redacted = redactAlertText(text);

    expect(redacted).not.toContain("sk_live_");
    expect(redacted).not.toContain("whsec_");
    expect(redacted).not.toContain("AIza");
    expect(redacted).not.toContain("npm_");
    expect(redacted).not.toContain("eyJ");
    expect(redacted).not.toContain("db_user");
    expect(redacted).not.toContain("db_password");
    expect(redacted).not.toContain("opaque-access-token");
    expect(redacted).toContain("postgresql://[REDACTED]@db.example.test:5432/app");
  });

  it("removes multiline private-key material, including a truncated block", () => {
    const redacted = redactAlertText("key=\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----\nnext=ok");
    expect(redacted).not.toContain("private-material");
    expect(redacted).toContain("[REDACTED_PRIVATE_KEY]");

    const truncated = redactAlertText("-----BEGIN RSA PRIVATE KEY-----\nprivate-material-without-end-marker");
    expect(truncated).not.toContain("private-material");
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
        usage: { prompt_tokens: 240, completion_tokens: 42, total_tokens: 282 },
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
    expect(result.tokenUsage).toEqual({ promptTokens: 240, completionTokens: 42 });
  });

  it("rejects high-risk mutation advice even when the model output is valid JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "The service is unhealthy.",
          likelyCause: "The deployment may have introduced a regression.",
          confidence: "medium",
          nextSteps: ["Run kubectl delete pods in production now."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(analyzeAlertWithCloudflare(alert, config, fetcher)).rejects.toThrow("high-risk advice");
  });

  it("does not let an unrelated negation excuse later high-risk advice", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "The service is unhealthy.",
          likelyCause: "The deployment may have introduced a regression.",
          confidence: "medium",
          nextSteps: ["Do not run the deletion. Run kubectl delete pods in production now."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(analyzeAlertWithCloudflare(alert, config, fetcher)).rejects.toThrow("high-risk advice");
  });

  it("allows a clearly negated high-risk command in an advisory warning", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: "The service is unhealthy.",
          likelyCause: "The deployment may have introduced a regression.",
          confidence: "medium",
          nextSteps: ["Do not run kubectl delete in production; inspect pod events first."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await analyzeAlertWithCloudflare(alert, config, fetcher);

    expect(result.details.nextSteps[0]).toContain("Do not run kubectl delete");
  });

  it("redacts known credentials and email addresses echoed in model output", async () => {
    const credential = `sk_live_${"s".repeat(24)}`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      result: {
        response: JSON.stringify({
          summary: `The exposed credential was ${credential}.`,
          likelyCause: "Contact admin@example.com to confirm ownership.",
          confidence: "low",
          nextSteps: ["Review the affected service logs."],
        }),
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await analyzeAlertWithCloudflare(alert, config, fetcher);

    expect(result.summary).not.toContain(credential);
    expect(result.summary).toContain("[REDACTED_SECRET]");
    expect(result.details.likelyCause).not.toContain("admin@example.com");
    expect(result.details.likelyCause).toContain("[REDACTED_EMAIL]");
  });

  it("ignores missing or malformed optional usage without rejecting a valid analysis", async () => {
    for (const usage of [undefined, { prompt_tokens: -1, completion_tokens: 1 }, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 99 }]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
        result: {
          response: JSON.stringify({
            summary: "Database connections are saturated.",
            likelyCause: "Connection pool exhaustion.",
            confidence: "medium",
            nextSteps: ["Check pool saturation."],
          }),
          ...(usage ? { usage } : {}),
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

      await expect(analyzeAlertWithCloudflare(alert, config, fetcher)).resolves.toMatchObject({ tokenUsage: null });
    }
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
