import { z } from "zod";

export const tenantResourceSchemas = {
  integrations: z.object({
    provider: z.enum(["GITHUB", "GITLAB", "BITBUCKET", "OTHER"]),
    name: z.string().trim().min(1).max(120),
    repositoryUrl: z.url().max(2048),
    externalId: z.string().max(255).optional(),
  }),
  "monitoring-sources": z.object({
    provider: z.enum(["PROMETHEUS", "DATADOG", "GRAFANA", "CLOUDWATCH", "OTHER"]),
    name: z.string().trim().min(1).max(120),
    endpoint: z.url().max(2048).optional(),
  }),
  alerts: z.object({
    sourceId: z.string().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000).optional(),
    severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
    status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
  }),
  "analysis-results": z.object({
    alertId: z.string().optional(),
    summary: z.string().trim().min(1).max(10000),
    details: z.unknown().optional(),
    model: z.string().max(120).optional(),
  }),
} as const;
