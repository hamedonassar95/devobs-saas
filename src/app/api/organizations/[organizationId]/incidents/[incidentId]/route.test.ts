import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  requireTenantContext: vi.fn(),
  requireTenantContextForPermission: vi.fn(),
  withTenantTransaction: vi.fn(),
  requirePlanFeature: vi.fn(),
  getIncident: vi.fn(),
  setIncidentStatus: vi.fn(),
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
  return { ...actual, getIncident: mocks.getIncident, setIncidentStatus: mocks.setIncidentStatus };
});

import { GET, PATCH } from "./route";

const tenant = { userId: "user-a", organizationId: "org-a" };
const context = { params: Promise.resolve({ organizationId: "org-a", incidentId: "incident-a" }) };

describe("organization incident detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUserId.mockResolvedValue(tenant.userId);
    mocks.requireTenantContext.mockResolvedValue(tenant);
    mocks.requireTenantContextForPermission.mockResolvedValue(tenant);
    mocks.withTenantTransaction.mockImplementation(async (_tenant, operation) => operation({}));
    mocks.requirePlanFeature.mockResolvedValue(undefined);
    mocks.getIncident.mockResolvedValue(null);
    mocks.setIncidentStatus.mockResolvedValue({ id: "incident-a", status: "RESOLVED" });
  });

  it("keeps unknown or cross-tenant incidents indistinguishable as not found", async () => {
    const response = await GET(new Request("https://app.example.test/api/organizations/org-a/incidents/incident-a"), context);
    expect(response.status).toBe(404);
  });

  it("accepts only lifecycle updates and enforces tenant write authorization", async () => {
    const response = await PATCH(new Request("https://app.example.test/api/organizations/org-a/incidents/incident-a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED" }),
    }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { id: "incident-a", status: "RESOLVED" } });
    expect(mocks.requireTenantContextForPermission).toHaveBeenCalledWith(tenant.userId, tenant.organizationId, "write");
    expect(mocks.setIncidentStatus).toHaveBeenCalledWith({}, tenant, "incident-a", "RESOLVED");
  });

  it("rejects any status outside the supported lifecycle", async () => {
    const response = await PATCH(new Request("https://app.example.test/api/organizations/org-a/incidents/incident-a", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.requireTenantContextForPermission).not.toHaveBeenCalled();
    expect(mocks.setIncidentStatus).not.toHaveBeenCalled();
  });
});
