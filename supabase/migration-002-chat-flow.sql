-- 002: conversational flow (email-click entry, no code verification)
-- Run in Supabase Dashboard -> SQL Editor after schema.sql

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  role text not null, -- bot | user
  content text not null,
  step_key text,
  created_at timestamptz not null default now()
);
create index messages_session_idx on messages(session_id, created_at);

-- Identity now arrives on the inbound link instead of a verification code.
alter table sessions add column external_ref text;
alter table sessions add column scrub_result text;
alter table sessions add column consent_version text;
alter table sessions alter column step set default 'amount';

-- Answers are collected before an email (and therefore before a lead) exists,
-- so they key off the session and get the lead stamped on later.
alter table answers add column session_id uuid references sessions(id);
alter table answers alter column lead_id drop not null;
alter table answers drop constraint if exists answers_lead_id_question_key_key;
create unique index answers_session_question_uniq on answers(session_id, question_key);
