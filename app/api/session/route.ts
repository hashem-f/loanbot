import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { getClientIpHash } from "@/lib/ip";

export async function GET(req: NextRequest) {
  const sessionId = await getSessionCookieId();
  if (!sessionId) {
    return NextResponse.json({ error: "no_session_cookie" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  let session = existing;

  if (!session) {
    const { searchParams } = req.nextUrl;
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("sessions")
      .insert({
        id: sessionId,
        brand: searchParams.get("brand"),
        campaign: searchParams.get("campaign"),
        source: searchParams.get("src"),
        click_id: searchParams.get("click_id"),
        ua: req.headers.get("user-agent"),
        ip_hash: getClientIpHash(req),
        step: "intake",
      })
      .select("*")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    session = created;

    await supabaseAdmin
      .from("events")
      .insert({ session_id: sessionId, name: "page_view", props: {} });
  }

  let lead: { id: string; email: string; first_name: string | null; verified_at: string | null } | null = null;
  let answeredKeys: string[] = [];

  if (session.lead_id) {
    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select("id, email, first_name, verified_at")
      .eq("id", session.lead_id)
      .maybeSingle();
    lead = leadRow;

    const { data: answers } = await supabaseAdmin
      .from("answers")
      .select("question_key")
      .eq("lead_id", session.lead_id);
    answeredKeys = (answers ?? []).map((a) => a.question_key);
  }

  return NextResponse.json({
    step: session.step,
    firstName: lead?.first_name ?? null,
    email: lead?.email ?? null,
    verified: !!lead?.verified_at,
    answeredKeys,
  });
}
