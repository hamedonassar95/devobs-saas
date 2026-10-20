import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});

export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(100),
  organizationName: z.string().trim().min(2).max(100),
});
