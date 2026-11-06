import { describe, expect, it } from "vitest";
import { createIncidentSchema, incidentStatusSchema } from "./input";

const validIncident = {
  title: "API latency regression",
  description: "Several affected service alerts need joint operator review.",
  alerts: [
    { alertId: "alert-a", reason: "Same monitored service and confirmed impact window." },
    { alertId: "alert-b", reason: "Same monitored service and confirmed impact window." },
  ],
};

describe("manual incident input contracts", () => {
  it("accepts a bounded incident with an explicit reason for each alert", () => {
    expect(createIncidentSchema.safeParse(validIncident).success).toBe(true);
  });

  it("rejects empty incident groups, duplicate alerts, and missing link reasons", () => {
    expect(createIncidentSchema.safeParse({ ...validIncident, alerts: [] }).success).toBe(false);
    expect(createIncidentSchema.safeParse({ ...validIncident, alerts: [validIncident.alerts[0], validIncident.alerts[0]] }).success).toBe(false);
    expect(createIncidentSchema.safeParse({ ...validIncident, alerts: [{ alertId: "alert-a", reason: "" }] }).success).toBe(false);
  });

  it("rejects excessive content, alert counts, and unknown fields", () => {
    expect(createIncidentSchema.safeParse({ ...validIncident, title: "x".repeat(161) }).success).toBe(false);
    expect(createIncidentSchema.safeParse({ ...validIncident, alerts: Array.from({ length: 26 }, (_, index) => ({ alertId: `alert-${index}`, reason: "Operator verified same service impact." })) }).success).toBe(false);
    expect(createIncidentSchema.safeParse({ ...validIncident, organizationId: "attacker-org" }).success).toBe(false);
  });

  it("accepts only the explicit incident lifecycle states", () => {
    expect(incidentStatusSchema.safeParse({ status: "OPEN" }).success).toBe(true);
    expect(incidentStatusSchema.safeParse({ status: "RESOLVED" }).success).toBe(true);
    expect(incidentStatusSchema.safeParse({ status: "CLOSED" }).success).toBe(false);
  });
});
