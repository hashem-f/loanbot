import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { getClientIpHash } from "@/lib/ip";
import { normalizeEmail } from "@/lib/normalizeEmail";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/consent";
import { generateCode, generateToken, hash, CODE_EXPIRY_MS } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  consent: z.literal(true),
  turnstileToken: z.string().optional(),
});

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured yet — skip in dev, wire up before launch
  if (!token) return false;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

export async function POST(req: NextRequest) {
  const sessionId = await getSessionCookieId();
  if (!sessionId) {
    return NextResponse.json({ error: "no_session_cookie" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { firstName, email, turnstileToken } = parsed.data;

  const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = getClientIpHash(req);

  const turnstileOk = await verifyTurnstile(turnstileToken, rawIp);
  if (!turnstileOk) {
    return NextResponse.json({ error: "bot_check_failed" }, { status: 400 });
  }

  const emailNormalized = normalizeEmail(email);

  // Per-email rate limit: don't let one address trigger unlimited codes.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentLeadCount } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("email_normalized", emailNormalized)
    .gte("created_at", oneHourAgo);
  if ((recentLeadCount ?? 0) >= 5) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Per-IP rate limit on start attempts.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentIpCount } = await supabaseAdmin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("name", "start_attempt")
    .contains("props", { ip_hash: ipHash })
    .gte("ts", tenMinAgo);
  if ((recentIpCount ?? 0) >= 10) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  await supabaseAdmin
    .from("events")
    .insert({ session_id: sessionId, name: "start_attempt", props: { ip_hash: ipHash } });

  // Find-or-create the lead by normalized email so repeat visits/campaigns
  // attach to the same lead instead of creating duplicates.
  const { data: existingLead } = await supabaseAdmin
    .from("leads")
    .select("id, verified_at")
    .eq("email_normalized", emailNormalized)
    .maybeSingle();

  let leadId: string;

  if (existingLead) {
    leadId = existingLead.id;
    await supabaseAdmin
      .from("leads")
      .update({ first_name: firstName })
      .eq("id", leadId);
  } else {
    const { data: newLead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert({
        session_id: sessionId,
        email,
        email_normalized: emailNormalized,
        first_name: firstName,
      })
      .select("id")
      .single();
    if (leadErr || !newLead) {
      return NextResponse.json({ error: leadErr?.message ?? "lead_insert_failed" }, { status: 500 });
    }
    leadId = newLead.id;
  }

  await supabaseAdmin.from("consents").insert({
    lead_id: leadId,
    text_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    ip: ipHash,
    ua: req.headers.get("user-agent"),
    page_url: req.headers.get("referer"),
  });

  // Already verified (returning lead) — skip re-sending a code entirely.
  if (existingLead?.verified_at) {
    await supabaseAdmin
      .from("sessions")
      .update({ lead_id: leadId, step: "questions" })
      .eq("id", sessionId);
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const code = generateCode();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS).toISOString();

  await supabaseAdmin.from("verifications").insert({
    lead_id: leadId,
    code_hash: hash(code),
    token_hash: hash(token),
    expires_at: expiresAt,
    attempts: 0,
  });

  const sendResult = await sendVerificationEmail({ to: email, firstName, code });

  await supabaseAdmin
    .from("sessions")
    .update({ lead_id: leadId, step: "verify" })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true, devCode: sendResult.devCode });
}
