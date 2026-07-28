# Aegis Extreme Weather Coverage Analysis

> Generated from full codebase audit of the Envis app (Next.js 16 + MapLibre GL)
>
> **Date:** 2026-07-25

---

## Table of Contents

1. [Full Coverage Matrix](#1-full-coverage-matrix)
2. [Temperature Extremes](#2-temperature-extremes)
3. [Precipitation & Hydrological Extremes](#3-precipitation--hydrological-extremes)
4. [Severe Wind & Storm Events](#4-severe-wind--storm-events)
5. [Wildfires](#5-wildfires)
6. [Geophysical Events](#6-geophysical-events)
7. [Summary: Overall Coverage Score](#7-summary-overall-coverage-score)
8. [Gap Priorities for Development](#8-gap-priorities-for-development)

---

## 1. Full Coverage Matrix

| Event | UI Incident Type | Weather Risk Signal | Live Data Feed | Routing Support | Prevention Audit |
|:---|---:|:---:|:---:|:---:|:---:|
| **Tropical Cyclone** | ✅ (as Tornado) | ✅ | ✅ GDACS, Tomorrow.io, XWeather | ✅ | ✅ |
| **Flood** | ✅ | ✅ | ✅ GDACS | ✅ | ✅ |
| **Wildfire** | ✅ | ✅ | ✅ GDACS | ✅ | ✅ |
| **Earthquake** | ✅ | ❌ | ✅ GDACS, USGS | ✅ | ✅ |
| **Blizzard** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Tornado** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Volcanic Eruption** | ✅ | ❌ | ✅ GDACS | ✅ | ❌ |
| **Toxic Plume** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Radiation Leak** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Chemical Spill** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Drought** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Extreme Cold** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Heatwave** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Heavy Rainfall** | ❌ | ⚠️ (via Flood) | ❌ | ❌ | ❌ |
| **Atmospheric River** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ice Storm** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Thunderstorm** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Derecho** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Hail** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Landslide** | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ = Full support (dedicated feature or pipeline)
- ⚠️ = Partial / proxied coverage
- ❌ = No support

---

## 2. Temperature Extremes

### Heatwaves
**Prolonged periods of excessively hot air, often 5–10°C above normal.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ❌ Not available | Only indirectly referenced through Wildfire |
| Risk signal | ❌ Not detected | Weather-risk API checks max temp only for Wildfire context, never labels standalone heatwave |
| Safety guidance | ❌ Not generated | No heat-specific evacuation/prevention advice |
| Data capability | ⚠️ Has the data | Open-Meteo provides daily temp max/min for 10 years — enough to detect heatwaves, just not wired up |

**What would it take to add?** Add a new `deriveRisks()` rule in `/api/weather-risk` that checks for 3+ consecutive days where daily max temp exceeds the 10-year monthly average by 5°C+. Then add `Heatwave` as a UI incident type in `RoutingSidebar.tsx` and `PreventionSidebar.tsx`.

### Coldwaves
**Unusually severe cold spells.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ❌ Not available | |
| Risk signal | ✅ Detected | `deriveRisks()` checks `hist.minTempC < -20` → labels "Extreme Cold" |
| Safety guidance | ❌ Not generated | No cold-specific routing/prevention advice |
| Data capability | ✅ Has full data | Open-Meteo covers min temps over 10 years |

**Gap:** The risk signal exists but there's no dedicated UI type, no routing logic, and no prevention checklists tailored to coldwaves.

---

## 3. Precipitation & Hydrological Extremes

### Floods
**Caused by heavy rainfall, storm surges from tropical cyclones, or rapid snowmelt.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ✅ Available | `Flooding` in the 9-type grid |
| Risk signal | ✅ High confidence | Detects when `maxDailyPrecipMm > 50` |
| Live feed | ✅ | GDACS passes `FL` events → mapped to `Flooding` |
| Vulnerability zones | ✅ | OSM waterways + low-lying area analysis via OpenAI |
| Active defenses | ✅ | `Automated Floodgates` toggle → blue ring visualized at 1.15× dome radius |
| Evacuation routing | ✅ | Full TomTom → OSRM pipeline |
| AI safety guidance | ✅ | `/api/evacuate` generates flood-specific guidance |

### Droughts
**Extended periods of below-normal precipitation.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ❌ Not available | |
| Risk signal | ✅ Detected | `deriveRisks()` checks `annualAvgPrecipMm < 500` |
| Safety guidance | ❌ Not generated | |
| Routing logic | ❌ | Drought doesn't require immediate evacuation routing |
| Prevention audit | ❌ | No drought-specific mitigation strategy |

**Note:** Drought is a slow-onset disaster — Aegis is optimized for acute, rapid-response scenarios. However, the prevention module could easily generate drought-specific water conservation + infrastructure hardening checklists.

### Heavy Rainfall / Atmospheric Rivers
**Intense precipitation events triggering landslides and flash floods.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ❌ Not available | Proxy through `Flooding` |
| Risk signal | ⚠️ Proxied | Flooding risk signal catches high precip, but no dedicated "Atmospheric River" classification |
| Landslide detection | ❌ Not implemented | The OSM data pipeline in `/api/vulnerability-zones` already fetches `waterway` data — slope analysis could be added |
| Safety guidance | ❌ Not generated | |

**Opportunity:** The Overpass API query in `/api/vulnerability-zones` already fetches waterways and highway data. Adding a terrain slope analysis would enable landslide-specific zone identification.

---

## 4. Severe Wind & Storm Events

### Tropical Cyclones (Hurricanes / Typhoons)
**Strong winds, heavy rain, and storm surges.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ⚠️ Mapped as `Tornado` | GDACS `TC` type → mapped to "Tornado" classification. This is semantically incorrect — TC ≠ tornado |
| Live feed | ✅ **Best covered** | Aggregates from **GDACS, Tomorrow.io, and XWeather** — 3 independent sources. Deduplicates by proximity |
| Risk signal | ✅ High confidence | `deriveRisks()` checks `maxWindKmh > 90` |
| Wind speed data | ✅ | Both Tomorrow.io and XWeather provide wind speed values |
| Category/classification | ✅ | Hurricane categories, Saffir-Simpson scale labels preserved |
| Evacuation routing | ✅ | Full pipeline |
| Storm surge | ❌ Not addressed | No coastal inundation modeling |

**Critical Issue:** The mapping of GDACS `TC` (Tropical Cyclone) to the UI type `Tornado` is incorrect. These are fundamentally different phenomena with different safety guidance, evacuation strategies, and impact zones. A tropical cyclone needs its own `Tropical Cyclone` / `Hurricane` incident type.

### Tornadoes
**Violent rotating columns of air from thunderstorms.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ✅ Available | `Tornado` in the 9-type grid |
| Live feed | ❌ Not sourced | GDACS doesn't provide tornado data; no dedicated tornado feed |
| Risk signal | ❌ Not detected | Weather-risk API has no tornado derivation |
| Safety guidance | ✅ | `/api/evacuate` generates tornado-specific text |
| Routing | ✅ | Full pipeline works generically |

### Thunderstorms / Derechos
**Severe storms producing hail, lightning, and damaging straight-line winds.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ❌ Not available | |
| Risk signal | ❌ Not detected | |
| Live feed | ❌ | |
| Safety guidance | ❌ | |
| Data availability | ⚠️ | Open-Meteo provides daily wind speed max + precipitation — enough to detect derechos (sustained straight-line winds + intense precip) but not wired up |

**Impact:** This is one of the largest gaps. Thunderstorms are the most common severe weather event globally. Derechos cause catastrophic wind damage across hundreds of kilometers but are completely invisible to Aegis.

### Blizzards & Ice Storms
**Severe winter storms with heavy snow, ice accumulation, and strong winds.**

| Aspect | Blizzard | Ice Storm |
|:---|---:|:---:|
| UI incident type | ✅ `Blizzard` | ❌ Not available |
| Risk signal | ✅ Detected from snowfall | ❌ Not detected (no ice accumulation data from Open-Meteo) |
| Live feed | ❌ | ❌ |
| Active defenses | ❌ | ❌ |
| Safety guidance | ✅ (generic) | ❌ |

**Gap for Ice Storms:** Open-Meteo's snowfall data doesn't distinguish between snow and freezing rain/ice. Ice storms require temperature profile data (warm air aloft, sub-freezing at surface) which isn't currently fetched. This would need additional API parameters from Open-Meteo or a separate data source.

---

## 5. Wildfires

**Often ignited by lightning or heat, exacerbated by drought and high temperatures.**

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ✅ `Wildfire` | |
| Risk signal | ✅ High confidence | Detects from max temp > 40°C + arid conditions |
| Live feed | ✅ | GDACS `WF` events, plus heat anomalies from weather data |
| Vulnerability zones | ✅ | OSM vegetation + urban fringe analysis via OpenAI |
| Active defenses | ✅ | `Controlled Burn Barriers` → orange ring at 1.35× dome radius |
| AI prevention audit | ✅ | `/api/prevention` generates wildfire-specific checklists (defensible space, fuel management) |
| Evacuation routing | ✅ | Full pipeline |
| Air quality | ❌ Not addressed | Smoke plume tracking, AQI data not integrated |

---

## 6. Geophysical Events

### Earthquakes

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ✅ | |
| Live feed | ✅ | GDACS + USGS, sorted by magnitude and alert level |
| Risk signal | ❌ | Not derived from weather data (makes sense — earthquakes aren't weather-driven) |
| Active defenses | ✅ | `Reinforced Foundations` → amber dashed ring at 0.8× dome radius |
| Vulnerability zones | ✅ | Building density + older structures analysis via OpenAI |
| Tsunami detection | ⚠️ | USGS data includes `tsunami: 1` flag but no tsunami-specific routing or coastal zone logic |
| Felt reports | ✅ | USGS `felt` count displayed in live feed |

### Volcanic Eruptions

| Aspect | Status | Notes |
|---|---|---|
| UI incident type | ✅ `Volcanic Eruption` | |
| Live feed | ✅ | GDACS `VO` events |
| Risk signal | ❌ | Not relevant from weather data |
| Vulnerability zones | ❌ | No ash plume or lava flow modeling |
| Safety guidance | ✅ | Generic via `/api/evacuate` |

---

## 7. Summary: Overall Coverage Score

| Category | Coverage |
|:---|---:|
| **Total weather event categories listed** | **16** |
| ✅ Fully supported (incident type + detection + guidance) | 5 (31%) |
| ⚠️ Partially supported (risk signal or some pipeline) | 4 (25%) |
| ❌ Not supported at all | 7 (44%) |

### What Aegis Does Well
- **Multi-source live data aggregation** (GDACS + USGS + Tomorrow.io + XWeather) with deduplication
- **End-to-end pipeline** for its supported types: live feed → AI risk analysis → evacuation routing → shelter recommendation → prevention audit
- **Graceful degradation** at every layer (TomTom → OSRM, OpenAI → hardcoded fallbacks)
- **Active defense visualization** — a genuinely novel feature for mitigation planning

### What's Missing
1. **Heatwaves** — the #1 climate killer globally, completely absent
2. **Thunderstorms / Derechos** — the most common severe weather, invisible to Aegis
3. **Ice Storms** — critical infrastructure damage (power grids, transportation)
4. **Landslides** — OSM data already available, just needs the analysis logic
5. **Atmospheric Rivers** — West Coast US is heavily affected, distinct from general flooding
6. **Storm surge** — TC coverage is strong on wind but silent on coastal inundation
7. **Air quality** — wildfire smoke tracking would dramatically increase practical value

---

## 8. Gap Priorities for Development

### Tier 1 (High Impact, Low Effort)
| Gap | Effort | Why |
|:---|---:|:---|
| **Tropical Cyclone → separate from Tornado** | ~30 min | Semantic fix. GDACS `TC` should map to its own `Tropical Cyclone` type with different safety guidance |
| **Heatwave risk signal** | ~1 hr | Add 1 new `deriveRisks()` rule using existing Open-Meteo temp data |
| **Drought UI type** | ~1 hr | Already detected as risk signal; just needs a UI button + routing stub |

### Tier 2 (Medium Impact, Medium Effort)
| Gap | Effort | Why |
|:---|---:|:---|
| **Thunderstorm/Derecho detection** | ~2 hr | Needs new Open-Meteo query parameters (convective available potential energy, wind gusts) + `deriveRisks()` rules |
| **Landslide vulnerability zones** | ~3 hr | Enhance the OSM → OpenAI pipeline with slope analysis. Data already flows |
| **Coldwave UI type** | ~1.5 hr | Risk signal exists; needs incident type + winter-specific routing guidance |

### Tier 3 (High Impact, High Effort)
| Gap | Effort | Why |
|:---|---:|:---|
| **Ice Storm detection** | ~4 hr | Needs multi-level temperature profile data from Open-Meteo or a separate freezing-rain source |
| **Storm surge modeling** | ~8+ hr | Requires coastal DEM data + hurricane track forecasting — significant new pipeline |
| **Air quality / smoke tracking** | ~4 hr | New API integration (e.g., OpenAQ, PurpleAir) + new map layer + health guidance |
