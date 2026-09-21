// Sends the verification email via Resend once both RESEND_API_KEY and
// RESEND_FROM are set. Without either, falls back to "dev mode": logs the
// code to the server console and lets the caller return it in the API
// response so you can test the whole flow before you have a verified
// sending domain to send from.
export const DEV_MODE = !process.env.RESEND_API_KEY || !process.env.RESEND_FROM;

export async function sendVerificationEmail(params: {
  to: string;
  firstName: string;
  code: string;
}): Promise<{ ok: true; devCode?: string }> {
  const { to, firstName, code } = params;

  if (DEV_MODE) {
    console.log(`[DEV MODE] Verification code for ${to}: ${code}`);
    return { ok: true, devCode: code };
  }

  const from = process.env.RESEND_FROM;
  if (!from) throw new Error("RESEND_FROM is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${code} is your verification code`,
      html: `<p>Hi ${firstName || "there"},</p><p>Your verification code is:</p><h2>${code}</h2><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }

  return { ok: true };
}

export type OfferEmailItem = {
  brand: string;
  headline: string;
  terms_summary: string | null;
  disclosure_text: string | null;
  url: string;
};

export async function sendOfferEmail(params: {
  to: string;
  offers: OfferEmailItem[];
}): Promise<{ ok: true }> {
  const { to, offers } = params;

  const body = offers
    .map(
      (o) =>
        `<div style="margin:0 0 20px"><h3 style="margin:0 0 4px">${o.headline}</h3>` +
        `<p style="margin:0 0 4px;color:#666">${o.brand}</p>` +
        (o.terms_summary ? `<p style="margin:0 0 8px">${o.terms_summary}</p>` : "") +
        `<p style="margin:0 0 8px"><a href="${o.url}">View this offer</a></p>` +
        (o.disclosure_text
          ? `<p style="margin:0;font-size:12px;color:#999">${o.disclosure_text}</p>`
          : "") +
        `</div>`
    )
    .join("");

  const html = `<p>Here are the options matched to what you told us:</p>${body}<p style="font-size:12px;color:#999">You're receiving this because you requested these offers. Reply STOP or use the unsubscribe link to opt out.</p>`;

  if (DEV_MODE) {
    console.log(`[DEV MODE] Offer email for ${to}:\n${html}`);
    return { ok: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to,
      subject: "Your matched loan options",
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend offer send failed: ${res.status} ${await res.text()}`);
  }

  return { ok: true };
}
