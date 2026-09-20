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
