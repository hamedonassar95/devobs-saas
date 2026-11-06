import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  requireTenantContext: vi.fn(),
  requireTenantContextForPermission: vi.fn(),
  withTenantTransaction: vi.fn(),
  requirePlanFeature: vi.fn(),
  createIncident: vi.fn(),
  listIncidents: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getAuthenticatedUserId: mocks.getAuthenticatedUserId }));
vi.mock("@/lib/tenant/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant/access")>();
  return {
    ...actual,
    requireTenantContext: mocks.requireTenantContext,
    requireTenantContextForPermission: mocks.requireTenantContextForPermission,
    withTenantTransaction: mocks.withTenantTransaction,
  };
});
vi.mock("@/lib/billing/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/entitlements")>();
  return { ...actual, requirePlanFeature: mocks.requirePlanFeature };
});
vi.mock("@/lib/incidents/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/incidents/service")>();
  return { ...actual, createIncident: mocks.createIncident, listIncidents: mocks.listIncidents };
});

import { GET, POST } from "./route";

const tenant = { userId: "user-a", organizationId: "org-a" };
const context = { params: Promise.resolve({ organizationId: "org-a" }) };
const incidentInput = {
  title: "API latency regression",
  alerts: [{ alertId: "alert-a", reason: "Same service and operator-confirmed impact window." }],
};

describe("organization incident collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue(tenant.userId);
    mocks.requireTenantContext.mockResolvedValue(tenant);
    mocks.requireTenantContextForPermission.mockResolvedValue(tenant);
    mocks.withTenantTransaction.mockImplementation(async (_tenant, operation) => operation({}));
    mocks.requirePlanFeature.mockResolvedValue(undefined);
    mocks.createIncident.mockResolvedValue({ id: "incident-a", organizationId: tenant.organizationId });
    mocks.listIncidents.mockResolvedValue([]);
  });

  it("creates only after write authorization and monitoring entitlement", async () => {
    const response = await POST(new Request("https://app.example.test/api/organizations/org-a/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(incidentInput),
    }), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ item: { id: "incident-a", organizationId: tenant.organizationId } });
    expect(mocks.requireTenantContextForPermission).toHaveBeenCalledWith(tenant.userId, tenant.organizationId, "write");
    expect(mocks.requirePlanFeature).toHaveBeenCalledWith({}, tenant.organizationId, "monitoring");
    expect(mocks.createIncident).toHaveBeenCalledWith({}, tenant, incidentInput);
  });

  it("rejects malformed link reasons without opening a tenant write", async () => {
    const response = await POST(new Request("https://app.example.test/api/organizations/org-a/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...incidentInput, alerts: [{ alertId: "alert-a", reason: "same" }] }),
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.requireTenantContextForPermission).not.toHaveBeenCalled();
    expect(mocks.createIncident).not.toHaveBeenCalled();
  });

  it("rejects invalid cursors before reading tenant data", async () => {
    const response = await GET(new Request("https://app.example.test/api/organizations/org-a/incidents?cursor=bad%20cursor"), context);
    expect(response.status).toBe(400);
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
    expect(mocks.listIncidents).not.toHaveBeenCalled();
  });
});
