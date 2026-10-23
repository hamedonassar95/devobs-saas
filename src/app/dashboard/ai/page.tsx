import type { MembershipRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import AiControls from "./ai-controls";
import { getAuthenticatedUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AiDashboardPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: {
      role: true,
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const organizations = memberships.map(({ role, organization }) => ({
    ...organization,
    role: role as MembershipRole,
  }));

  return (
    <main className="ai-console">
      <header className="ai-console-header">
        <Link className="brand" href="/" aria-label="Devobs home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>devobs<span className="brand-period">.</span></span>
        </Link>
        <nav aria-label="Workspace navigation">
          <Link href="/dashboard/devobs">Automation hub</Link>
          <Link href="/billing">Billing</Link>
          <Link href="/">Marketing site</Link>
        </nav>
      </header>

      <section className="ai-console-intro">
        <p className="eyebrow">AI-ASSISTED OPERATIONS</p>
        <h1>Incident analysis</h1>
        <p>Review alert evidence and request bounded, advisory guidance for your organization.</p>
      </section>

      <AiControls organizations={organizations} />
    </main>
  );
}
