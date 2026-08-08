-- Envis Aegis — Auto Jobs: target-area monitoring
--
-- Continuous Forecast Broadcast (0003) already watches wherever devices happen
-- to be and pushes mobile alerts automatically, no human in the loop. Auto Jobs
-- is a different shape: an operator names a place worth watching even when no
-- device is there, and when its conditions cross a threshold the app raises a
-- *suggestion* for a human to review and, if they agree, publish — it never
-- auto-publishes on its own. That distinction is why this is a separate table
-- rather than another row type in `alerts`: a suggestion is not yet a warning.
--
-- Run after 0003_forecast_broadcast.sql.

-- ---------------------------------------------------------------------------
-- TARGET AREAS — operator-named locations to monitor. Not tied to a device;
-- this is the dashboard's own watchlist, independent of who has it open.
-- ---------------------------------------------------------------------------
create table if not exists target_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location geography(point, 4326) not null,
  city_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists target_areas_active_idx on target_areas (active);
create index if not exists target_areas_geo_idx on target_areas using gist (location);

-- ---------------------------------------------------------------------------
-- TARGET AREA SUGGESTIONS — a monitor run's output. `dedupe_key` mirrors the
-- forecast-broadcast idiom (see 0003) so the same live condition doesn't
-- generate a fresh row every time the job runs: `targetarea:<areaId>:<ruleId>`.
-- Unlike a forecast alert, a suggestion doesn't expire on its own — a human
-- dismissing it or publishing it is the only way it leaves 'pending'.
-- ---------------------------------------------------------------------------
create table if not exists target_area_suggestions (
  id uuid primary key default gen_random_uuid(),
  target_area_id uuid not null references target_areas (id) on delete cascade,
  hazard_types text[] not null,             -- e.g. {"Heatwave","Wildfire"}
  trigger_rule text not null,               -- TARGET_AREA_RULES id, e.g. "heat" | "precip"
  reason text not null,                     -- human-readable, built from the weather-risk signal
  risk_snapshot jsonb not null,             -- the matching entries from weather-risk's risks[]
  status text not null check (status in ('pending', 'published', 'dismissed')) default 'pending',
  published_alert_id uuid references alerts (id),
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists target_area_suggestions_area_idx on target_area_suggestions (target_area_id);
create index if not exists target_area_suggestions_status_idx on target_area_suggestions (status);

-- ---------------------------------------------------------------------------
-- TARGET AREA RUNS — same reasoning as broadcast_runs (0003): tells "nothing
-- triggered this run" apart from "the job stopped running."
-- ---------------------------------------------------------------------------
create table if not exists target_area_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  areas_scanned int not null default 0,
  suggestions_created int not null default 0,
  error text
);

create index if not exists target_area_runs_started_idx on target_area_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- READ VIEWS — same purpose as commute_points_view/alerts_view in 0001: expose
-- plain lat/lng instead of WKB hex so API routes can select directly.
-- ---------------------------------------------------------------------------
create or replace view target_areas_view as
select
  id, name, city_name, active, created_at, updated_at,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng
from target_areas;

create or replace view target_area_suggestions_view as
select
  s.id, s.target_area_id, s.hazard_types, s.trigger_rule, s.reason, s.risk_snapshot,
  s.status, s.published_alert_id, s.dedupe_key, s.created_at, s.updated_at,
  t.name as target_area_name, t.city_name,
  st_y(t.location::geometry) as lat,
  st_x(t.location::geometry) as lng
from target_area_suggestions s
join target_areas t on t.id = s.target_area_id;

-- Row Level Security — same convention as every other table: service role
-- only, no anon/authenticated policies.
alter table target_areas enable row level security;
alter table target_area_suggestions enable row level security;
alter table target_area_runs enable row level security;
