import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { hash, MAX_ATTEMPTS } from "@/lib/verification";

const bodySchema = z.object({ code: z.string().trim().length(6) });

export async function POST(req: NextRequest) {
  const sessionId = await getSessionCookieId();
  if (!sessionId) {
    return NextResponse.json({ error: "no_session_cookie" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("lead_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.lead_id) {
    return NextResponse.json({ error: "no_lead" }, { status: 400 });
  }

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, verified_at")
    .eq("id", session.lead_id)
    .single();
  if (!lead) {
    return NextResponse.json({ error: "no_lead" }, { status: 400 });
  }

  if (lead.verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const { data: verification } = await supabaseAdmin
    .from("verifications")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verification) {
    return NextResponse.json({ error: "no_active_code" }, { status: 400 });
  }
  if (verification.used_at) {
    return NextResponse.json({ error: "code_already_used" }, { status: 400 });
  }
  if (verification.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  if (new Date(verification.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  if (hash(parsed.data.code) !== verification.code_hash) {
    const attempts = verification.attempts + 1;
    await supabaseAdmin
      .from("verifications")
      .update({ attempts })
      .eq("id", verification.id);

    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "locked" }, { status: 429 });
    }
    return NextResponse.json(
      { error: "invalid_code", attemptsRemaining: MAX_ATTEMPTS - attempts },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from("verifications")
    .update({ used_at: new Date().toISOString() })
    .eq("id", verification.id);
  await supabaseAdmin
    .from("leads")
    .update({ verified_at: new Date().toISOString(), status: "verified" })
    .eq("id", lead.id);
  await supabaseAdmin
    .from("sessions")
    .update({ step: "questions" })
    .eq("id", sessionId);
  await supabaseAdmin
    .from("events")
    .insert({ session_id: sessionId, name: "verified", props: {} });

  return NextResponse.json({ ok: true });
}
