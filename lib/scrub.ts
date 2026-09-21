// Eligibility scrub (suppression, dupes) is handled by an external service.
// Without SCRUB_URL set, a mock passes everything except addresses starting
// with "reject" so the reject path stays testable.
export type ScrubInput = {
  email: string;
  answers: Record<string, string>;
  sessionId: string;
  externalRef: string | null;
};

export type ScrubResult = { decision: "pass" | "reject"; reason?: string };

export const SCRUB_MOCKED = !process.env.SCRUB_URL;

export async function scrub(input: ScrubInput): Promise<ScrubResult> {
  if (SCRUB_MOCKED) {
    const local = input.email.trim().toLowerCase();
    if (local.startsWith("reject")) {
      return { decision: "reject", reason: "mock_suppression_hit" };
    }
    return { decision: "pass" };
  }

  const res = await fetch(process.env.SCRUB_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SCRUB_API_KEY
        ? { Authorization: `Bearer ${process.env.SCRUB_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`scrub failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
