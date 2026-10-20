"use client";

import { useState } from "react";
import { PLAN_CATALOG, type BillingPlan } from "@/lib/billing/plans";

type BillingOrganization = {
  id: string;
  name: string;
  role: string;
  stripeCustomerLinked: boolean;
  plan: BillingPlan | null;
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  trialUsed: boolean;
};

const PLANS = Object.entries(PLAN_CATALOG) as [BillingPlan, (typeof PLAN_CATALOG)[BillingPlan]][];

export default function BillingControls({ organizations }: { organizations: BillingOrganization[] }) {
  const [selectedPlans, setSelectedPlans] = useState<Record<string, BillingPlan>>({});
  const [busyOrganization, setBusyOrganization] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openBilling(organizationId: string, action: "checkout" | "portal") {
    setBusyOrganization(organizationId);
    setError(null);
    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "checkout"
          ? { organizationId, plan: selectedPlans[organizationId] ?? "MONITORING" }
          : { organizationId }),
      });
      const result = await response.json() as { error?: string; url?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Unable to open billing.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open billing.");
      setBusyOrganization(null);
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {organizations.map((organization) => {
        const canManage = organization.role === "OWNER";
        const plan = organization.plan ? PLAN_CATALOG[organization.plan]?.name : null;
        const currentSubscription = ["ACTIVE", "TRIALING", "PAST_DUE", "UNPAID", "PAUSED"].includes(organization.status ?? "");
        const inTrial = organization.status === "TRIALING";
        const date = inTrial ? organization.trialEndsAt : organization.currentPeriodEnd;
        return (
          <section key={organization.id} aria-labelledby={`org-${organization.id}`}>
            <h2 id={`org-${organization.id}`}>{organization.name}</h2>
            <p>Role: {organization.role}</p>
            <p>Plan: {plan ?? "No subscription"}{organization.status ? ` · ${organization.status}` : ""}</p>
            {date && <p>{inTrial ? "Trial ends" : "Current period ends"}: {new Date(date).toLocaleDateString()}</p>}
            {canManage ? (
              <>
                {!currentSubscription && <>
                  <label htmlFor={`plan-${organization.id}`}>Monthly plan</label>{" "}
                  <select
                    id={`plan-${organization.id}`}
                    value={selectedPlans[organization.id] ?? "MONITORING"}
                    onChange={(event) => setSelectedPlans((current) => ({ ...current, [organization.id]: event.target.value as BillingPlan }))}
                  >
                    {PLANS.map(([key, value]) => <option value={key} key={key}>{value.name} — {value.description}</option>)}
                  </select>
                  {!organization.trialUsed && <p>New subscriptions include a 14-day free trial.</p>}
                  <button disabled={busyOrganization === organization.id} onClick={() => openBilling(organization.id, "checkout")}>
                    {busyOrganization === organization.id ? "Opening…" : "Choose plan"}
                  </button>{" "}
                </>}
                {organization.stripeCustomerLinked && (
                  <button disabled={busyOrganization === organization.id} onClick={() => openBilling(organization.id, "portal")}>
                    Manage billing / cancel
                  </button>
                )}
              </>
            ) : <p>Ask an organization owner to manage its subscription.</p>}
          </section>
        );
      })}
    </div>
  );
}
