import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { getGitHubAppConfig, createInstallationToken, GitHubAppError } from "@/lib/github/app";
import { auditGitHubRepository, createDevobsRepairPullRequest } from "@/lib/github/devobs-remediation";
import { readBoundedJson } from "@/lib/http/bounded-json";
import { requireTenantContextForPermission, TenantAccessError, TenantPermissionError, withTenantTransaction } from "@/lib/tenant/access";

const repairInput = z.object({ integrationId: z.string().trim().min(1).max(100) }).strict();
type RouteContext = { params: Promise<{ organizationId: string }> };

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const parsedBody = await readBoundedJson(request);
  if (!parsedBody || "tooLarge" in parsedBody) return NextResponse.json({ error: "Invalid repair request." }, { status: 400 });
  const parsed = repairInput.safeParse(parsedBody.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid repair request." }, { status: 400 });
  const config = getGitHubAppConfig();
  if (!config) return NextResponse.json({ error: "GitHub App repair is not configured." }, { status: 503 });

  try {
    const tenant = await requireTenantContextForPermission(await getAuthenticatedUserId(), organizationId, "admin");
    const target = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("integrations"));
      const [integration, installation] = await Promise.all([
        tx.ciCdIntegration.findFirst({
          where: { id: parsed.data.integrationId, organizationId: tenant.organizationId, provider: "GITHUB", status: "ACTIVE" },
          select: { id: true, repositoryUrl: true },
        }),
        tx.gitHubAppInstallation.findUnique({ where: { organizationId: tenant.organizationId }, select: { installationId: true, accountLogin: true, workflowsWriteEnabled: true } }),
      ]);
      return { integration, installation };
    });
    if (!target.integration || !target.installation) return NextResponse.json({ error: "Repository or GitHub App connection was not found." }, { status: 404 });
    if (!target.installation.workflowsWriteEnabled) {
      return NextResponse.json({ error: "The GitHub App needs Workflows: write permission before it can propose a workflow repair." }, { status: 403 });
    }

    const token = await createInstallationToken(config, target.installation.installationId, true, true);
    const audit = await auditGitHubRepository(token, target.integration.repositoryUrl, target.installation.accountLogin);
    if (!audit.repairable) return NextResponse.json({ error: "This repository does not have an eligible automatic repair." }, { status: 409 });
    const pullRequest = await createDevobsRepairPullRequest(token, audit);
    return NextResponse.json({ pullRequest }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof TenantPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402 });
    if (error instanceof GitHubAppError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The repair pull request could not be created." }, { status: 502 });
  }
}
