# Aegis Prevent — Data Sources, Formulas & Methods

> Comprehensive documentation of every data source, prediction formula, and rendering
> method used across the Envis-V2 / Aegis Prevent disaster intelligence platform.

---

## Table of Contents

1. [Core Data Sources](#1-core-data-sources)
2. [Per-Disaster Prediction Methods & Formulas](#2-per-disaster-prediction-methods--formulas)
   - [Wildfire](#21-wildfire)
   - [Flooding](#22-flooding)
   - [Flash Flood](#23-flash-flood)
   - [Thunderstorm](#24-thunderstorm)
   - [Tropical Cyclone](#25-tropical-cyclone)
   - [Blizzard](#26-blizzard)
   - [Ice Storm](#27-ice-storm)
   - [Extreme Cold](#28-extreme-cold)
   - [Heatwave](#29-heatwave)
   - [Drought](#210-drought)
   - [Landslide](#211-landslide)
   - [Temperature Heatmap (Visualization)](#212-temperature-heatmap-visualization)
3. [Sensor & Live-Feed Integration](#3-sensor--live-feed-integration)
4. [Map Rendering Layers & Data Origins](#4-map-rendering-layers--data-origins)
5. [Availability Logic — Which Hazards Are Predicted vs Audited](#5-availability-logic--which-hazards-are-predicted-vs-audited)
6. [Appendix: Meteorology Library](#6-appendix-meteorology-library)

---

## 1. Core Data Sources

| Source | API Endpoint | Key Required | Used By |
|---|---|---|---|
| **Open-Meteo Archive** | `archive-api.open-meteo.com/v1/archive` | Free, no key | Weather risk climatology, forecast seasonal baseline, hazard-zone scoring |
| **Open-Meteo Forecast** | `api.open-meteo.com/v1/forecast` | Free, no key | Temperature grid, 72h forecast engine, hazard-zone weather context |
| **Open-Meteo Elevation** | `api.open-meteo.com/v1/elevation` | Free, no key | Vulnerability zones, hazard-zone elevation profiles |
| **OpenStreetMap (Overpass)** | `overpass-api.de/api/interpreter` | Free, 3 rotating mirrors | Vulnerability zones, hazard zones (real polygons) |
| **GDACS** | `gdacs.org/gdacsapi/api/events/geteventlist/SEARCH` | Free | Live global disaster feed (cyclones + earthquakes) |
| **USGS** | `earthquake.usgs.gov/fdsnws/event/1/query` | Free | Live earthquake feed (≥4.5 magnitude) |
| **Tomorrow.io** | `api.tomorrow.io/v4/storms` | `TOMORROW_IO_API_KEY` | Optional tropical cyclone feed |
| **XWeather** | `data.api.xweather.com/tropicalcyclones/active` | `XWEATHER_CLIENT_ID` + `XWEATHER_CLIENT_SECRET` | Optional tropical cyclone feed |
| **NASA FIRMS** | `firms.modaps.eosdis.nasa.gov/api/area/csv` | `NASA_FIRMS_MAP_KEY` (free signup) | Satellite fire hotspot detection (VIIRS) |
| **OpenAQ** | `api.openaq.org/v3/locations` + `/v3/sensors` | `OPENAQ_API_KEY` (free signup) | Ground air-quality sensor data (PM2.5/PM10) |
| **TomTom** | `api.tomtom.com/search/2/poiSearch` + `categorySearch` | `NEXT_PUBLIC_TOMTOM_API_KEY` | Emergency services POIs + evacuation shelter search |
| **OpenAI GPT-4o** | OpenAI Chat Completions | `OPENAI_API_KEY` | Vulnerability-zone AI analysis, city density estimates, evacuation routing, prevention strategy reports |
| **MapTiler** | `api.maptiler.com/maps/streets-v2/style.json` | `NEXT_PUBLIC_MAPTILER_API_KEY` | Map basemap tile rendering |

---

## 2. Per-Disaster Prediction Methods & Formulas

### 2.1 Wildfire

**Endpoints:** `/api/hazard-zones` (post, hazardType=`"Wildfire"`), `/api/weather-risk`, `/api/forecast-risk`

#### Real Polygon Model (`/api/hazard-zones`)

Queries OpenStreetMap for actual vegetation polygons:
- `landuse=forest`, `natural=wood`, `natural=scrub`, `landuse=meadow`

Each polygon is scored against live weather data from Open-Meteo (30-day forecast):

```
dryness = clamp01((maxTempC - 22) / 20) × clamp01(1 - total30DayPrecipMm / 60)

sizeFactor = min(1, areaKm² / 2)

score = dryness × 0.7 + sizeFactor × 0.3
```

Severity thresholds:
- **high:** `score > 0.55`
- **medium:** `score > 0.30`
- **low:** otherwise

Returns real OSM polygon geometry — not approximated circles. Up to 120 polygons sorted by score descending.

#### Climatological Risk (`/api/weather-risk`, `deriveRisks()`)

Derived from 10 years of Open-Meteo archive data:

| Confidence | Condition |
|---|---|
| **high** | `maxTempC > 40°C` AND `annualAvgPrecipMm < 600mm` |
| **medium** | `maxTempC > 35°C` AND `annualAvgPrecipMm < 600mm` |
| **low** | `maxTempC > 38°C` |

Recent signal: recent 30 days with high heat (`>28°C`) and near-zero rainfall (`<20mm`).

#### 72h Fire Weather Forecast (`/api/forecast-risk`)

Based on **Vapour Pressure Deficit (VPD)** as the primary fuel-dryness driver, plus wind gusts and deep soil moisture:

```
vpdF      = clamp01((peakVPD - 1.0) / 2.5)
rhF       = clamp01((40 - minRH) / 25)
gustF     = clamp01((peakGust - 20) / 40)
dryFuel   = clamp01((0.25 - deepSoilMoisture) / 0.15)

score     = vpdF × 0.35 + rhF × 0.25 + gustF × 0.2 + dryFuel × 0.2
```

VPD > 2.5 kPa → "Extreme atmospheric drying of fuels". Root-zone soil moisture < 0.15 m³/m³ → "Severely depleted — vegetation stressed".

---

### 2.2 Flooding

**Endpoints:** `/api/hazard-zones` (post, hazardType=`"Flooding"`), `/api/weather-risk`, `/api/forecast-risk`

#### Real Polygon Model (`/api/hazard-zones`)

Queries OSM for actual water features:
- `natural=water` (lakes, ponds)
- `landuse=reservoir`, `water=reservoir`
- `waterway=riverbank` (polygons)
- `waterway=river`, `waterway=stream` (lines → buffered into ~350m/150m corridor polygons)

Each feature is scored using weather + elevation:

```
rainFactor    = clamp01(recent7DayPrecipMm / 60) × 0.6 + clamp01(total30DayPrecipMm / 150) × 0.4

lowLyingFactor = 0.85 if elev <= medianElev else max(0.15, 0.85 - (elev - medianElev) / 60)

score = rainFactor × 0.6 + lowLyingFactor × 0.4
```

Severity thresholds:
- **high:** `score > 0.60`
- **medium:** `score > 0.38`
- **low:** otherwise

Elevation is sampled via Open-Meteo's free elevation API at each feature centroid + the target point. The median elevation of water-adjacent terrain provides the local reference.

Also applies to `Thunderstorm` and `Tropical Cyclone` hazard types (same flooding mechanism but triggered by different parent hazards).

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **high** | `maxDailyPrecipMm > 100mm` |
| **medium** | `maxDailyPrecipMm > 50mm` |

Recent signal: 30-day precipitation > 140% of historical monthly average.

#### 72h Flash-Flood Forecast (see [Flash Flood](#23-flash-flood) below)

---

### 2.3 Flash Flood

**Endpoint:** `/api/hazard-zones` (post, hazardType=`"Flash Flood"`), `/api/forecast-risk`

#### Real Structure Model (`/api/hazard-zones`)

Queries OSM for urban drainage chokepoints:
- `highway` with `tunnel=yes`
- `highway` with `layer=-1`, `layer=-2`
- `waterway=culvert`, `waterway=drain`, `waterway=ditch`
- `man_made=storm_drain`

Each feature is a ~100m square cell drawn around the midpoint of the OSM way.

**Uses live soil saturation** from Open-Meteo hourly data:
```
soilSaturation = clamp01((avgSoilMoisture_0_to_1cm + avgSoilMoisture_3_to_9cm) / 2 - 0.22) / 0.18)
```

Elevation of each candidate plus 4 surrounding points (~275m offset) is sampled to compute **depth below surrounding grade**:

```
score = structureFactor × 0.4 + soilSaturation × 0.28 + rainFactor × 0.22 + depthFactor × 0.1
```

Where:
- `structureFactor`: 0.85 for underpasses/tunnels, 0.4 for drains/ditches
- `depthFactor = clamp01(depthBelowGrade / 6)`
- `rainFactor = clamp01(recent7DayPrecipMm / 60)`

#### 72h Forecast (`/api/forecast-risk`)

Uses the **Antecedent Precipitation Index (API)** — a standard hydrological measure:

```
API = Σ Pᵢ · k^i   (i = days before present, k ≈ 0.9)
```

Formula from `src/lib/meteorology.ts`:

```
saturation = clamp01(((surfaceSM + rootSM) / 2 - 0.22) / 0.18)
apiF       = clamp01(API / 40)
intensity  = clamp01(peakHourlyPrecip / 15)
volume     = clamp01(total72hPrecip / 80)
convective = CAPE present ? clamp01((CAPE - 500) / 2000) × 0.25 : 0

score = saturation × 0.25 + apiF × 0.2 + intensity × 0.3 + volume × 0.15 + convective
```

---

### 2.4 Thunderstorm

**Endpoint:** `/api/forecast-risk`, `/api/weather-risk`

#### 72h Forecast (`/api/forecast-risk`)

Uses three standard convective indices from operational meteorology:

| Index | What It Measures | Source |
|---|---|---|
| **CAPE** (Convective Available Potential Energy) | Buoyancy available to rising air | Open-Meteo hourly |
| **Lifted Index** | Stability of a lifted air parcel | Open-Meteo hourly |
| **CIN** (Convective Inhibition) | Energy needed to overcome capping inversion | Open-Meteo hourly |

```
capeF     = clamp01((CAPE - 300) / 2200)
liF       = clamp01(-liftedIndex / 6)
uncapped  = clamp01(1 - |CIN| / 150)
support   = clamp01(cloudCover/100 × 0.5 + precipProb/100 × 0.5)

score     = clamp01(capeF × 0.4 + liF × 0.25 + uncapped × 0.15 + support × 0.2)
```

Interpretation:
- CAPE > 2500 J/kg → "Strong instability"
- Lifted Index < -6 → "Strongly unstable"
- |CIN| < 25 J/kg → "Uncapped — convection can fire freely"

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **medium** | `maxWindKmh ≥ 60` AND `maxDailyPrecipMm ≥ 30` AND `maxWindKmh ≥ 90` |
| **low** | `(maxWindKmh ≥ 60 OR maxDailyPrecipMm ≥ 30)` AND `recent.maxWindKmh ≥ 50` |

---

### 2.5 Tropical Cyclone

**Endpoints:** `/api/forecast-risk`, `/api/weather-risk`, `/api/live-feed`

#### Saffir-Simpson Wind Scale (`src/lib/meteorology.ts`)

Expressed in km/h sustained wind:

| Category | Wind Speed (km/h) |
|---|---|
| Category 5 | ≥ 252 |
| Category 4 | ≥ 209 |
| Category 3 | ≥ 178 |
| Category 2 | ≥ 154 |
| Category 1 | ≥ 119 |
| Tropical Storm | ≥ 63 |
| Tropical Depression | < 63 |

#### 72h Forecast (`/api/forecast-risk`)

Combines pressure signature and wind anomaly vs a 10-year seasonal baseline:

```
pressureF = clamp01((1010 - minPressure) / 60)
windF     = clamp01((maxWind - 60) / 190)
anomalyF  = zScore !== null ? clamp01(zScore / 3) : 0

score     = pressureF × 0.4 + windF × 0.45 + anomalyF × 0.15
```

Only fires when `score > 0.3` AND (`minPressure < 1000 hPa` OR `maxWind ≥ 63 km/h`).

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **high** | `maxWindKmh > 120` |
| **medium** | `maxWindKmh > 90` |

#### Live Feed (`/api/live-feed`)

Aggregates from up to 4 sources with proximity deduplication:

| Source | Condition | Fields |
|---|---|---|
| GDACS | `eventtype=TC` | Name, coordinates, alert level |
| Tomorrow.io | API key present | Wind speed, classification, basin |
| XWeather | Client ID + Secret | Wind speed (kts), classification, basin |

Deduplication threshold: 1 degree (~111 km) coordinate proximity.

---

### 2.6 Blizzard

**Endpoint:** `/api/forecast-risk`, `/api/weather-risk`

#### NWS Criteria (`src/lib/meteorology.ts` — `blizzardHours()`)

Follows the official US National Weather Service definition — ALL three conditions must hold **simultaneously** for **≥3 hours**:

1. **Wind:** Sustained wind or frequent gusts **≥56 km/h** (35 mph)
2. **Visibility:** **<400 m** (¼ mile) due to falling or blowing snow
3. **Snow:** Either falling snow (>0.05 cm/h) or lying snow (>0.02 m depth) available to be blown

If conditions don't persist for 3 hours it is classified as a severe snowstorm, not a blizzard.

#### Forecast Scoring

```
meetsDuration = longestRunHours >= 3
durationF = clamp01(longestRunHours / 6)
extentF   = clamp01(qualifyingHours / 12)

score = (meetsDuration ? 0.45 : 0.2) + durationF × 0.35 + extentF × 0.2
```

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **high** | `maxDailySnowCm > 30` |
| **medium** | `maxDailySnowCm > 10` |

---

### 2.7 Ice Storm

**Endpoint:** `/api/forecast-risk`

#### Freezing-Rain Detection (`src/lib/meteorology.ts` — `freezingRainAnalysis()`)

Freezing rain forms through a specific thermal profile — snow falls through a warm layer aloft, melts, then refreezes on contact with a sub-freezing surface:

| Condition | Criterion |
|---|---|
| Surface temperature | `≤ 0.5°C` (sub-freezing surface) |
| 850 hPa temperature | `> 0°C` (warm layer aloft — snow melts) |
| Liquid precipitation | `precip > 0.05 mm/h` AND `snowfall < precip × 0.3` |

**Ice accretion** is estimated as the cumulative liquid precipitation depth during freezing-rain hours (an order-of-magnitude indicator, not an engineering figure).

#### Damage Impact Thresholds

| Accretion | Impact Description |
|---|---|
| ≥ 25 mm | **Catastrophic** — widespread structural and grid collapse likely |
| ≥ 12 mm | **Severe** — power lines and poles at risk of failure |
| ≥ 6 mm | **Significant** — tree limbs down, scattered outages |
| ≥ 1 mm | **Nuisance** — hazardous road and walkway glazing |

#### Forecast Scoring

```
accretionF = clamp01(estimatedAccretionMm / 12)
durationF   = clamp01(iceHours / 8)

score = accretionF × 0.6 + durationF × 0.4
```

---

### 2.8 Extreme Cold

**Endpoints:** `/api/forecast-risk`, `/api/weather-risk`

#### Wind Chill — JAG/TI Formula (`src/lib/meteorology.ts`)

The standard jointly adopted by the US NWS and Environment Canada (2001):

```
WC = 13.12 + 0.6215·T − 11.37·V^0.16 + 0.3965·T·V^0.16
```

Valid when `temperature ≤ 10°C` AND `wind speed > 4.8 km/h`. Otherwise plain air temperature is returned.

#### Frostbite Risk (Environment Canada Hazard Table)

| Wind Chill | Time to Frostbite |
|---|---|
| ≤ −55°C | 2 minutes |
| ≤ −48°C | 5 minutes |
| ≤ −40°C | 10 minutes |
| ≤ −27°C | 30 minutes |
| > −27°C | No meaningful risk |

#### Forecast Scoring

Combines absolute cold, duration, and **seasonal anomaly** using z-score against a 10-year baseline:

```
absoluteF  = clamp01((-windChill - 10) / 35)
durationF  = clamp01(hoursBelowM15 / 12)
anomalyF   = zScore !== null ? clamp01(-z / 2.5) : 0.3

score = absoluteF × 0.4 + durationF × 0.25 + anomalyF × 0.35
```

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **high** | `minTempC < -30°C` |
| **medium** | `minTempC < -20°C` |

---

### 2.9 Heatwave

**Endpoint:** `/api/weather-risk`

Derived from **temperature anomaly** — how much the recent 30-day average deviates from the 10-year historical mean:

```
tempAnomaly = recent.avgTempC - hist.avgTempC
```

| Confidence | Condition |
|---|---|
| **high** | `tempAnomaly ≥ 5°C` |
| **medium** | `tempAnomaly ≥ 3°C` OR `hist.maxTempC > 40°C` |
| **low** | `hist.maxTempC > 36°C` |

No separate 72h forecast — heatwaves are persistent climatological events, not short-onset hazards.

---

### 2.10 Drought

**Endpoint:** `/api/forecast-risk`, `/api/weather-risk`

#### Standardized Precipitation Index (SPI) Approach

Uses the **z-score** of precipitation against the same-calendar-window historical baseline:

```
zScore = (value - mean) / std
```

Formula from `src/lib/meteorology.ts`:

| z-score range | Classification | Severity |
|---|---|---|
| ≤ −2.0 | Extreme drought | 1.0 |
| ≤ −1.5 | Severe drought | 0.8 |
| ≤ −1.0 | Moderate drought | 0.6 |
| ≤ −0.5 | Mild drought | 0.35 |
| > −0.5 | Near normal / wet | 0 |

#### Forecast Scoring

```
soilF    = clamp01((0.22 - deepSoilMoisture) / 0.14)
dryRunF  = clamp01(longestDrySpellDays / 21)
balanceF = clamp01((ET₀_sum - precip_sum) / 15)

score = spi.severity × 0.45 + soilF × 0.25 + dryRunF × 0.15 + balanceF × 0.15
```

Uses **FAO ET₀** (reference evapotranspiration) from Open-Meteo daily data for water-balance estimation.

#### Climatological Risk (`/api/weather-risk`)

| Confidence | Condition |
|---|---|
| **high** | `annualAvgPrecipMm < 250mm` |
| **medium** | `annualAvgPrecipMm < 500mm` |

Note: Drought and Wildfire are mutually exclusive in the risk list — drought is suppressed when wildfire is already present, since the arid conditions that drive wildfire also imply drought.

---

### 2.11 Landslide

**Endpoint:** `/api/vulnerability-zones`, `/api/hazard-zones`, `/api/forecast-risk`

#### 72h Forecast — Caine Rainfall I-D Threshold + Infinite-Slope Stability (`/api/forecast-risk`)

Landslide is a full Tier 1 forecast hazard with an actual lead time — see [§5](#5-availability-logic--which-hazards-are-predicted-vs-audited). Two independent, published methods combine:

**1. Rainfall trigger — Caine (1980) global intensity-duration threshold:**

```
I = 14.82 · D^-0.39   (I = mm/h, D = duration in hours)
```

The forecast rainfall series is tested against this curve at five durations (1, 3, 6, 12, 24h) via a rolling-window intensity — a short intense burst and a long moderate soak are both real triggers, so every duration is checked independently. The worst (highest ratio-to-threshold) duration drives the score; the first hour any duration crosses ratio ≥ 1 sets `leadTimeHours`.

**2. Slope stability — infinite-slope factor of safety** (Montgomery & Dietrich 1994 / the physical model behind USGS's TRIGRS and SHALSTAB):

```
FS = [c' + (γ·z − γw·m·z)·cos²β·tanφ'] / (γ·z·sinβ·cosβ)
```

where `c'` = effective cohesion, `φ'` = effective friction angle, `γ` = soil unit weight, `z` = assumed 1.2m shallow regolith depth, `β` = slope angle, `m` = fraction of the soil column saturated (0–1). `c'`, `φ'`, `γ` come from `soilMechanicalParams()` — a texture-class lookup keyed off `/api/soil`'s USDA classification. `m` comes from real-time soil moisture (`soil_moisture_0_to_1cm`/`3_to_9cm`, already fetched for Flash Flood) blended with the Antecedent Precipitation Index. FS < 1.0 means resisting strength is already exceeded under the assumed conditions; FS > 1.5 is conventionally stable.

**Slope source:** a 5-point Open-Meteo elevation cross (free, always available), refined against the Copernicus 30m DEM via `/api/terrain` when `OPENTOPOGRAPHY_API_KEY` is configured.

```
triggerF    = clamp01(worstIntensity / caineThreshold)
saturationF = clamp01(soilMoistureState × 0.6 + apiF × 0.4)
stabilityF  = clamp01((1.6 - FS) / 1.1)

score = triggerF × 0.4 + stabilityF × 0.35 + saturationF × 0.25
```

Only evaluated where the elevation cross shows > 3% local gradient — flat ground is skipped before any of the above runs.

#### Elevation Gradient Method (`/api/vulnerability-zones`)

Samples elevation at 5 points via Open-Meteo's free elevation API:

| Point | Offset |
|---|---|
| Center | 0 (the target coordinates) |
| North | `lat + 0.01°` (~1.1 km) |
| South | `lat - 0.01°` (~1.1 km) |
| East | `lng + 0.01° / cos(lat)` (~1.1 km) |
| West | `lng - 0.01° / cos(lat)` (~1.1 km) |

Maximum local gradient:

```
distanceMeters = 0.01 × 111320   (~1113 m)
maxGradient = max(|center - north|, |center - south|, |center - east|, |center - west|) / distanceMeters
maxLocalGradientPct = maxGradient × 100
```

This terrain signal feeds into OpenAI GPT-4o for AI-based vulnerability zone identification.

#### OSM Terrain Features

Queried: `natural=cliff`, `natural=slope`, `natural=ridge`, `natural=coastline`

Sent as context to GPT-4o for the AI vulnerability analysis.

#### Fallback Zones (no API key)

Pre-defined tiered vulnerability descriptions:
- **High:** "Steep terrain near waterways or cliffs"
- **Medium:** "Deforested or recently burned hillside areas"
- **Low:** "Settlements built on unstable slopes"

---

### 2.12 Temperature Heatmap (Visualization)

**Endpoint:** `/api/temperature-grid`

#### Grid Generation

Builds an N×N grid (default 11×11, configurable 3–13) over a configurable span (default 0.6°, ~6 km spacing):

```
halfSpan = spanDeg / 2
step     = spanDeg / (gridSize - 1)

for row in 0..gridSize:
  for col in 0..gridSize:
    lat = centerLat - halfSpan + row × step
    lng = centerLng - halfSpan + col × step
```

#### Open-Meteo Multi-Point Request

Sends all grid coordinates as a single batch request to Open-Meteo (returns array of location objects):

```
GET /v1/forecast?latitude={lats_csv}&longitude={lngs_csv}&current=temperature_2m,relative_humidity_2m,apparent_temperature
```

Returns:
- `temperature_2m` (°C) — main heatmap variable
- `relative_humidity_2m` (%)
- `apparent_temperature` (°C)

#### Map Rendering (MapLibre GL)

Two-layer visualization:

1. **Heatmap layer** — smooth temperature interpolation:
   - `heatmap-weight`: linearly interpolated 5°C→0 to 42°C→1
   - `heatmap-color`: 8-stop diverging palette (blue → white → red → dark red)
   - `heatmap-opacity`: 0.55
   - `heatmap-radius`: zoom-dependent (35→55→90 at zoom 5→10→15)

2. **Point circles + labels** — reference dots:
   - Circle color: 8-stop diverging from blue (#2166ac) through white to dark red (#67001f)
   - Label format: `"24°"` (rounded to nearest degree)
   - Labels hidden at low zoom, appear at zoom ≥ 12

---

## 3. Sensor & Live-Feed Integration

### 3.1 NASA FIRMS — Satellite Fire Detection

**Endpoint:** `/api/satellite-fire`

| Field | Value |
|---|---|
| API | `firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/1` |
| Satellite | VIIRS (Suomi NPP), near-real-time |
| Coverage | Last 24 hours only |
| Search radius | Configurable 5–200 km (default 50 km) |
| Key | `NASA_FIRMS_MAP_KEY` (free from https://firms.modaps.eosdis.nasa.gov) |

**Haversine distance** from center to each hotspot:

```
a = sin²(Δlat/2) + cos(lat₁)·cos(lat₂)·sin²(Δlng/2)
c = 2 · atan2(√a, √(1-a))
d = R · c   (R = 6371 km)
```

Returns top 20 nearest hotspots sorted by distance, each with: latitude, longitude, confidence, FRP (Fire Radiative Power), acquisition date.

### 3.2 OpenAQ — Ground Air-Quality Network

**Endpoint:** `/api/air-quality`

| Field | Value |
|---|---|
| API | `api.openaq.org/v3/locations` + `/v3/sensors/{id}` |
| Search radius | 25 km (up to 10 location candidates) |
| Key | `OPENAQ_API_KEY` (free from https://explore.openaq.org/register) |
| Filtering | Skips stations with no report in last 30 days; prefers PM2.5 over PM10 |

**PM2.5 categorization** (US EPA breakpoints):

| Concentration (µg/m³) | Category |
|---|---|
| ≤ 12.0 | Good |
| ≤ 35.4 | Moderate |
| ≤ 55.4 | Unhealthy for Sensitive Groups |
| ≤ 150.4 | Unhealthy |
| ≤ 250.4 | Very Unhealthy |
| > 250.4 | Hazardous |

### 3.3 GDACS — Global Disaster Alert System

**Endpoint:** `/api/gdacs`

| Field | Value |
|---|---|
| API | `gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30` |
| Alert levels | Green (low), Orange (medium), Red (high) |
| Revalidation | 5 minutes (CDN cache) |

**Event type mapping:**

| GDACS Code | Internal Type |
|---|---|
| TC | Tropical Cyclone |
| EQ | Earthquake |
| FL | Flooding |
| WF | Wildfire |
| VO | Volcanic Eruption |

### 3.4 USGS — Earthquake Hazards

**Endpoint:** `/api/live-feed`

| Field | Value |
|---|---|
| API | `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=25&orderby=time` |
| Magnitude threshold | ≥ 4.5 |
| Alert level derivation | `p.alert` if present, else inferred: ≥7.0→red, ≥5.5→orange, else→green |

### 3.5 TomTom — Emergency Services & Shelters

**Endpoints:** `/api/emergency-services`, `/api/evacuation-points`

#### Emergency Services

**API:** `api.tomtom.com/search/2/poiSearch/{category}.json`

Categories searched: `hospital`, `clinic`, `fire station`, `police station`
Parameters: lat, lon, radius=8000m, limit=8 per category

Facilities classified as "Inside Dome" (within hazard radius) or "Safe Zone" (outside).

#### Evacuation Shelters

**API:** `api.tomtom.com/search/2/categorySearch/{category}.json`

Categories searched: `school`, `stadium`, `park`, `community center`
Parameters: lat, lon, radius = max(hazardRadius + 5000m, 10000m), capped at 20000m, limit=15

Results are deduplicated by coordinates, grouped into 4 cardinal directions (N/S/E/W), and the closest shelter in each direction selected. Shelters inside the hazard dome are excluded.

**Direction classification:**

```
angle = atan2(dy, dx) × (180 / π)  normalized to [0, 360)
N: 45–135°
W: 135–225°
S: 225–315°
E: 315–45°
```

**Geometric fallback:** If no real POI is found in a direction, a mathematically generated point is placed at (hazardRadius + 1500m) in that direction.

### 3.6 City Population Density

**Endpoint:** `/api/city-density`

Queries OpenAI GPT-4o with `response_format: { type: "json_object" }` for population density estimates. Falls back to hardcoded values for known cities (NYC: 11,300; London: 5,700; Tokyo: 6,300; Paris: 21,000) and 5,000/km² default when no API key.

---

## 4. Map Rendering Layers & Data Origins

| Layer | Data Origin | Rendering Method | Notes |
|---|---|---|---|
| **Basemap tiles** | MapTiler (streets-v2) | Raster/vector tiles from style.json | Falls back to MapLibre demo tiles if no key |
| **3D buildings** | MapTiler vector tile building layer | `fill-extrusion` | Filter: `render_height > 0` AND `hide_3d != true` |
| **Hazard dome** | Client-calculated from `hazardCenter` + `hazardRadius` | `fill-extrusion` (250m height) | 64-point polygon circle approximation |
| **Epicentre** | Same as hazard center | Dual `circle` layers (glow + core) | Pulsating visual centre |
| **Seismic dampening** | Inner ring at 0.8× radius | `line` (dashed, amber) | Toggled by "Reinforced Foundations" defence |
| **Floodgate barrier** | Outer ring at 1.15× radius | `line` (solid, blue) | Toggled by "Automated Floodgates" defence |
| **Burn barrier** | Outer ring at 1.35× radius | `line` (solid, orange) | Toggled by "Controlled Burn Barriers" defence |
| **Siren network** | 6 points at 1.5× radius, equispaced | `circle` (yellow) | Toggled by "Siren Alert Network" defence |
| **Primary route** | TomTom routing (client) | `line`, congestion-coloured | Red=dashed if compromised, blue=solid if safe |
| **Bypass route** | AI-placed waypoints → TomTom routing | `line` (green, solid) | Detour around hazard dome |
| **Evacuation shelters** | TomTom POI search → GeoJSON | Dual `circle` (glow + core) | Clickable — sets destination for routing |
| **Vulnerability zones** | AI-estimated (GPT-4o) or fallback heuristics | `circle`, severity-coloured (red/orange/yellow) | Radius interpolated at zoom (30→100) |
| **Hazard polygons** | Real OpenStreetMap geometry | `fill` + `line` with severity opacity (0.42/0.30/0.18) | **Actual OSM polygons**, not circles |
| **Hazard origins** | Calculated from weather risk wind direction | `circle` + `symbol` label | Colour-coded by hazard type |
| **Hazard paths** | Downwind spread projection | `line` (dashed, 3px) | Colour-coded by hazard type |
| **Temperature heatmap** | Open-Meteo grid (11×11 points) | `heatmap` + `circle` + `symbol` layers | Default hidden; toggled via toggle |

### Hazard Polygon Colour Mapping

```
Wildfire        → #f97316 (orange)
Flooding        → #3b82f6 (blue)
Toxic Plume     → #22c55e (green)
Earthquake      → #f59e0b (amber)
Tornado         → #14b8a6 (teal)
Radiation Leak  → #84cc16 (lime)
Chemical Spill  → #eab308 (yellow)
Blizzard        → #38bdf8 (sky)
Volcanic        → #e11d48 (rose)
Tropical Cyclone→ #0891b2 (cyan)
Heatwave        → #dc2626 (red)
Drought         → #f59e0b (amber)
Extreme Cold    → #60a5fa (blue)
Thunderstorm    → #6366f1 (indigo)
Landslide       → #57534e (stone)
default         → #6b7280 (grey)
```

---

## 5. Availability Logic — Which Hazards Are Predicted vs Audited

### Two-tier Classification

Every hazard in Aegis Prevent is **anticipatable**, but by two fundamentally different methods:

#### Tier 1: Forecast Hazards (live NWP — have actual lead-time hours)

These use the **72-hour numerical weather prediction** engine (`/api/forecast-risk`) and carry a specific onset time:

| Hazard | Forecast Method Key | Input Variables |
|---|---|---|
| Thunderstorm | CAPE, Lifted Index, CIN | Instability indices, cloud cover, precip probability |
| Flash Flood | API + soil moisture + rainfall intensity | Precip rate, antecedent rain, soil saturation |
| Ice Storm | Freezing-rain thermal profile | Surface temp, 850hPa temp, precip type |
| Fire Weather | VPD + humidity + wind + fuel dryness | Vapour pressure deficit, RH, gusts, deep soil moisture |
| Drought Stress | SPI + ET₀ water balance | Standardized precip anomaly, evapotranspiration |
| Blizzard | NWS three-part criteria | Wind, visibility, snowfall/depth |
| Tropical Cyclone | Pressure minimum + Saffir-Simpson | MSL pressure, sustained wind, seasonal anomaly |
| Extreme Cold | JAG/TI wind chill + frostbite thresholds | Temperature, wind speed, seasonal baseline |
| Landslide | Caine rainfall I-D threshold + infinite-slope factor of safety | Rolling rainfall intensity, slope angle, soil texture, real-time saturation |

Landslide moved here from Tier 2 once the rainfall-triggering and slope-stability logic — previously only available as an on-demand `/api/hazard-zones` analysis — was wired into the same 72h forecast engine everything else in this table uses. That also means it's automatically included in **Continuous Forecast Broadcast** (`/api/forecast/broadcast`), which fans out over whatever `/api/forecast-risk` returns with no per-hazard wiring required.

#### Tier 2: Climatological Hazards (exposure-based — no onset time)

These derive from the **10-year historical archive** (`/api/weather-risk`):

| Hazard | Key Climatological Signal |
|---|---|
| Wildfire | Peak temperature + annual precipitation aridity |
| Flooding | Peak daily rainfall |
| Heatwave | Temperature anomaly (recent vs 10-year mean) |

#### Hazard Types NOT in Aegis Prevent

These are handled in **Aegis Route** (response/evacuation mode) but are **not predicted** because they lack reliable forecast methods:

- Earthquake — geophysical, no reliable NWP precursor signal
- Tornado — sub-grid-scale, cannot be pinned to specific coordinates 72h out
- Volcanic Eruption — geophysical, needs dedicated InSAR/seismic monitoring
- Toxic Plume — industrial accident, not weather-driven
- Radiation Leak — accident scenario
- Chemical Spill — accident scenario

---

## 6. Appendix: Meteorology Library

**File:** `src/lib/meteorology.ts`

All functions follow published operational methods from national meteorological services:

### `windChillC(tempC, windKmh)`
- **Source:** JAG/TI formula (US NWS + Environment Canada, 2001)
- `WC = 13.12 + 0.6215·T − 11.37·V^0.16 + 0.3965·T·V^0.16`
- Valid for `temp ≤ 10°C` and `wind > 4.8 km/h`

### `frostbiteMinutes(windChill)`
- **Source:** Environment Canada wind chill hazard table
- Returns: minutes to frostbite on exposed skin, or `null` if no meaningful risk

### `saffirSimpson(windKmh)`
- **Source:** US National Hurricane Center Saffir-Simpson scale
- Returns: `{ category, level }` where level is 0–5 (0.5 for Tropical Storm)

### `antecedentPrecipitationIndex(dailyPrecipMm, k=0.9)`
- **Source:** Standard hydrological catchment wetness measure
- `API = Σ Pᵢ · k^i` — geometric decay weighting recent rainfall more heavily

### `meanStd(values)` / `zScore(value, sample)`
- **Source:** Standardized Precipitation Index methodology
- `z = (value - mean) / σ`
- Used to assess how unusual a value is for a specific place and season

### `spiCategory(z)`
- **Source:** Standardized Precipitation Index drought classification
- Returns: `{ label, severity }` where severity ranges 0–1

### `blizzardHours(wind, gusts, visibility, snowfall, snowDepth)`
- **Source:** US NWS blizzard criteria
- All three conditions (≥56 km/h wind, <400m visibility, snow) must hold simultaneously
- Returns: `{ qualifyingHours, longestRunHours, firstIndex }`

### `freezingRainAnalysis(surfaceTemp, temp850, precip, snowfall)`
- **Source:** Standard freezing-rain thermal profile detection
- Warm layer aloft (>0°C at 850hPa) + sub-freezing surface (≤0.5°C)
- Returns: `{ hours, accretionMm, firstIndex, peakIndex, warmLayerC }`

### `iceAccretionImpact(mm)`
- **Source:** Ice storm damage thresholds (power utilities standards)
- Returns: damage description string (trace → catastrophic)

### `longestRun(values, predicate)`
- Utility: counts consecutive hours where a condition holds
- Used for sustained cold, dry-spell duration, etc.

### `caineIdThresholdMmPerHr(durationHours)`
- **Source:** Caine (1980) global rainfall intensity-duration landslide threshold
- `I = 14.82 · D^-0.39` — the baseline envelope regional systems (Italy's SIGMA, Hong Kong GEO, USGS Seattle/Bay Area) calibrate against
- Returns: threshold intensity in mm/h for a given storm duration

### `rollingIntensityMmPerHr(hourlyPrecipMm, windowHours)`
- Utility: trailing rolling-mean rainfall intensity per hour, for testing forecast rainfall against the Caine threshold at several durations at once

### `soilMechanicalParams(texture)`
- **Source:** Typical geotechnical correlation tables for shallow colluvium/regolith by USDA texture class (comparable to NAVFAC DM-7.01 / USDA-NRCS references)
- Returns: `{ cohesionKPa, frictionAngleDeg, unitWeightKNm3 }`, keyed off `/api/soil`'s texture classification

### `infiniteSlopeFactorOfSafety({ slopeDeg, cohesionKPa, frictionAngleDeg, unitWeightKNm3, soilDepthM, saturationFraction })`
- **Source:** Infinite-slope stability with parallel seepage — the physically-based model underlying USGS's TRIGRS and SHALSTAB shallow-landslide systems (Montgomery & Dietrich 1994; Selby 1993)
- `FS = [c' + (γ·z − γw·m·z)·cos²β·tanφ'] / (γ·z·sinβ·cosβ)`
- Returns: factor of safety (> 1.5 stable, < 1.0 theoretically failing under the assumed conditions)

### `clamp01(v)`
- Utility: `max(0, min(1, v))`

---

## Appendix B: Prevention Strategy Engine

**Endpoint:** `/api/prevention`

Uses OpenAI GPT-4o to synthesize a multi-hazard prevention report. The prompt receives:

1. **Selected hazard type** + location
2. **Weather risk** payload (10-year climatology + recent conditions + derived risks)
3. **Satellite fire** detection results (NASA FIRMS)
4. **Air quality** sensor readings (OpenAQ)
5. **Advanced materials reference** (cool roofs, FRP retrofitting, permeable pavements, etc.)

Output schema:
```
{
  vulnerabilityMetrics: { infrastructure: number, residential: number, evacuationReadiness: number },
  checklist: string[],
  strategyMarkdown: string
}
```

The prevention report can be exported as a full markdown document via `buildMarkdownReport()` in `PreventionSidebar.tsx`, which aggregates every hazard analysis, climate context, 72h forecast table, live sensor readings, and zone coordinates into a self-contained file.

---

## Appendix C: Auto Jobs

**Endpoint:** `/api/target-areas/monitor` (scheduled), `/api/target-areas`, `/api/target-areas/suggestions`

Introduces no new formulas — it's an automation layer over signals already documented above. A monitor run checks each active target area's `/api/weather-risk` output against a small rule table (`src/lib/targetAreaRules.ts`) mapping a watched risk type to a hazard pair to flag:

| Rule | Watches (§2's `deriveRisks()` logic) | Flags for review |
|---|---|---|
| `heat` | Heatwave temperature anomaly | Heatwave + Wildfire |
| `precip` | Flooding precipitation-vs-history anomaly | Landslide + Flash Flood |

A crossed threshold never auto-publishes — it upserts a row in `target_area_suggestions` (deduplicated the same way `alerts.dedupe_key` prevents `forecast/broadcast` from re-publishing an already-live alert) for a human to review in the dashboard's Notification Panel. The full hazard-zone/vulnerability-zone/prevention pipeline described in §2 and Appendix B only ever runs once a human clicks "Review" on a suggestion — the monitor job itself never calls OpenAI, OSM, or the 72h forecast engine, keeping a routine scan of every target area cheap regardless of how many are being watched.

---

*Data attribution: OpenStreetMap (ODbL) · Open-Meteo · GDACS · USGS · NASA FIRMS · OpenAQ · TomTom · OpenAI · MapTiler*

*Last updated: August 2026*
