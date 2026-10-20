import { compare, hash } from "bcryptjs";

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
