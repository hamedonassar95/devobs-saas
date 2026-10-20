import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { hashMonitoringWebhookToken } from "@/lib/monitoring/webhook-token";
import { createTenantMonitoringSource } from "./resources";

describe("monitoring webhook source creation", () => {
  it("returns a one-time random credential and persists only its hash under the authorized tenant", async () => {
    const create = vi.fn().mockResolvedValue({ id: "source-a", organizationId: "org-a", provider: "PROMETHEUS" });
    const createCredential = vi.fn().mockResolvedValue({ id: "credential-a" });
    const tx = {
      monitoringSource: { create },
      monitoringWebhookCredential: { create: createCredential },
    } as unknown as Prisma.TransactionClient;

    const result = await createTenantMonitoringSource(
      tx,
      { userId: "user-a", organizationId: "org-a" },
      { provider: "PROMETHEUS", name: "Production", organizationId: "org-b" },
    );

    expect(result.item).toMatchObject({ id: "source-a", organizationId: "org-a" });
    expect(result.webhookToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createCredential).toHaveBeenCalledWith({
      data: { organizationId: "org-a", sourceId: "source-a", tokenHash: hashMonitoringWebhookToken(result.webhookToken) },
    });
    expect(JSON.stringify(createCredential.mock.calls)).not.toContain(result.webhookToken);
  });
});
