import { cookies } from "next/headers";

export const SESSION_COOKIE = "oa_session";

// Reads the session id from the cookie set by middleware. Every request past
// middleware is guaranteed to have this cookie.
export async function getSessionCookieId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
