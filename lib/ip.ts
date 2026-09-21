import { createHash } from "node:crypto";

export function getClientIpHash(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}
