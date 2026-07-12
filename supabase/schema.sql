-- AgOptics Well Registration — Supabase schema
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- One row in `registrations` per grower submission, with the wells in `wells`.
-- Row Level Security is enabled with NO policies: the anon/public keys can't
-- read or write anything. Only the site's serverless function (using the
-- service role key stored in Netlify env vars) can insert, and only you can
-- browse the data in the Supabase dashboard.

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  landowner text not null,
  contact text,
  email text,
  gsa text,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists wells (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  label text,
  well_use text,
  status text,
  apn text,
  gsa text,
  depth_ft numeric,
  well_no text,
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists wells_registration_idx on wells (registration_id);
create index if not exists wells_gsa_idx on wells (gsa);

alter table registrations enable row level security;
alter table wells enable row level security;
