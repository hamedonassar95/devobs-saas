import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { credentialsSchema } from "./schemas";

describe("password authentication", () => {
  it("stores a one-way hash and verifies only the matching password", async () => {
    const password = "A sufficiently long password!";
    const digest = await hashPassword(password);

    expect(digest).not.toBe(password);
    expect(await verifyPassword(password, digest)).toBe(true);
    expect(await verifyPassword("a different password", digest)).toBe(false);
  });

  it("rejects passwords that bcrypt would truncate", () => {
    expect(credentialsSchema.safeParse({ email: "tech@example.com", password: "123456789012" }).success).toBe(true);
    expect(credentialsSchema.safeParse({ email: "tech@example.com", password: "short" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "tech@example.com", password: "é".repeat(40) }).success).toBe(false);
  });
});
