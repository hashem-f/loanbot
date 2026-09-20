// Used only for de-duplication lookups. The original, unmodified address is
// what actually gets stored and emailed.
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split("@");
  if (!domain) return trimmed;

  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  const normalizedLocal = isGmail
    ? local.replace(/\./g, "").split("+")[0]
    : local.split("+")[0];

  return `${normalizedLocal}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}
