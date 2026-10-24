import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});

export const registrationSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100),
  organizationName: z.string().trim().min(2).max(100),
});

export const emailVerificationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: credentialsSchema.shape.password,
});

export const resendEmailVerificationSchema = z.object({
  email: z.email().max(254),
});
