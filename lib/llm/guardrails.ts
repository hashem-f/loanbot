// Pure validation applied to every model response. Nothing here does I/O, so
// it is cheap to unit test — which matters, because this is the layer that
// decides whether generated text is allowed to reach a user in a lending flow.

export const MAX_REPLY_LENGTH = 300;

// A reply matching any of these is discarded outright rather than edited.
const BANNED = [
  { pattern: /\d+(\.\d+)?\s*%/, reason: "rate_claim" },
  { pattern: /\bAPR\b/i, reason: "rate_claim" },
  { pattern: /\b(approved|approval|guaranteed|pre-?qualif\w*|you qualify|accepted)\b/i, reason: "approval_claim" },
  { pattern: /\b(i'?m|i am) (a |an )?(real |actual )?(person|human|advisor|agent|broker)\b/i, reason: "human_claim" },
  { pattern: /\bnot a (bot|robot|machine|computer)\b/i, reason: "human_claim" },
  { pattern: /\b(ssn|social security|date of birth|routing number|account number|card number|cvv|password)\b/i, reason: "sensitive_request" },
  { pattern: /https?:\/\//i, reason: "link" },
  { pattern: /\$\s?\d/, reason: "amount_claim" },
];

export type ReplyCheck = { ok: true; reply: string } | { ok: false; reason: string };

export function checkReply(raw: string | null): ReplyCheck {
  if (!raw) return { ok: false, reason: "empty" };

  const reply = raw.trim().replace(/\s+/g, " ");
  if (!reply) return { ok: false, reason: "empty" };
  if (reply.length > MAX_REPLY_LENGTH) return { ok: false, reason: "too_long" };

  for (const { pattern, reason } of BANNED) {
    if (pattern.test(reply)) return { ok: false, reason };
  }

  return { ok: true, reply };
}

// The model may only select from values the server already defined for this
// step. Anything else is treated as no answer at all.
export function checkValue(raw: string | null, allowed: string[]): string | null {
  if (!raw) return null;
  const match = allowed.find((a) => a === raw.trim());
  return match ?? null;
}
