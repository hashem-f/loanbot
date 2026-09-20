import { createHash, randomBytes, randomInt } from "node:crypto";

export const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_CODES_PER_LEAD = 3;

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
