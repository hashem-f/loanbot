import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { matchOffers, type Answers, type Offer } from "@/lib/matchOffers";

export async function GET() {
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
  const leadId = session.lead_id;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("verified_at")
    .eq("id", leadId)
    .single();
  if (!lead?.verified_at) {
    return NextResponse.json({ error: "not_verified" }, { status: 403 });
  }

  // Re-showing an already-matched lead returns the same offers in the same
  // order, instead of re-running the matcher and possibly reshuffling.
  const { data: existingMatches } = await supabaseAdmin
    .from("offer_matches")
    .select("rank, offers(id, brand, headline, terms_summary, disclosure_text)")
    .eq("lead_id", leadId)
    .order("rank", { ascending: true });

  if (existingMatches && existingMatches.length > 0) {
    return NextResponse.json({
      offers: existingMatches.map((m) => ({ ...m.offers, sessionId })),
    });
  }

  const { data: answerRows } = await supabaseAdmin
    .from("answers")
    .select("question_key, value")
    .eq("lead_id", leadId);

  const answers: Answers = {};
  for (const row of answerRows ?? []) {
    (answers as Record<string, string>)[row.question_key] = row.value;
  }

  const { data: offers } = await supabaseAdmin
    .from("offers")
    .select("*")
    .eq("status", "active");

  const matched = matchOffers((offers ?? []) as Offer[], answers);

  if (matched.length > 0) {
    await supabaseAdmin.from("offer_matches").insert(
      matched.map((offer, i) => ({
        lead_id: leadId,
        offer_id: offer.id,
        rank: i + 1,
      }))
    );
  }

  return NextResponse.json({
    offers: matched.map((o) => ({
      id: o.id,
      brand: o.brand,
      headline: o.headline,
      terms_summary: o.terms_summary,
      disclosure_text: o.disclosure_text,
      sessionId,
    })),
  });
}
