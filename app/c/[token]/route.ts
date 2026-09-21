import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SESSION_COOKIE } from "@/lib/session";
import { getClientIpHash } from "@/lib/ip";
import { DISCLOSURE_TEXT } from "@/lib/disclosure";
import { STEPS, FIRST_STEP } from "@/lib/steps";

// Entry point for the link in the outbound email. The token is treated as an
// opaque reference, not a credential: a link scanner pre-fetching this URL
// just creates a session nobody uses, so there is nothing to burn.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { searchParams } = req.nextUrl;
  const existingCookie = req.cookies.get(SESSION_COOKIE)?.value;

  if (existingCookie) {
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("id, step, external_ref")
      .eq("id", existingCookie)
      .maybeSingle();

    // Re-clicking the same link resumes rather than restarting.
    if (existing && existing.external_ref === token && existing.step !== "done") {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
  }

  const sessionId = crypto.randomUUID();

  const { error } = await supabaseAdmin.from("sessions").insert({
    id: sessionId,
    external_ref: token,
    brand: searchParams.get("brand"),
    campaign: searchParams.get("campaign"),
    source: searchParams.get("src"),
    click_id: searchParams.get("click_id"),
    ua: req.headers.get("user-agent"),
    ip_hash: getClientIpHash(req),
    step: FIRST_STEP,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const firstStep = STEPS[0];
  await supabaseAdmin.from("messages").insert([
    { session_id: sessionId, role: "bot", content: DISCLOSURE_TEXT, step_key: "disclosure" },
    {
      session_id: sessionId,
      role: "bot",
      content: firstStep.type === "choice" ? firstStep.prompt : "",
      step_key: firstStep.key,
    },
  ]);

  await supabaseAdmin
    .from("events")
    .insert({ session_id: sessionId, name: "chat_start", props: { token } });

  const res = NextResponse.redirect(new URL("/chat", req.url));
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
