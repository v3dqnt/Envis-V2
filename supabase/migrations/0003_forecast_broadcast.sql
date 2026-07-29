-- Envis Aegis — continuous 72h forecast broadcast
--
-- 0001 and 0002 handle an operator publishing one alert by hand. This migration
-- supports the automated case: a scheduled job re-runs the 72h forecast for
-- every area where someone is actually registered, and keeps the alert table in
-- sync with what the weather model currently says.
--
-- The hard part of a repeating broadcast is not publishing, it is *not*
-- republishing. A job running hourly against the same storm must update the one
-- alert rather than stack up 24 copies a day, and must withdraw it when the
-- forecast drops. `dedupe_key` is what makes both possible.
--
-- Run after 0002_evacuation_routes.sql.

-- ---------------------------------------------------------------------------
-- DEDUPE KEY — stable identity for a recurring forecast alert, of the form
--   forecast:<hazard>:<cellLat>,<cellLng>
-- Same storm, same cell, same hazard => same row, updated in place.
--
-- Nullable, because manually published alerts have no recurring identity. The
-- index is therefore partial: uniqueness is enforced only where a key exists,
-- so any number of manual alerts can coexist.
-- ---------------------------------------------------------------------------
alter table alerts add column if not exists dedupe_key text;

create unique index if not exists alerts_dedupe_key_idx
  on alerts (dedupe_key)
  where dedupe_key is not null;

-- Broadcast rewrites these on every run, so they need to be cheap to find.
create index if not exists alerts_source_expires_idx on alerts (source, expires_at);

-- ---------------------------------------------------------------------------
-- BROADCAST RUNS — one row per scheduled execution. Without this there is no
-- way to tell "the forecast is quiet" apart from "the job stopped running",
-- which for a warning system are very different failures.
-- ---------------------------------------------------------------------------
create table if not exists broadcast_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cells_scanned int not null default 0,
  alerts_published int not null default 0,
  alerts_updated int not null default 0,
  alerts_withdrawn int not null default 0,
  forecast_errors int not null default 0,
  error text
);

create index if not exists broadcast_runs_started_idx on broadcast_runs (started_at desc);

alter table broadcast_runs enable row level security;
