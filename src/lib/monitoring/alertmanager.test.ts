import { describe, expect, it } from "vitest";
import { MonitoringPayloadError, parseAlertmanagerPayload, readJsonBodyLimited } from "./alertmanager";

describe("self-hosted monitoring webhook payloads", () => {
  it("normalizes Alertmanager and Grafana alert records", () => {
    const alerts = parseAlertmanagerPayload({
      status: "firing",
      alerts: [
        {
          status: "firing",
          fingerprint: "alert-fingerprint-1",
          labels: { alertname: "High CPU", severity: "critical" },
          annotations: { summary: "CPU is high", description: "CPU exceeded 90 percent." },
          startsAt: "2026-10-20T00:00:00.000Z",
        },
        {
          status: "resolved",
          uid: "grafana-alert-2",
          labels: { alertname: "Disk space", severity: "warning" },
          annotations: { summary: "Disk returned to normal" },
          startsAt: "2026-10-19T23:00:00.000Z",
          endsAt: "2026-10-20T00:00:00.000Z",
        },
      ],
    });

    expect(alerts).toEqual([
      {
        externalId: "alert-fingerprint-1",
        title: "High CPU",
        description: "CPU exceeded 90 percent.",
        severity: "CRITICAL",
        status: "OPEN",
        openedAt: new Date("2026-10-20T00:00:00.000Z"),
        resolvedAt: null,
      },
      {
        externalId: "grafana-alert-2",
        title: "Disk space",
        description: "Disk returned to normal",
        severity: "WARNING",
        status: "RESOLVED",
        openedAt: new Date("2026-10-19T23:00:00.000Z"),
        resolvedAt: new Date("2026-10-20T00:00:00.000Z"),
      },
    ]);
  });

  it("requires a bounded alerts list and creates a stable fingerprint if absent", () => {
    const alert = {
      labels: { alertname: "Memory", instance: "service-a", severity: "warning" },
      annotations: {},
      startsAt: "2026-10-20T00:00:00Z",
    };
    const first = parseAlertmanagerPayload({ alerts: [alert] })[0];
    const second = parseAlertmanagerPayload({ alerts: [alert] })[0];

    expect(first.externalId).toMatch(/^[a-f0-9]{64}$/);
    expect(first.externalId).toBe(second.externalId);
    expect(() => parseAlertmanagerPayload({ alerts: Array.from({ length: 101 }, () => alert) }))
      .toThrow(MonitoringPayloadError);
  });

  it("caps streamed webhook request bodies before parsing JSON", async () => {
    const request = new Request("https://example.test/hook", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20" },
      body: "{\"alerts\":[]}",
    });

    await expect(readJsonBodyLimited(request, 10)).rejects.toThrow("too large");
  });
});
