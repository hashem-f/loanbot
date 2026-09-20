import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params;
  const sessionId = req.nextUrl.searchParams.get("s");

  const { data: offer } = await supabaseAdmin
    .from("offers")
    .select("destination_url, status")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer || offer.status !== "active") {
    return NextResponse.redirect(new URL("/offers/unavailable", req.url));
  }

  if (sessionId) {
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("lead_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (session?.lead_id) {
      // Idempotent: only the first click sets clicked_at.
      await supabaseAdmin
        .from("offer_matches")
        .update({ clicked_at: new Date().toISOString() })
        .eq("lead_id", session.lead_id)
        .eq("offer_id", offerId)
        .is("clicked_at", null);

      await supabaseAdmin
        .from("events")
        .insert({ session_id: sessionId, name: "offer_click", props: { offer_id: offerId } });
    }
  }

  return NextResponse.redirect(offer.destination_url);
}
