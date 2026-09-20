import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Assigns every visitor a session id cookie. The DB row for it is created
// lazily by /api/session on first load — middleware stays DB-free so it can
// run on the edge without needing service-role credentials there.
export function proxy(req: NextRequest) {
  const existing = req.cookies.get(SESSION_COOKIE)?.value;
  if (existing) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(SESSION_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
