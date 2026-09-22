import { checkReply, checkValue } from "./guardrails";

export type InterpretInput = {
  prompt: string;
  allowed: { value: string; label: string }[];
  userText: string;
  recentTurns: { role: string; content: string }[];
};

// value: a normalized answer, already re-validated against `allowed`.
// reply: safe text to show before re-asking. Both may be null.
export type InterpretResult = { value: string | null; reply: string | null };

export const LLM_ENABLED =
  !!process.env.OPENAI_API_KEY && process.env.LLM_ENABLED !== "false";

export const MAX_LLM_CALLS_PER_SESSION = 6;

const TIMEOUT_MS = 6000;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const RESPONSE_SCHEMA = {
  name: "turn",
  strict: true,
  schema: {
    type: "object",
    properties: {
      value: {
        type: ["string", "null"],
        description:
          "Exactly one of the allowed option values if the user's message expresses that choice, otherwise null.",
      },
      reply: {
        type: ["string", "null"],
        description:
          "One or two short sentences answering the user's question, or null if they simply answered.",
      },
    },
    required: ["value", "reply"],
    additionalProperties: false,
  },
} as const;

function systemPrompt(input: InterpretInput): string {
  const options = input.allowed.length
    ? input.allowed.map((o) => `- ${o.value} (${o.label})`).join("\n")
    : "(none — this step expects an email address, so `value` must always be null)";

  return [
    "You assist inside a scripted loan-options questionnaire. You do NOT control the conversation.",
    "",
    `The question currently being asked is: "${input.prompt}"`,
    "",
    "Allowed option values:",
    options,
    "",
    "Your job is only to interpret the user's latest message:",
    "- If it expresses one of the allowed options, set `value` to that EXACT option value and set `reply` to null.",
    "- If it is a question or comment, set `value` to null and write a brief, plain `reply` that answers it.",
    "- If you cannot tell, set both to null.",
    "",
    "Hard rules for `reply`:",
    "- Never state or imply interest rates, APRs, fees, or dollar amounts.",
    "- Never say or imply the user is approved, pre-qualified, eligible, or guaranteed anything.",
    "- Never claim to be a human; you are an automated assistant.",
    "- Never ask for SSN, date of birth, bank, or card details.",
    "- Never include links.",
    "- Never promise what happens after the questionnaire beyond: their matched options will be shown and emailed.",
    "- Keep it under 250 characters. Do not re-ask the question; the system does that.",
  ].join("\n");
}

async function callOpenAI(input: InterpretInput): Promise<InterpretResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 200,
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
      messages: [
        { role: "system", content: systemPrompt(input) },
        ...input.recentTurns.map((t) => ({
          role: t.role === "user" ? "user" : "assistant",
          content: t.content,
        })),
        { role: "user", content: input.userText },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("openai: no content");

  const parsed = JSON.parse(content) as { value?: unknown; reply?: unknown };
  return {
    value: typeof parsed.value === "string" ? parsed.value : null,
    reply: typeof parsed.reply === "string" ? parsed.reply : null,
  };
}

// Always resolves. Any failure — disabled, timeout, bad JSON, blocked output —
// comes back as {null, null}, and the caller falls through to the scripted
// re-ask. The model can never stall or break a turn.
export async function interpretTurn(input: InterpretInput): Promise<InterpretResult> {
  if (!LLM_ENABLED) return { value: null, reply: null };

  let raw: InterpretResult;
  try {
    raw = await callOpenAI(input);
  } catch (err) {
    console.error("interpretTurn failed", err);
    return { value: null, reply: null };
  }

  const value = checkValue(
    raw.value,
    input.allowed.map((o) => o.value)
  );

  // A rejected answer must not keep its explanation — drop both together.
  if (raw.value && !value) {
    console.warn("llm proposed a value outside the allowed set", raw.value);
    return { value: null, reply: null };
  }

  if (value) return { value, reply: null };

  const checked = checkReply(raw.reply);
  if (!checked.ok) {
    if (checked.reason !== "empty") {
      console.warn("llm reply blocked by guardrail", checked.reason);
    }
    return { value: null, reply: null };
  }

  return { value: null, reply: checked.reply };
}
