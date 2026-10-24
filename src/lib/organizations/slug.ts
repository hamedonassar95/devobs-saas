import { randomBytes } from "node:crypto";

export function createOrganizationSlug(name: string): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "team";
  return `${base}-${randomBytes(3).toString("hex")}`;
}
