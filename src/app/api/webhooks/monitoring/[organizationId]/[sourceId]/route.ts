import { timingSafeEqual } from "node:crypto";
import { AlertSeverity, AlertStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { MonitoringPayloadError, parseAlertmanagerPayload, readJsonBodyLimited } from "@/lib/monitoring/alertmanager";
import { hashMonitoringWebhookToken } from "@/lib/monitoring/webhook-token";
import { TenantAccessError, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string; sourceId: string }> };

const MAX_WEBHOOK_BYTES = 256 * 1024;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/);
  return match?.[1] ?? null;
}

function tokenMatches(expectedHash: string, providedToken: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashMonitoringWebhookToken(providedToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId, sourceId } = await context.params;
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let alerts;
  try {
    alerts = parseAlertmanagerPayload(await readJsonBodyLimited(request, MAX_WEBHOOK_BYTES));
  } catch (error) {
    if (error instanceof MonitoringPayloadError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  try {
    const accepted = await withTenantTransaction(
      { userId: "monitoring-webhook", organizationId },
      async (tx) => {
        const source = await tx.monitoringSource.findFirst({
          where: { id: sourceId, organizationId, status: "ACTIVE", provider: { in: ["PROMETHEUS", "GRAFANA"] } },
          select: { id: true },
        });
        const credential = await tx.monitoringWebhookCredential.findFirst({
          where: { organizationId, sourceId },
          select: { tokenHash: true },
        });
        if (!source || !credential || !tokenMatches(credential.tokenHash, token)) return null;
        await requirePlanFeature(tx, organizationId, "monitoring");

        for (const alert of alerts) {
          const values = {
            title: alert.title,
            description: alert.description,
            severity: AlertSeverity[alert.severity],
            status: AlertStatus[alert.status],
            openedAt: alert.openedAt,
            resolvedAt: alert.resolvedAt,
          };
          await tx.alert.upsert({
            where: {
              organizationId_sourceId_externalId: { organizationId, sourceId, externalId: alert.externalId },
            },
            create: { organizationId, sourceId, externalId: alert.externalId, ...values },
            update: values,
          });
        }
        return alerts.length;
      },
    );
    if (accepted === null) return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
    return NextResponse.json({ accepted }, { status: 202 });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    throw error;
  }
}
