// Consent wording and recording are owned by an external service. We render
// whatever text it returns and record the acceptance there — and keep our own
// copy of the exact text shown in the `consents` table as an independent
// audit trail.
export type ConsentTerms = { version: string; text: string };

export const CONSENT_MOCKED = !process.env.CONSENT_URL;

const MOCK_TERMS: ConsentTerms = {
  version: "mock-v1",
  text:
    "By continuing, I agree to be contacted by email and phone about these offers by the lenders shown and their partners, including via automated technology. Consent is not a condition of any purchase. I can opt out at any time.",
};

export async function getConsentTerms(): Promise<ConsentTerms> {
  if (CONSENT_MOCKED) return MOCK_TERMS;

  const res = await fetch(`${process.env.CONSENT_URL}/terms`, {
    headers: process.env.CONSENT_API_KEY
      ? { Authorization: `Bearer ${process.env.CONSENT_API_KEY}` }
      : {},
  });
  if (!res.ok) throw new Error(`consent terms failed: ${res.status}`);
  return res.json();
}

export async function recordConsent(params: {
  email: string;
  version: string;
  text: string;
  sessionId: string;
  ip: string;
  ua: string | null;
}): Promise<void> {
  if (CONSENT_MOCKED) {
    console.log(`[CONSENT MOCK] ${params.email} accepted ${params.version}`);
    return;
  }

  const res = await fetch(`${process.env.CONSENT_URL}/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CONSENT_API_KEY
        ? { Authorization: `Bearer ${process.env.CONSENT_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`consent record failed: ${res.status}`);
}
