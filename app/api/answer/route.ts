import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { QUESTION_KEYS } from "@/lib/questions";

const bodySchema = z.object({
  questionKey: z.enum(QUESTION_KEYS as [string, ...string[]]),
  value: z.string().trim().min(1).max(100),
});

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
    .select("verified_at")
    .eq("id", session.lead_id)
    .single();
  if (!lead?.verified_at) {
    return NextResponse.json({ error: "not_verified" }, { status: 403 });
  }

  const { questionKey, value } = parsed.data;

  await supabaseAdmin
    .from("answers")
    .upsert(
      { lead_id: session.lead_id, question_key: questionKey, value },
      { onConflict: "lead_id,question_key" }
    );

  const { data: answers } = await supabaseAdmin
    .from("answers")
    .select("question_key")
    .eq("lead_id", session.lead_id);

  const answeredKeys = new Set((answers ?? []).map((a) => a.question_key));
  const allAnswered = QUESTION_KEYS.every((k) => answeredKeys.has(k));

  if (allAnswered) {
    await supabaseAdmin.from("sessions").update({ step: "offers" }).eq("id", sessionId);
  }

  return NextResponse.json({ ok: true, allAnswered });
}
