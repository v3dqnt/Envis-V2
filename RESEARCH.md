# Hazard prediction & evacuation capacity — formulas, data sources, and worked numbers

Research reference for extending Envis. Covers (1) flood prediction, (2) formulas and data
sources for every hazard, (3) evacuation road-capacity mathematics with worked numbers.

Each method below is labelled with whether it is **[implemented]**, **[gap]** (nothing in the
codebase covers it), or **[partial]**. Cross-reference `detailed.md` for what already ships.

---

## Part 1 — Flood prediction

Flooding is the one hazard where Envis currently has *no* forecast model. `/api/forecast-risk`
covers **flash** flooding (Antecedent Precipitation Index + soil saturation + rainfall
intensity) but riverine flooding is only handled climatologically in `/api/weather-risk` and as
static OSM water polygons in `/api/hazard-zones`. These are the four layers a real flood
forecast needs.

### 1.1 Rainfall → runoff

**SCS Curve Number (NRCS)** — the standard event-based rainfall–runoff transform. **[gap]**

```
Q = (P − Ia)² / (P − Ia + S)     for P > Ia, else Q = 0
S = 25400/CN − 254               (mm)
Ia = λS,  λ = 0.2 conventionally (0.05 in newer literature)
```

`Q` = runoff depth (mm), `P` = rainfall depth (mm), `S` = maximum potential retention,
`CN` = curve number (30–98) from land cover × hydrologic soil group (A–D). Higher CN = more
runoff. Urban/impervious ≈ 90–98; forest on sandy soil ≈ 30–45.

CN is directly derivable from data Envis already pulls: **hydrologic soil group** maps from
ISRIC SoilGrids sand/clay fractions (already used by the landslide model via `/api/soil`), and
**land cover** from the OSM `landuse`/`natural` tags `/api/hazard-zones` already queries. That
makes CN the cheapest real upgrade available here.

Caveat worth knowing: the CN method's predictive accuracy is widely questioned — recent work
found power-regression alternatives outperform conventional SCS-CN at all study sites. Treat
it as a screening tool, not truth.

**Rational method** — peak discharge for small catchments (< ~50 km²): **[gap]**

```
Qp = C · i · A / 3.6        (m³/s, with i in mm/h, A in km²)
```

`C` = runoff coefficient (0.1 forest → 0.95 asphalt). Only valid when storm duration ≥ time of
concentration.

**Time of concentration (Kirpich)** — how fast the catchment responds:

```
tc = 0.0195 · L^0.77 · S^(−0.385)     (minutes; L in m, S = channel slope m/m)
```

Slope is already computable from the Copernicus DEM via `/api/terrain`.

### 1.2 River discharge — the highest-value upgrade

**Open-Meteo Flood API** — `https://flood-api.open-meteo.com/v1/flood` **[gap, directly implementable]**

This is the single most valuable finding for Envis: it serves **GloFAS v4** river discharge,
**needs no API key**, and comes from the provider the app already depends on for every weather
call. It returns `river_discharge` (daily, m³/s) for the largest river within a 5 km cell, with
seamless coverage from **1984 through ~7 months of forecast**, plus ensemble members for
probabilistic guidance up to 30 days.

GloFAS itself couples ECMWF ERA5 with the LISFLOOD hydrological and channel-routing model, and
CEMS publishes flood thresholds at **2-, 5- and 20-year return periods** per river cell derived
from the long-term reanalysis.

Because the API exposes the full 1984→present reanalysis, **return periods can be computed
locally** rather than fetched — and the codebase already has the statistical machinery for it.
`meanStd()` and `zScore()` in `src/lib/meteorology.ts` are exactly what an annual-maxima fit
needs. The standard approach is a Gumbel (EV1) fit to annual maximum discharge:

```
Annual maxima series:  Qmax[y] for y = 1984…present
Gumbel:  β = σ√6/π ,  μ = x̄ − 0.5772·β
Return level:  Q(T) = μ − β·ln(−ln(1 − 1/T))
Exceedance flag:  Q_forecast > Q(T) for T = 2, 5, 20, 100
```

This gives a genuine, defensible "1-in-20-year flood forecast for this river" — a categorically
stronger statement than the current "recent rainfall is above the historical average."

### 1.3 Inundation extent and depth

**HAND — Height Above Nearest Drainage** (Rennó et al. 2008; Nobre et al. 2011, 2016) **[gap]**

HAND is the normalised terrain descriptor for rapid inundation mapping: for each cell it is the
elevation difference between that cell and the point in the river network it drains into.

```
HAND(cell) = elevation(cell) − elevation(nearest connected stream cell)
Inundated  ⟺ HAND(cell) ≤ h        (h = water level above channel)
```

It is a low-complexity, terrain-based approach requiring only a DEM plus streamflow — and NOAA's
National Water Model uses HAND operationally for flood mapping. Envis already has the DEM half
via `/api/terrain` (Copernicus GLO-30) and the stream half via OSM `waterway` lines, so HAND is
mostly a matter of flow accumulation over data already in hand.

**Manning's equation** — converts discharge to depth/velocity for the channel: **[gap]**

```
v = (1/n) · R^(2/3) · S^(1/2)          R = A/P (hydraulic radius)
Q = v · A
```

`n` = Manning roughness (0.03 natural channel, 0.013 concrete, 0.10 heavy floodplain
vegetation). This is what converts a GloFAS m³/s into "how deep will it be here" — the number
that actually decides whether a road is passable (see Part 3).

### 1.4 Depth–velocity hazard to people

Worth pairing with any inundation output, and directly relevant to the Valencia case where
people died in cars and garages:

```
Hazard  HR = d · (v + 0.5)          (d = depth m, v = velocity m/s)
HR < 0.75 : caution        0.75–1.25 : dangerous for some
1.25–2.5  : dangerous for most       > 2.5 : dangerous for all
```

Vehicles float in roughly **0.3 m of moving water** and are swept at ~0.5 m — which is why
"turn around, don't drown" is the standard message and why routing must treat flooded road
segments as *removed*, not merely slowed.

### 1.5 Flood data sources

| Source | Data | Key | Note |
|---|---|---|---|
| **Open-Meteo Flood API** | GloFAS v4 `river_discharge`, 1984→+7 months, ensembles | none | Same provider Envis already uses |
| CEMS / GloFAS (Copernicus) | Discharge + 2/5/20-yr thresholds, gridded netCDF | CDS API key | Authoritative source; heavier integration |
| Copernicus EMS Rapid Mapping | Post-event satellite flood extent | none | Validation, not forecast |
| ISRIC SoilGrids | Sand/clay → hydrologic soil group → CN | none | **Already integrated** (`/api/soil`) |
| Copernicus DEM GLO-30 | 30 m DEM → HAND, slope, Manning geometry | free key | **Already integrated** (`/api/terrain`) |
| OSM `waterway`/`natural=water` | Stream network, channel geometry | none | **Already integrated** (`/api/hazard-zones`) |

---

## Part 2 — Formulas and data sources for every hazard

### 2.1 Already implemented

These ship today; see `detailed.md` §2 for full derivations. Listed so the gaps below are legible
in context.

| Hazard | Method | Core inputs |
|---|---|---|
| Thunderstorm | CAPE / Lifted Index / CIN + 925–500 hPa bulk shear | Open-Meteo hourly |
| Flash flood | Antecedent Precipitation Index + soil saturation + intensity | Open-Meteo + soil moisture |
| Landslide | Caine (1980) rainfall I–D threshold + infinite-slope factor of safety | DEM, SoilGrids, rainfall |
| Blizzard | NWS three-part criteria (wind ≥ 56 km/h, vis < 400 m, snow, ≥ 3 h) | Open-Meteo hourly |
| Extreme cold | JAG/TI wind chill + Environment Canada frostbite table | Temp, wind |
| Ice storm | Freezing-rain thermal profile + accretion | Surface & 850 hPa temp |
| Tropical cyclone | MSL pressure minimum + Saffir–Simpson | Pressure, wind |
| Fire weather | Vapour pressure deficit + RH + gusts + Sentinel-2 NDMI | Open-Meteo, Copernicus |
| Drought | SPI standardized anomaly + FAO ET₀ water balance | Archive + ET₀ |

### 2.2 Heatwave — Excess Heat Factor **[gap: currently climatological only]**

Envis flags heatwaves only from a 30-day-vs-10-year temperature anomaly. The operational
standard is the **Excess Heat Factor** (Nairn & Fawcett), used by the Australian BoM and
validated as a global heatwave health-impact index:

```
EHIsig  = DMT₃day − DMT95            (significance: vs 95th percentile of 1981–2010 climatology)
EHIaccl = DMT₃day − DMT₃₀day         (acclimatisation: vs the previous 30 days)
EHF     = EHIsig · max(1, EHIaccl)
Severity = EHF / EHF85               (dimensionless, location-independent)
```

A heatwave occurs when **EHF ≥ 1.0 for at least three consecutive days**. The acclimatisation
term is the important part: it captures that 35 °C after a cool fortnight kills more people than
35 °C in an already-hot month — a distinction a plain anomaly cannot make. Severity being
dimensionless is what lets one threshold work worldwide, which matches how Envis already
handles seasonal anomalies via `zScore()`.

Every input is available from Open-Meteo's existing archive + forecast calls. This is the
second-cheapest real upgrade after river discharge.

Companion thermal-stress indices: **Heat Index** (Rothfusz regression, US NWS), **WBGT**
(occupational exposure, ISO 7243), **UTCI** (full human energy-balance model; Open-Meteo already
serves it directly).

### 2.3 Tornado — Significant Tornado Parameter **[gap: declared unpredictable]**

`detailed.md` §5 lists tornado as unpredictable because it is sub-grid-scale. That is true for
*pinpointing* a tornado, but the SPC operationally forecasts **environments favourable** to
them, which is a legitimate and useful product:

```
STP = (MLCAPE/1500) · ((2000 − MLLCL)/1000) · (ESRH/150) · (EBWD/20) · ((200 + MLCIN)/150)
```

Values **> 1** indicate increased potential for significant (EF2+) tornadoes; most non-tornadic
supercells score < 1.

Envis already has MLCAPE and MLCIN from Open-Meteo, and already computes bulk shear (EBWD's
analogue) in `forecast-risk/route.ts`. Missing are **ESRH** (storm-relative helicity) and
**LCL height** — the latter approximable from Espy's equation, `LCL ≈ 125·(T − Td)` metres.
So a partial STP is within reach of the existing data pipeline.

Related: **Supercell Composite Parameter (SCP)** = normalised product of CAPE, SRH, and BRN
shear.

### 2.4 Wildfire spread — Rothermel **[partial: ignition risk yes, spread no]**

Envis predicts fire *weather* (VPD-led) but not fire *behaviour*. Rothermel (1972) is the model
behind BEHAVE, FARSITE and WRF-Fire:

```
R = (I_R · ξ) / (ρ_b · ε · Q_ig) · (1 + Φ_w + Φ_s)
```

`R` = rate of spread; `I_R` = reaction intensity; `ξ` = propagating flux ratio; `ρ_b` = bulk
density; `ε` = effective heating number; `Q_ig` = heat of pre-ignition; `Φ_w`, `Φ_s` = wind and
slope factors. Equivalently `R = R₀(1 + Φ_w + Φ_s)` where `R₀` is the no-wind, no-slope rate.

The wind and slope factors are what turn a Lahaina-type event catastrophic — and Envis already
has both inputs (Open-Meteo gusts, Copernicus DEM slope). Albini's 13 standard fuel models map
reasonably onto OSM `landuse=forest` / `natural=scrub` classes already being queried.

Operationally this converts "high fire danger here" into "the fire reaches this neighbourhood in
N minutes" — which is what an evacuation decision actually needs.

### 2.5 Earthquake — impact, not prediction **[gap]**

Earthquakes remain genuinely unpredictable and `detailed.md` is right to say so. But *post-event
impact* is very much modellable and is what drives response. Ground Motion Prediction Equations
(GMPEs, a.k.a. attenuation relationships) estimate PGA from magnitude, distance, faulting style
and site conditions; a Ground Motion to Intensity Conversion Equation (GMICE — e.g. Wald et al.
for California) then converts PGA/PGV to Modified Mercalli Intensity, which is what maps to
damage and casualties. This is the ShakeMap pipeline.

Since Envis already ingests USGS events (magnitude, depth, coordinates), a GMPE + GMICE layer
would turn a magnitude dot on the map into a shaking-intensity footprint — directly feeding the
evacuation routing in Part 3.

**Note on uncertainty:** conversion uncertainty between ground motion and intensity is large
enough to significantly affect earthquake early-warning alert regions, so any MMI output should
carry an explicit uncertainty band rather than a single number.

### 2.6 Storm surge **[gap]**

The operational standard is NOAA's **SLOSH** (Sea, Lake and Overland Surges from Hurricanes),
which solves the shallow-water equations (Navier–Stokes on a rotating fluid with a free surface,
plus continuity) driven by wind stress and a pressure-gradient body force, parameterised by
storm location, central pressure, size and forward speed, over bathymetry-resolving basin grids.

Simple empirical central-pressure→surge relations exist but are explicitly noted in the
literature as heavily constrained by their over-simplified functional form — worth stating
plainly rather than shipping a one-liner regression and implying precision. For a platform like
Envis the realistic path is consuming SLOSH/MOM outputs (NHC publishes surge inundation
products) rather than reimplementing the physics.

### 2.7 Data source summary

| Source | Provides | Key | Status |
|---|---|---|---|
| Open-Meteo Forecast/Archive | All NWP variables, UTCI, ET₀ | none | integrated |
| **Open-Meteo Flood** | **GloFAS river discharge** | **none** | **gap** |
| Copernicus DEM GLO-30 | 30 m elevation → slope, HAND | free | integrated |
| ISRIC SoilGrids | Texture → CN, shear strength | none | integrated |
| Sentinel-2 (Copernicus) | NDVI/NDMI fuel moisture | free | integrated |
| NASA FIRMS | VIIRS active fire hotspots | free | integrated |
| GDACS / USGS | Live multi-hazard + seismic | none | integrated |
| OpenAQ | Ground PM2.5/PM10 | free | integrated |
| SPC mesoanalysis | STP/SCP severe-weather composites | none | gap |
| NHC / SLOSH | Storm-surge inundation | none | gap |
| USGS ShakeMap | PGA/PGV/MMI footprints | none | gap |

---

## Part 3 — Evacuation capacity: road width, throughput, and rerouting

This section answers the specific question: given a road, **how many people actually get out,
how fast, and how many must be sent elsewhere.** Nothing in the current codebase models capacity
at all — `/api/evacuate` and `/api/evacuation-points` compute routes and shelters but never ask
whether a road can carry the people assigned to it. Every number below is arithmetic you can
re-run; the assumptions are stated so they can be argued with.

### 3.1 From road width to usable lanes

OSM tags the carriageway width kerb-to-kerb (metres) in `width`, and lane count in `lanes`. Where
lanes aren't tagged, the OSM convention is `lane width = width / lanes`, so the inverse gives a
usable-lane estimate.

| Road class | Typical lane width | Notes |
|---|---|---|
| Motorway / trunk | 3.50 – 3.75 m | Plus hard shoulder (usable in contraflow) |
| Primary / secondary | 3.00 – 3.50 m | |
| Residential | 2.75 – 3.00 m | Often reduced by parked cars |
| Absolute minimum | ~2.50 m | Passenger car ≈ 1.8 m + clearance |

```
usable_lanes = floor(carriageway_width / lane_width)
```

**The parking correction matters.** A 6 m residential street tagged as 2 lanes carries *one*
usable lane once both kerbs are parked (2 × ~2.0 m lost). This is precisely the "single-lane
bottleneck" failure mode from Lahaina, and it is invisible unless width is modelled rather than
lane count alone.

### 3.2 Lane capacity

The Highway Capacity Manual gives **2,000 passenger cars/hour/lane** for multilane highways, with
signalised saturation flow rates of **1,500–2,000 veh/h/lane** and **1,900 vphpl** as the common
default.

Evacuation conditions degrade this — unfamiliar drivers, overloaded vehicles, no shoulder
recovery, towing. Use the right-hand column operationally:

| Facility | HCM base | Evacuation-realistic |
|---|---|---|
| Motorway / freeway | 2,200 – 2,400 pc/h/ln | **1,800 – 2,000** |
| Multilane divided | 1,900 – 2,100 | **1,600 – 1,800** |
| Urban arterial (signalised, g/C ≈ 0.45) | 1,900 × 0.45 ≈ 855 | **800 – 900** |
| Two-lane rural (both directions) | 1,700 total | **1,400 total** |
| Residential street | 600 – 900 | **500 – 700** |

**Why not just use Greenshields.** The linear speed–density model is the standard closed form:

```
v = v_f(1 − k/k_j)        q = k·v        q_max = v_f·k_j/4   at   k_c = k_j/2, v_c = v_f/2
```

It works for arterials — `v_f` = 60 km/h, `k_j` = 110 veh/km/ln gives `q_max` = **1,650
veh/h/ln**, right in the empirical band. It fails for motorways: the same formula gives **3,025
veh/h/ln**, ~40% too high, because real motorway critical density is ~27 veh/km/ln, not
`k_j/2` = 55. (A Dutch motorway reference set is `u₀` = 110 km/h, `k_c` = 27, `k_j` = 110
veh/km/ln — giving ~27 × 80 ≈ **2,160 veh/h/ln**, which matches HCM.)

**Use Greenshields for intuition and degradation curves; use the empirical table for capacity.**

### 3.3 People per hour — the headline number

```
people/hour/lane = capacity(veh/h/ln) × occupancy(persons/veh)
```

Evacuation vehicle occupancy runs **2.0 – 2.5 persons/vehicle** (hurricane studies; households
frequently take multiple vehicles, which *lowers* occupancy and *raises* vehicle count — the
pessimistic direction). Taking 2.2:

```
1,800 veh/h/ln × 2.2 = 3,960 ≈ 4,000 people/hour/lane
```

**Per metre of width, walking beats driving by ~4×.** Fruin's walkway capacity is ~1.3
persons/s/m (LOS E). Key Fruin flow breakpoints are 2, 4, 6 and 10 ped/min/ft — that is 7, 13, 20
and 33 ped/min/m — at 12.08, 6.04, 3.72 and 2.23 m²/pedestrian respectively.

| Mode | Throughput per metre of width |
|---|---|
| Car lane (3.5 m, 1,800 veh/h, 2.2 occ) | **1,131 people/h/m** |
| Pedestrians at Fruin capacity | **4,680 people/h/m** |

This is the most operationally significant result in this document. In a dense settlement with a
short escape distance, **telling people to walk moves ~4× more of them per metre of street than
telling them to drive** — and it removes the failure mode where a stalled car blocks everyone
behind it.

### 3.4 Clearance time

```
T_clear = T_mobilisation + N_vehicles / C_outbound + T_travel

N_vehicles = Population × participation_rate / occupancy
T_travel   = route_length / effective_speed
```

Demand does not arrive instantly. Evacuees load onto the network along a **sigmoid (S-curve)
behavioural response**, and studies report **50% and 90% clearance times** off the cumulative
curve rather than a single figure. Participation is itself a function of perceived threat, and
is modelled with time-dependent sequential logit models.

For a life-safety threshold, the number that matters is **90% clearance vs. time-to-impact**.

### 3.5 Worked example — Lahaina, 2023

Assumptions stated so they can be challenged: population 12,700; 100% participation (mandatory
fire evacuation); 2.2 persons/vehicle; 1,800 veh/h/lane; roughly **1 hour** between fire entering
the town and it crossing the built-up area under 100+ km/h winds.

```
Vehicles to move = 12,700 / 2.2 = 5,773
```

| Outbound configuration | Capacity | Loading time | Stranded at 1 h |
|---|---|---|---|
| **1 lane** (what effectively existed) | 1,800 veh/h | **3.21 h** | 3,973 veh ≈ **8,740 people** |
| 2 lanes (contraflow) | 3,600 veh/h | 1.60 h | 2,173 veh ≈ 4,780 people |
| 4 lanes | 7,200 veh/h | 0.80 h | **0** |

The single-lane case is a **3.2× capacity deficit** — the town physically could not drive out in
the time available, regardless of how early the warning arrived. Contraflow halves the shortfall
but does not close it. **Only 4 outbound lanes clear the town in under an hour by car.**

Now the same population on foot, using ~8 m of usable street width:

```
8.0 m × 1.3 p/s/m = 10.4 p/s = 37,440 people/h
Flow-limited clearance:  12,700 / 37,440 = 20 minutes
Travel time, 2 km at 1.2 m/s:              28 minutes
→ pedestrian clearance ≈ 30 min, travel-time dominated
```

**~30 minutes on foot versus 3.2 hours by car.** With ~1 hour of warning, walking survives and
driving does not. This is consistent with what actually happened: people who abandoned vehicles
and reached the water survived, while cars queued on the escape route did not clear.

The caveat is real — 37,440 people/h is a free-flow ceiling that assumes no obstruction, no
smoke, no injured or mobility-limited evacuees, and it ignores that the shoreline is not a safe
destination in every scenario. But the *ratio* is robust, and the ratio is the decision.

### 3.6 How many need rerouting

Per outbound route `i`, with `T_avail` = time until impact:

```
Supply_i   = C_i × T_avail                        (vehicles that route can clear in time)
Overflow_i = max(0, Demand_i − Supply_i)
```

Total overflow is then reassigned to routes with residual capacity, in ascending order of detour
cost:

```
Residual_j = max(0, Supply_j − Demand_j)
Assign overflow to j while Residual_j > 0
Unassignable = Overflow_total − Σ Residual_j     → shelter-in-place / vertical evacuation
```

The `Unassignable` term is the one that matters and the one no current routing feature surfaces:
**it is the number of people for whom no road solution exists**, who need vertical evacuation or
a designated refuge instead of a route. In the Lahaina 1-lane case that is ~8,740 people even
with a perfect warning.

Congestion feedback should use the standard **BPR volume-delay function** rather than assuming
free-flow speed holds as demand approaches capacity:

```
t = t₀ · (1 + α(V/C)^β)         α ≈ 0.15, β ≈ 4 (conventional)
```

At `V/C` = 1.0 travel time is 1.15× free-flow; at `V/C` = 1.5 it is ~1.9×. Evacuation routing
that ignores this systematically under-predicts clearance time — which is the dangerous
direction to be wrong in.

### 3.7 What this implies for Envis

`/api/evacuate` currently returns a route without ever asking whether it can carry the load. The
additions that would change decisions, in order of value:

1. **Capacity per route** — from OSM `lanes`/`width` + the §3.2 table. Turns "here is a route"
   into "here is a route that clears 4,000 people/hour."
2. **Clearance time vs. time-to-impact** — §3.4 against the hazard's `leadTimeHours`, which
   `forecast-risk` already produces. This is the number that decides whether to evacuate at all.
3. **Overflow and the unassignable count** — §3.6. Surfaces who cannot be routed and needs
   shelter-in-place, rather than silently routing everyone onto a road that cannot take them.
4. **Pedestrian mode** — §3.3. Roughly 4× the throughput per metre; the right answer for dense
   settlements with short escape distances.
5. **Flood-aware edge removal** — §1.4. Vehicles float in ~0.3 m of moving water, so flooded
   segments must be *removed* from the graph, not slowed.

---

## Sources

Flooding and hydrology:
- [Revised Curve Number rainfall–runoff methodology](https://www.mdpi.com/2073-4441/15/3/491) · [Calibration procedures for Rational and USSCS design flood methods](https://ascelibrary.org/doi/10.1061/(ASCE)0733-9429(1995)121:1(61)) · [Integrated hydrological modeling: SCS-CN, HEC-HMS/RAS](https://www.mdpi.com/2073-4441/16/2/356)
- [NWM–HAND flood mapping evaluation (NHESS)](https://nhess.copernicus.org/articles/19/2405/2019/) · [Terrain analysis enhancements to HAND (Water Resources Research)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2019wr024837) · [InundatEd-v1.0 HAND-based flood risk system (GMD)](https://gmd.copernicus.org/articles/14/3295/2021/)
- [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api) · [GloFAS-ERA5 operational reanalysis (ESSD)](https://essd.copernicus.org/articles/12/2043/2020/) · [GloFAS ensemble reforecasts (HESS)](https://hess.copernicus.org/articles/27/1/2023/) · [GloFAS via Copernicus EMS (UN-SPIDER)](https://un-spider.org/links-and-resources/data-sources/global-flood-awareness-system-glofas-copernicus-ems)

Heat, severe convection, fire:
- [The Excess Heat Factor: a metric for heatwave intensity](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4306859/) · [EHF severity as a global heatwave health impact index](https://www.mdpi.com/1660-4601/15/11/2494)
- [An update to the Supercell Composite and Significant Tornado parameters (SPC)](https://www.spc.noaa.gov/publications/thompson/stp_scp.pdf) · [SPC severe weather parameter definitions](https://www.spc.noaa.gov/exper/mesoanalysis/help/sfcoa.html)
- [The Rothermel fire-spread model: still running like a champ](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1001&context=jfspdigest) · [Comparative analysis of Rothermel-based wildfire simulation tools](https://www.sciencedirect.com/science/article/pii/S2212420925002559)

Earthquake and surge:
- [Uncertainty in ground-motion-to-intensity conversions (The Seismic Record)](https://pubs.geoscienceworld.org/ssa/tsr/article/4/2/121/644138/Uncertainty-in-Ground-Motion-to-Intensity) · [Ground motion, source parameters and attenuation (JGR Solid Earth)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2018JB015504)
- [NOAA SLOSH model](https://vlab.noaa.gov/web/mdl/slosh) · [Predicting the storm surge threat of Hurricane Sandy with SLOSH](https://www.mdpi.com/2077-1312/2/2/437) · [Global storm surge forecast and inundation modelling (JRC)](https://publications.jrc.ec.europa.eu/repository/bitstream/JRC68133/lbna25233enn_v1.pdf)

Traffic, evacuation and pedestrian capacity:
- [FHWA simplified highway capacity calculation](https://www.fhwa.dot.gov/policyinformation/pubs/pl18003/chap02.cfm) · [Traffic level of service calculation methods (HCM appendix)](https://ccag.ca.gov/wp-content/uploads/2014/07/cmp_2005_Appendix_B.pdf) · [Fundamental diagrams (TU Delft)](https://ocw.tudelft.nl/wp-content/uploads/Chapter-4.-Fundamental-diagrams.pdf) · [Traffic flow fundamentals](https://eng.libretexts.org/Bookshelves/Civil_Engineering/Fundamentals_of_Transportation/05%3A_Traffic/5.02%3A_Traffic_Flow)
- [Simulation-assisted optimization for large-scale evacuation planning](https://arxiv.org/pdf/2209.01535) · [Effects of data resolution and human behavior on evacuation simulations](https://arxiv.org/pdf/1501.03044) · [Reconstruction of Florida traffic flow during Hurricane Irma](https://arxiv.org/pdf/1807.11177) · [Evacuation behavior and mobility impacts in coastal areas (USDOT)](https://rosap.ntl.bts.gov/view/dot/73820/dot_73820_DS1.pdf)
- [Capacity of walkways (TRB)](https://onlinepubs.trb.org/Onlinepubs/trr/1975/538/538-001.pdf) · [Designing for pedestrians: a level-of-service concept (Fruin)](https://onlinepubs.trb.org/Onlinepubs/hrr/1971/355/355-001.pdf) · [Pedestrian level of service study (NYC DCP)](https://www.nyc.gov/assets/planning/download/pdf/plans/transportation/td_pedloschaptertwo.pdf)
- [OSM Key:lanes](https://wiki.openstreetmap.org/wiki/Key:lanes) · [OSM Key:width](https://wiki.openstreetmap.org/wiki/Key:width)
