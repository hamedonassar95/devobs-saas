import { z } from "zod";

const incidentAlertLinkSchema = z.object({
  alertId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(8).max(500),
}).strict();

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  alerts: z.array(incidentAlertLinkSchema).min(1).max(25)
    .refine((alerts) => new Set(alerts.map(({ alertId }) => alertId)).size === alerts.length, "Alert links must be unique."),
}).strict();

export const incidentStatusSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
