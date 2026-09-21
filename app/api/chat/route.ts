import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionCookieId } from "@/lib/session";
import { getClientIpHash } from "@/lib/ip";
import { normalizeEmail } from "@/lib/normalizeEmail";
import { getStep, nextStepKey, resolveChoice, isValidEmail } from "@/lib/steps";
import { scrub } from "@/lib/scrub";
import { getConsentTerms, recordConsent } from "@/lib/consentService";
import { matchOffers, type Answers, type Offer } from "@/lib/matchOffers";
import { sendOfferEmail } from "@/lib/email";

type SessionRow = {
  id: string;
  step: string;
  lead_id: string | null;
  external_ref: string | null;
};

type OfferCard = {
  id: string;
  brand: string;
  headline: string;
  terms_summary: string | null;
  disclosure_text: string | null;
  url: string;
};

async function say(sessionId: string, content: string, stepKey: string) {
  await supabaseAdmin
    .from("messages")
    .insert({ session_id: sessionId, role: "bot", content, step_key: stepKey });
}

async function getAnswers(sessionId: string): Promise<Answers> {
  const { data } = await supabaseAdmin
    .from("answers")
    .select("question_key, value")
    .eq("session_id", sessionId);

  const answers: Record<string, string> = {};
  for (const row of data ?? []) answers[row.question_key] = row.value;
  return answers as Answers;
}

async function buildState(session: SessionRow) {
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("id, role, content, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  const step = getStep(session.step);
  let input: Record<string, unknown> = { type: "none" };

  if (step?.type === "choice") {
    input = { type: "choice", options: step.options };
  } else if (step?.type === "email") {
    input = { type: "email" };
  } else if (step?.type === "consent") {
    const terms = await getConsentTerms();
    input = { type: "consent", version: terms.version, text: terms.text };
  }

  let offers: OfferCard[] = [];
  if (session.step === "done") {
    const { data } = await supabaseAdmin
      .from("offer_matches")
      .select("rank, offers(id, brand, headline, terms_summary, disclosure_text)")
      .eq("lead_id", session.lead_id!)
      .order("rank", { ascending: true });

    offers = (data ?? []).map((m) => {
      const o = m.offers as unknown as Omit<OfferCard, "url">;
      return { ...o, url: `/r/${o.id}?s=${session.id}` };
    });
  }

  return NextResponse.json({
    step: session.step,
    messages: messages ?? [],
    input,
    offers,
  });
}

// Runs after the email is captured. Pass -> consent, reject -> terminal exit.
async function runScrub(session: SessionRow, email: string): Promise<string> {
  const answers = await getAnswers(session.id);
  let result;
  try {
    result = await scrub({
      email,
      answers: answers as Record<string, string>,
      sessionId: session.id,
      externalRef: session.external_ref,
    });
  } catch (err) {
    console.error("scrub failed", err);
    result = { decision: "reject" as const, reason: "scrub_unavailable" };
  }

  await supabaseAdmin
    .from("sessions")
    .update({ scrub_result: result.decision })
    .eq("id", session.id);

  if (result.decision === "reject") {
    await say(
      session.id,
      "Thanks for your time. Based on the details you shared, we don't have an offer available for you right now.",
      "rejected"
    );
    await supabaseAdmin.from("sessions").update({ step: "rejected" }).eq("id", session.id);
    await supabaseAdmin.from("events").insert({
      session_id: session.id,
      name: "scrub_reject",
      props: { reason: result.reason ?? null },
    });
    return "rejected";
  }

  const terms = await getConsentTerms();
  await say(session.id, terms.text, "consent");
  await supabaseAdmin.from("sessions").update({ step: "consent" }).eq("id", session.id);
  return "consent";
}

// Runs after consent. Matches offers, shows them, emails a copy.
async function runOffer(session: SessionRow, email: string): Promise<string> {
  const answers = await getAnswers(session.id);

  const { data: offerRows } = await supabaseAdmin
    .from("offers")
    .select("*")
    .eq("status", "active");

  const matched = matchOffers((offerRows ?? []) as Offer[], answers);

  if (matched.length === 0) {
    await say(
      session.id,
      "I couldn't find an option matching what you're looking for right now. We add new lenders regularly — we'll email you if something fits.",
      "done"
    );
    await supabaseAdmin.from("sessions").update({ step: "done" }).eq("id", session.id);
    return "done";
  }

  await supabaseAdmin.from("offer_matches").insert(
    matched.map((offer, i) => ({
      lead_id: session.lead_id,
      offer_id: offer.id,
      rank: i + 1,
    }))
  );

  await say(
    session.id,
    matched.length === 1
      ? "Here's the option that matches what you're looking for:"
      : `Here are the ${matched.length} options that match what you're looking for:`,
    "offer"
  );

  const baseUrl = process.env.PUBLIC_BASE_URL ?? "";
  try {
    await sendOfferEmail({
      to: email,
      offers: matched.map((o) => ({
        brand: o.brand,
        headline: o.headline,
        terms_summary: o.terms_summary,
        disclosure_text: o.disclosure_text,
        url: `${baseUrl}/r/${o.id}?s=${session.id}`,
      })),
    });
    await say(
      session.id,
      "I've also emailed these to you. If it's not in your inbox in a few minutes, check spam or junk.",
      "done"
    );
  } catch (err) {
    console.error("offer email failed", err);
    await say(
      session.id,
      "I couldn't email these just now, but you can open them right here.",
      "done"
    );
  }

  await supabaseAdmin.from("sessions").update({ step: "done" }).eq("id", session.id);
  await supabaseAdmin
    .from("events")
    .insert({ session_id: session.id, name: "offers_shown", props: { count: matched.length } });

  return "done";
}

async function loadSession(): Promise<SessionRow | null> {
  const sessionId = await getSessionCookieId();
  if (!sessionId) return null;
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, step, lead_id, external_ref")
    .eq("id", sessionId)
    .maybeSingle();
  return data;
}

export async function GET() {
  const session = await loadSession();
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 404 });
  return buildState(session);
}

const bodySchema = z.object({ value: z.string().trim().min(1).max(200) });

export async function POST(req: NextRequest) {
  const session = await loadSession();
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const raw = parsed.data.value;

  const step = getStep(session.step);
  if (!step) return buildState(session); // done or rejected: nothing to advance

  await supabaseAdmin
    .from("messages")
    .insert({ session_id: session.id, role: "user", content: raw, step_key: step.key });

  if (step.type === "choice") {
    const value = resolveChoice(step, raw);
    if (!value) {
      await say(session.id, `Sorry — pick one of these so I get it right. ${step.prompt}`, step.key);
      return buildState(session);
    }

    await supabaseAdmin
      .from("answers")
      .upsert(
        { session_id: session.id, lead_id: session.lead_id, question_key: step.key, value },
        { onConflict: "session_id,question_key" }
      );

    const next = nextStepKey(step.key);
    const nextStep = getStep(next);
    if (nextStep && (nextStep.type === "choice" || nextStep.type === "email")) {
      await say(session.id, nextStep.prompt, nextStep.key);
    }
    await supabaseAdmin.from("sessions").update({ step: next }).eq("id", session.id);
    return buildState({ ...session, step: next });
  }

  if (step.type === "email") {
    if (!isValidEmail(raw)) {
      await say(session.id, "That doesn't look like a valid email — could you check it and try again?", step.key);
      return buildState(session);
    }

    const email = raw.trim();
    const emailNormalized = normalizeEmail(email);

    // The address typed here wins, even if the link was issued to another one.
    const { data: existingLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email_normalized", emailNormalized)
      .maybeSingle();

    let leadId: string;
    if (existingLead) {
      leadId = existingLead.id;
    } else {
      const { data: newLead, error } = await supabaseAdmin
        .from("leads")
        .insert({ session_id: session.id, email, email_normalized: emailNormalized })
        .select("id")
        .single();
      if (error || !newLead) {
        return NextResponse.json({ error: "lead_insert_failed" }, { status: 500 });
      }
      leadId = newLead.id;
    }

    await supabaseAdmin
      .from("answers")
      .upsert(
        { session_id: session.id, lead_id: leadId, question_key: "email", value: email },
        { onConflict: "session_id,question_key" }
      );
    await supabaseAdmin.from("answers").update({ lead_id: leadId }).eq("session_id", session.id);
    await supabaseAdmin
      .from("sessions")
      .update({ lead_id: leadId, step: "scrub" })
      .eq("id", session.id);

    const withLead = { ...session, lead_id: leadId, step: "scrub" };
    const after = await runScrub(withLead, email);
    return buildState({ ...withLead, step: after });
  }

  if (step.type === "consent") {
    if (raw !== "accept") {
      await say(session.id, "No problem — I can't pass your details on without that agreement.", step.key);
      return buildState(session);
    }

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("email")
      .eq("id", session.lead_id!)
      .single();
    if (!lead) return NextResponse.json({ error: "no_lead" }, { status: 400 });

    const terms = await getConsentTerms();
    const ipHash = getClientIpHash(req);

    // Local audit copy, independent of the consent service's own record.
    await supabaseAdmin.from("consents").insert({
      lead_id: session.lead_id,
      text_version: terms.version,
      consent_text: terms.text,
      ip: ipHash,
      ua: req.headers.get("user-agent"),
      page_url: req.headers.get("referer"),
    });

    try {
      await recordConsent({
        email: lead.email,
        version: terms.version,
        text: terms.text,
        sessionId: session.id,
        ip: ipHash,
        ua: req.headers.get("user-agent"),
      });
    } catch (err) {
      console.error("recordConsent failed", err);
    }

    await supabaseAdmin
      .from("sessions")
      .update({ step: "offer", consent_version: terms.version })
      .eq("id", session.id);

    const after = await runOffer({ ...session, step: "offer" }, lead.email);
    return buildState({ ...session, step: after });
  }

  return buildState(session);
}
