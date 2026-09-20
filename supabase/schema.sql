-- Offer Assistant schema (v0 / MVP)
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run

create extension if not exists pgcrypto;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  brand text,
  campaign text,
  source text,
  click_id text,
  ua text,
  ip_hash text,
  step text not null default 'name', -- name | email | verify | questions | offers | done
  lead_id uuid,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  email text not null,
  email_normalized text not null,
  first_name text,
  verified_at timestamptz,
  status text not null default 'new', -- new | verified | suppressed
  suppressed boolean not null default false,
  created_at timestamptz not null default now()
);
create index leads_email_normalized_idx on leads(email_normalized);

create table consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  text_version text not null,
  consent_text text not null,
  checked_at timestamptz not null default now(),
  ip text,
  ua text,
  page_url text
);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  code_hash text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index verifications_lead_id_idx on verifications(lead_id);

create table answers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  question_key text not null,
  value text not null,
  answered_at timestamptz not null default now(),
  unique (lead_id, question_key)
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  product_type text not null, -- personal_loan | credit_card | debt_consolidation
  headline text not null,
  terms_summary text,
  disclosure_text text,
  destination_url text not null,
  payout numeric default 0,
  status text not null default 'active', -- active | paused
  daily_cap int,
  eligible_states text[] not null default '{}', -- empty = all states
  min_credit_band text, -- excellent | good | fair | building | not_sure
  amount_min numeric,
  amount_max numeric,
  priority int not null default 0,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now()
);

create table offer_matches (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id),
  offer_id uuid not null references offers(id),
  rank int not null,
  shown_at timestamptz not null default now(),
  clicked_at timestamptz,
  converted_at timestamptz
);

create table events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  name text not null,
  props jsonb not null default '{}',
  ts timestamptz not null default now()
);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  message_id text,
  type text not null, -- delivered | bounce | complaint | click
  ts timestamptz not null default now()
);

-- Seed a couple of test offers so the matching engine has something to return.
insert into offers (brand, product_type, headline, terms_summary, disclosure_text, destination_url, payout, eligible_states, min_credit_band, amount_min, amount_max, priority)
values
  ('Acme Lending', 'personal_loan', 'Personal loans up to $35,000', 'Rates from 7.99% APR, terms 24-60mo', 'Acme Lending is not a lender. Terms vary by state and credit profile.', 'https://example.com/offer/acme-loan', 25, '{}', 'fair', 1000, 35000, 10),
  ('Nova Card', 'credit_card', 'Nova Cash Back Card', '3% back on top categories, no annual fee', 'Subject to credit approval. See issuer terms.', 'https://example.com/offer/nova-card', 15, '{}', 'good', null, null, 5),
  ('Bridge Debt Relief', 'debt_consolidation', 'Consolidate high-interest debt', 'Free consultation, no obligation', 'Results vary. Not available in all states.', 'https://example.com/offer/bridge-debt', 30, '{}', 'building', 5000, 60000, 8);
