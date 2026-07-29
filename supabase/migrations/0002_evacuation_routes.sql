-- Envis Aegis — evacuation route transmission
--
-- 0001 gets a hazard alert to a phone. This migration gets the *way out* there
-- too: the actual road geometry Aegis Route computed, the shelter it leads to,
-- and how long it takes.
--
-- Why routes are their own table rather than JSON on the alert:
--   * one alert normally carries two routes (direct, and a detour that bypasses
--     the hazard dome), and may later carry one per shelter direction
--   * the geometry is a real PostGIS linestring, so a mobile client can ask
--     "which of these routes passes nearest to me" without downloading them all
--   * routes expire with their alert via ON DELETE CASCADE, so nothing is left
--     pointing at a hazard that is no longer live
--
-- Run this after 0001_init.sql in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- EVACUATION ROUTES — the drivable path out, as transmitted by the dashboard.
-- `path` is the full road geometry; `destination` is where it ends.
-- ---------------------------------------------------------------------------
create table if not exists evacuation_routes (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts (id) on delete cascade,

  -- 'primary' is the direct route; 'detour' bypasses the hazard dome. The
  -- dashboard sends both when they differ so the phone can show the trade-off
  -- (a detour is usually longer but avoids the danger area).
  kind text not null check (kind in ('primary', 'detour')),
  label text not null,

  destination_name text,
  destination geography(point, 4326),
  path geography(linestring, 4326) not null,

  distance_km numeric,
  duration_min numeric,
  traffic_delay_min numeric,

  -- Set on the route responders should actually take. Exactly one route per
  -- alert is normally recommended; the partial unique index below enforces it.
  is_recommended boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists evacuation_routes_alert_idx on evacuation_routes (alert_id);
create index if not exists evacuation_routes_path_idx on evacuation_routes using gist (path);

-- At most one recommended route per alert. A partial unique index is the right
-- tool here: it constrains only the rows where is_recommended is true, so any
-- number of non-recommended alternatives can coexist.
create unique index if not exists evacuation_routes_one_recommended_idx
  on evacuation_routes (alert_id)
  where is_recommended;

-- ---------------------------------------------------------------------------
-- EVACUATION SHELTERS — destinations offered for an alert. Kept separate from
-- routes because a shelter is useful on its own ("nearest safe place") even
-- before a route to it has been computed.
-- ---------------------------------------------------------------------------
create table if not exists evacuation_shelters (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts (id) on delete cascade,
  name text not null,
  direction text,
  reason text,
  location geography(point, 4326) not null,
  distance_km numeric,
  created_at timestamptz not null default now()
);

create index if not exists evacuation_shelters_alert_idx on evacuation_shelters (alert_id);
create index if not exists evacuation_shelters_geo_idx on evacuation_shelters using gist (location);

-- ---------------------------------------------------------------------------
-- READ VIEWS — PostgREST serialises geography as WKB hex, which a JSON client
-- cannot use. Expose the path as GeoJSON and the points as plain lat/lng, the
-- same pattern 0001 uses for commute points and alert origins.
-- ---------------------------------------------------------------------------
create or replace view evacuation_routes_view as
select
  id, alert_id, kind, label, destination_name,
  distance_km, duration_min, traffic_delay_min, is_recommended, created_at,
  st_asgeojson(path::geometry) as path_geojson,
  st_npoints(path::geometry) as path_points,
  case when destination is not null then st_y(destination::geometry) end as destination_lat,
  case when destination is not null then st_x(destination::geometry) end as destination_lng
from evacuation_routes;

create or replace view evacuation_shelters_view as
select
  id, alert_id, name, direction, reason, distance_km, created_at,
  st_y(location::geometry) as lat,
  st_x(location::geometry) as lng
from evacuation_shelters;

-- ---------------------------------------------------------------------------
-- Same RLS posture as 0001: no policies, so the anon key can reach nothing.
-- All access is server-side through Next.js routes using the service role key.
-- ---------------------------------------------------------------------------
alter table evacuation_routes enable row level security;
alter table evacuation_shelters enable row level security;
