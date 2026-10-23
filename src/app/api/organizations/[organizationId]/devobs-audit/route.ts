import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { featureForResource, PlanAccessError, requirePlanFeature } from "@/lib/billing/entitlements";
import { createInstallationToken, getGitHubAppConfig, GitHubAppError } from "@/lib/github/app";
import { auditGitHubRepository } from "@/lib/github/devobs-remediation";
import { requireTenantContext, TenantAccessError, withTenantTransaction } from "@/lib/tenant/access";

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const tenant = await requireTenantContext(await getAuthenticatedUserId(), organizationId);
    const resources = await withTenantTransaction(tenant, async (tx) => {
      await requirePlanFeature(tx, tenant.organizationId, featureForResource("integrations"));
      const [installation, integrations] = await Promise.all([
        tx.gitHubAppInstallation.findUnique({ where: { organizationId: tenant.organizationId }, select: { installationId: true, accountLogin: true, workflowsWriteEnabled: true } }),
        tx.ciCdIntegration.findMany({
          where: { organizationId: tenant.organizationId, provider: "GITHUB", status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, name: true, repositoryUrl: true },
        }),
      ]);
      return { installation, integrations };
    });

    const config = getGitHubAppConfig();
    if (!config) return NextResponse.json({ status: "not-configured", repositories: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
    if (!resources.installation) return NextResponse.json({ status: "not-connected", repositories: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
    if (!resources.integrations.length) return NextResponse.json({
      status: "no-repositories",
      accountLogin: resources.installation.accountLogin,
      workflowsWriteEnabled: resources.installation.workflowsWriteEnabled,
      repositories: [],
    }, { status: 200, headers: { "Cache-Control": "no-store" } });

    const token = await createInstallationToken(config, resources.installation.installationId, false);
    const repositories = [];
    for (const integration of resources.integrations) {
      try {
        const audit = await auditGitHubRepository(token, integration.repositoryUrl, resources.installation.accountLogin);
        repositories.push({
          integrationId: integration.id,
          name: integration.name,
          repositoryUrl: integration.repositoryUrl,
          status: audit.status,
          message: audit.repairable && !resources.installation!.workflowsWriteEnabled
            ? "The repair is safe to propose, but this GitHub App installation needs Workflows: write to create a workflow file. Auditing remains read-only."
            : audit.message,
          detectedStacks: audit.detectedStacks,
          repairable: audit.repairable && resources.installation!.workflowsWriteEnabled,
        });
      } catch (error) {
        repositories.push({
          integrationId: integration.id,
          name: integration.name,
          repositoryUrl: integration.repositoryUrl,
          status: "manual-review" as const,
          message: error instanceof GitHubAppError && error.status === 404
            ? "This GitHub App installation cannot access the linked repository."
            : "This repository could not be audited safely. Check its access and retry.",
          detectedStacks: [],
          repairable: false,
        });
      }
    }
    return NextResponse.json({
      status: "ready",
      accountLogin: resources.installation.accountLogin,
      workflowsWriteEnabled: resources.installation.workflowsWriteEnabled,
      repositories,
    }, { headers: { "Cache-Control": "no-store", "Vary": "Cookie" } });
  } catch (error) {
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message }, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (error instanceof PlanAccessError) return NextResponse.json({ error: error.message, code: "SUBSCRIPTION_REQUIRED" }, { status: 402, headers: { "Cache-Control": "no-store" } });
    if (error instanceof GitHubAppError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Devobs repository audit is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
