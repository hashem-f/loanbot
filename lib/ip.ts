import { hash } from "@/lib/verification";

export function getClientIpHash(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  return hash(ip);
}
