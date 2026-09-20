import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import {
  generateCode,
  generateToken,
  hash,
  CODE_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  MAX_CODES_PER_LEAD,
} from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";

export async function POST() {
  const sessionId = await getSessionCookieId();
  if (!sessionId) {
    return NextResponse.json({ error: "no_session_cookie" }, { status: 400 });
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
    .select("id, email, first_name, verified_at")
    .eq("id", session.lead_id)
    .single();
  if (!lead) {
    return NextResponse.json({ error: "no_lead" }, { status: 400 });
  }

  if (lead.verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentCodes } = await supabaseAdmin
    .from("verifications")
    .select("id, created_at")
    .eq("lead_id", lead.id)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false });

  if ((recentCodes?.length ?? 0) >= MAX_CODES_PER_LEAD) {
    return NextResponse.json({ error: "too_many_codes" }, { status: 429 });
  }

  const last = recentCodes?.[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: "cooldown" }, { status: 429 });
  }

  // Invalidate any still-live code so only the newest one can ever succeed.
  await supabaseAdmin
    .from("verifications")
    .update({ used_at: new Date().toISOString() })
    .eq("lead_id", lead.id)
    .is("used_at", null);

  const code = generateCode();
  const token = generateToken();
  await supabaseAdmin.from("verifications").insert({
    lead_id: lead.id,
    code_hash: hash(code),
    token_hash: hash(token),
    expires_at: new Date(Date.now() + CODE_EXPIRY_MS).toISOString(),
    attempts: 0,
  });

  let sendResult: Awaited<ReturnType<typeof sendVerificationEmail>>;
  try {
    sendResult = await sendVerificationEmail({
      to: lead.email,
      firstName: lead.first_name ?? "",
      code,
    });
  } catch (err) {
    console.error("sendVerificationEmail failed", err);
    return NextResponse.json({ error: "email_send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, devCode: sendResult.devCode });
}
