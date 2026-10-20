import { Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SubscriptionPlan } from "@prisma/client";

export type StripeSubscriptionSnapshot = {
  eventId: string;
  eventType: string;
  eventCreatedAt: number;
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export async function applyStripeSubscriptionSnapshot(snapshot: StripeSubscriptionSnapshot): Promise<"applied" | "stale" | "duplicate"> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.processedStripeEvent.create({ data: { id: snapshot.eventId, eventType: snapshot.eventType } });

      const organization = await tx.organization.findUnique({
        where: { id: snapshot.organizationId },
        select: { id: true, stripeCustomerId: true },
      });
      if (!organization) throw new Error("Stripe event references an unknown organization.");
      if (organization.stripeCustomerId && organization.stripeCustomerId !== snapshot.stripeCustomerId) {
        throw new Error("Stripe customer does not belong to the event organization.");
      }
      if (!organization.stripeCustomerId) {
        const existingOwner = await tx.organization.findUnique({
          where: { stripeCustomerId: snapshot.stripeCustomerId },
          select: { id: true },
        });
        if (existingOwner && existingOwner.id !== organization.id) throw new Error("Stripe customer is linked to another organization.");
        await tx.organization.update({ where: { id: organization.id }, data: { stripeCustomerId: snapshot.stripeCustomerId } });
      }

      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${snapshot.organizationId}, true)`;
      const existing = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: snapshot.stripeSubscriptionId },
      });
      if (existing && existing.organizationId !== snapshot.organizationId) {
        throw new Error("Stripe subscription is linked to another organization.");
      }
      if (existing?.lastEventCreatedAt !== null && existing?.lastEventCreatedAt !== undefined && existing.lastEventCreatedAt > BigInt(snapshot.eventCreatedAt)) {
        return "stale";
      }

      const data = {
        organizationId: snapshot.organizationId,
        stripeSubscriptionId: snapshot.stripeSubscriptionId,
        plan: snapshot.plan,
        status: snapshot.status,
        trialStartedAt: snapshot.trialStartedAt,
        trialEndsAt: snapshot.trialEndsAt,
        currentPeriodEnd: snapshot.currentPeriodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        lastEventCreatedAt: BigInt(snapshot.eventCreatedAt),
      };
      if (existing) {
        await tx.subscription.update({ where: { id: existing.id }, data });
      } else {
        await tx.subscription.create({ data: { id: `subrow_${snapshot.stripeSubscriptionId}`, ...data } });
      }
      return "applied";
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const event = await prisma.processedStripeEvent.findUnique({ where: { id: snapshot.eventId }, select: { id: true } });
      if (event) return "duplicate";
    }
    throw error;
  }
}
