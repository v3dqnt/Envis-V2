-- Envis Aegis — mobile alert delivery schema
--
-- Design intent: the web app already computes real hazard predictions
-- (forecast-risk, hazard-zones, GDACS). This schema is the handoff point —
-- predictions get materialized into `alerts` as geography, and a mobile app
-- registers a device, its current location, and its commute points (home,
-- work, and any waypoints in between). Matching a device against alerts is a
-- PostGIS distance query, not client-side haversine over a full table scan.
--
-- Run this in the Supabase SQL editor, or via `supabase db push` if the CLI
-- is linked to a project.

create extension if not exists postgis;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- DEVICES — one row per installed app instance. Not tied to a login; the
-- mobile app generates a UUID on first launch and sends it as device_id.
-- ---------------------------------------------------------------------------
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,           -- client-generated stable UUID
  push_token text,                          -- Expo push token / FCM token
  push_provider text check (push_provider in ('expo', 'fcm', 'apns')),
  platform text check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_device_id_idx on devices (device_id);

-- ---------------------------------------------------------------------------
-- DEVICE LOCATIONS — current location only (upserted on every ping from the
-- app). History isn't kept here; this is "where is the user right now" for
-- proximity matching, not a tracking log.
-- ---------------------------------------------------------------------------
create table if not exists device_locations (
  device_id text primary key references devices (device_id) on delete cascade,
  location geography(point, 4326) not null,
  accuracy_m numeric,
  updated_at timestamptz not null default now()
);

create index if not exists device_locations_geo_idx on device_locations using gist (location);

-- ---------------------------------------------------------------------------
-- COMMUTE POINTS — home, work, and any named waypoints a user wants covered
-- even when they aren't physically there right now (e.g. alert me about
-- flooding near my kid's school even while I'm at the office).
-- ---------------------------------------------------------------------------
create table if not exists commute_points (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references devices (device_id) on delete cascade,
  label text not null,                      -- 'home' | 'work' | free text
  location geography(point, 4326) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists commute_points_device_idx on commute_points (device_id);
create index if not exists commute_points_geo_idx on commute_points using gist (location);

-- ---------------------------------------------------------------------------
-- ALERTS — materialized hazard predictions/events. `origin` is the point
-- geometry (epicentre); `impact_area` is an optional polygon (from
-- /api/hazard-zones or a GDACS footprint) for hazards where we have real
-- geometry rather than just a radius.
-- ---------------------------------------------------------------------------
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  hazard_type text not null,                -- 'Wildfire' | 'Flooding' | ... matches app's HAZARD_TYPES
  severity text not null check (severity in ('low', 'medium', 'high')),
  source text not null check (source in ('forecast', 'polygon', 'gdacs', 'manual')),
  title text not null,
  message text not null,
  method text,                              -- the prediction method, e.g. "CAPE + bulk shear"
  risk_score numeric,                       -- 0-1, null for climatology/GDACS-sourced alerts
  lead_time_hours numeric,                  -- null when there is no onset estimate
  origin geography(point, 4326) not null,
  radius_m numeric not null default 5000,   -- used for point-radius matching
  impact_area geography(polygon, 4326),     -- optional real polygon, when available
  city_name text,
  raw_payload jsonb,                        -- full driver/zone data for the mobile client to render
  published_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index if not exists alerts_origin_idx on alerts using gist (origin);
create index if not exists alerts_impact_area_idx on alerts using gist (impact_area);
create index if not exists alerts_expires_idx on alerts (expires_at);
create index if not exists alerts_hazard_type_idx on alerts (hazard_type);

-- ---------------------------------------------------------------------------
-- ALERT DELIVERIES — records what was already surfaced to which device, so
-- the feed endpoint doesn't re-push the same alert every time the app polls,
-- and so we can tell a "current location" match from a "commute point" match.
-- ---------------------------------------------------------------------------
create table if not exists alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts (id) on delete cascade,
  device_id text not null references devices (device_id) on delete cascade,
  matched_via text not null check (matched_via in ('current_location', 'commute_point')),
  matched_point_label text,                 -- commute point label, null for current_location
  distance_m numeric,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  unique (alert_id, device_id, matched_via, matched_point_label)
);

create index if not exists alert_deliveries_device_idx on alert_deliveries (device_id);

-- ---------------------------------------------------------------------------
-- MATCHING FUNCTION — given a device's current location + commute points,
-- return every active, undelivered alert within range. `radius_m` on the
-- alert row governs the match distance; impact_area (when present) is
-- checked with ST_DWithin against the polygon instead of just the origin
-- point, so a real flood-zone polygon matches correctly even when the
-- device sits near the polygon's edge rather than its centroid.
-- ---------------------------------------------------------------------------
create or replace function nearby_alerts(p_lat double precision, p_lng double precision, p_radius_m numeric default null)
returns table (
  id uuid,
  hazard_type text,
  severity text,
  source text,
  title text,
  message text,
  method text,
  risk_score numeric,
  lead_time_hours numeric,
  radius_m numeric,
  city_name text,
  raw_payload jsonb,
  published_at timestamptz,
  expires_at timestamptz,
  origin_lat double precision,
  origin_lng double precision,
  distance_m double precision
)
language sql
stable
as $$
  select
    a.id, a.hazard_type, a.severity, a.source, a.title, a.message, a.method,
    a.risk_score, a.lead_time_hours, a.radius_m, a.city_name, a.raw_payload,
    a.published_at, a.expires_at,
    st_y(a.origin::geometry) as origin_lat,
    st_x(a.origin::geometry) as origin_lng,
    st_distance(a.origin, geography(st_setsrid(st_makepoint(p_lng, p_lat), 4326))) as distance_m
  from alerts a
  where a.expires_at > now()
    and st_dwithin(
      coalesce(a.impact_area, a.origin::geography),
      geography(st_setsrid(st_makepoint(p_lng, p_lat), 4326)),
      coalesce(p_radius_m, a.radius_m)
    )
  order by a.published_at desc;
$$;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- READ VIEWS — PostgREST returns PostGIS geography columns as WKB hex by
-- default, which is useless to a JSON client. These views expose plain
-- lat/lng numeric columns instead, so API routes can select from the view
-- rather than parsing geometry text themselves. Writes still go through the
-- base tables (geography accepts an EWKT text literal on insert directly).
-- ---------------------------------------------------------------------------
create or replace view commute_points_view as
select
  id, device_id, label, sort_order, created_at,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng
from commute_points;

create or replace view device_locations_view as
select
  device_id, accuracy_m, updated_at,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng
from device_locations;

create or replace view alerts_view as
select
  id, hazard_type, severity, source, title, message, method, risk_score,
  lead_time_hours, radius_m, city_name, raw_payload, published_at, expires_at,
  st_y(origin::geometry) as origin_lat,
  st_x(origin::geometry) as origin_lng,
  case when impact_area is not null then st_asgeojson(impact_area::geometry) end as impact_area_geojson
from alerts;

-- Row Level Security — API routes use the service role key (bypasses RLS)
-- since matching/publishing is server-side only. These policies exist so
-- that if the anon key is ever exposed to a client, it can't read or write
-- anything by default.
-- ---------------------------------------------------------------------------
alter table devices enable row level security;
alter table device_locations enable row level security;
alter table commute_points enable row level security;
alter table alerts enable row level security;
alter table alert_deliveries enable row level security;

-- No policies defined = no access under the anon/authenticated roles.
-- All access goes through Next.js API routes using the service role key.
