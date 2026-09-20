# Offer Assistant — MVP

Verified-lead conversational offer-matching flow. See the design discussion for
the full architecture; this is the v0 build: name → email/consent → 6-digit
email verification → 4 personalization questions → rule-based offer matching.

## What's implemented

- Session tracking via a cookie + `sessions` table (resumable on refresh).
- Email verification: 6-digit code, hashed at rest, 10 min expiry, 5-attempt
  lockout, 60s resend cooldown, 3-codes/hour cap.
- Dev mode: with no `RESEND_API_KEY` set, codes are logged to the server
  console and shown on-screen so you can test the whole flow with no email
  provider set up yet.
- Consent capture with exact text + version stored per lead.
- 4 fixed personalization questions, one write per answer.
- Rule-based offer matching (`lib/matchOffers.ts`, unit tested) + a click
  redirect (`/r/[offerId]`) that logs the click before forwarding.
- Basic rate limiting via Postgres queries (no Redis yet — see the design doc
  for when to add it).

## Not yet implemented (intentionally deferred, see design doc)

- Real Turnstile bot check (skipped automatically if `TURNSTILE_SECRET_KEY`
  is unset — wire this up before real traffic).
- Confirm-link verification (code-only for v0).
- Recap email / marketing ESP sync / n8n / PostHog.
- Offer daily caps enforcement.
- Admin UI for offers (edit rows directly in the Supabase table editor).

## Setup

1. **Database.** Open your Supabase project → SQL Editor → New query, paste
   the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates the tables and seeds 3 sample offers.

2. **Environment.** Copy `.env.local.example` to `.env.local`:

   ```bash
   cp .env.local.example .env.local
   ```

   Then fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your
   Supabase dashboard: **Project Settings → API**. Use the `service_role`
   key, not `anon` — this app talks to Postgres only from the server, never
   the browser, so the powerful key never reaches the client.

3. **Run it.**

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`. Since `RESEND_API_KEY` isn't set yet, the
   verification code will show up in a banner on the page (and in your
   terminal) instead of being emailed — enter it to continue through the
   flow.

4. **Run the tests.**

   ```bash
   npm test
   ```

## Adding real email (Resend)

1. Create a Resend account, verify a sending subdomain (e.g.
   `verify.yourbrand.com`) by adding the SPF/DKIM/DMARC records it gives you
   to your DNS — this can take time to propagate, start it early.
2. Add `RESEND_API_KEY` and `RESEND_FROM` to `.env.local`. Dev mode turns
   off automatically once `RESEND_API_KEY` is set.

## Adding bot protection (Turnstile)

1. Create a Cloudflare Turnstile site, get a site key + secret key.
2. Add `TURNSTILE_SECRET_KEY` to `.env.local` (server-side check in
   `/api/start`).
3. Add the Turnstile widget to the email step in `app/ConversationApp.tsx`
   and pass its token as `turnstileToken` in the `/api/start` request body —
   not wired into the UI yet in this v0.

## Deploying

Push this to a GitHub repo and import it into Vercel. Add the same
environment variables there (Project Settings → Environment Variables).
Use a separate Supabase project for production vs. local/staging.
