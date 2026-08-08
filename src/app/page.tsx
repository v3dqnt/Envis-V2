"use client";

import React, { useState, useEffect, useCallback } from "react";
import MapDashboard from "@/components/MapDashboard";
import RoutingSidebar from "@/components/RoutingSidebar";
import PreventionSidebar from "@/components/PreventionSidebar";
import AutoJobsSidebar from "@/components/AutoJobsSidebar";
import type { Suggestion } from "@/components/NotificationPanel";
import type { EarthquakeEvent } from "@/app/api/live-feed/route";
import { Navigation, ShieldAlert, Radar, Loader2 } from "lucide-react";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Badge } from "@astryxdesign/core/Badge";

type WorkspaceTab = "prevention" | "routing" | "autojobs";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [hazardCenter, setHazardCenter] = useState<[number, number] | null>(null);
  const [hazardRadius, setHazardRadius] = useState<number>(1000); // meters
  const [startCoords, setStartCoords] = useState<[number, number] | null>(null);
  const [endCoords, setEndCoords] = useState<[number, number] | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [bypassRouteGeoJSON, setBypassRouteGeoJSON] = useState<any>(null);
  const [isPlacingHazard, setIsPlacingHazard] = useState<boolean>(false);
  const [mapFlyToCoords, setMapFlyToCoords] = useState<[number, number] | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [evacuationPoints, setEvacuationPoints] = useState<any>(null);

  // Which workspace tab is showing. Only one panel is visible at a time, but
  // all three stay mounted (see the render below) so switching tabs never
  // discards an in-progress analysis.
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("prevention");

  // When set, RoutingSidebar auto-picks the nearest shelter and generates the
  // evacuation route as soon as it mounts — set by "Route to Safety" in Aegis Prevent.
  const [pendingAutoRoute, setPendingAutoRoute] = useState<boolean>(false);

  const handleSendToEvacuation = (hazardType: string, center: [number, number], radiusMeters: number) => {
    setIncidentType(hazardType);
    setHazardCenter(center);
    setHazardRadius(Math.round(radiusMeters));
    setMapFlyToCoords(center);
    setPendingAutoRoute(true);
    setActiveTab("routing");
  };
  // Mitigation active defenses state
  const [activeDefenses, setActiveDefenses] = useState<string[]>([]);

  // Geocoding & Density states lifted to page root
  const [cityName, setCityName] = useState<string>("");
  const [densityPerKm2, setDensityPerKm2] = useState<number | null>(null);
  const [densityLoading, setDensityLoading] = useState<boolean>(false);

  // GDACS live events feed state (used by sidebars)
  const [gdacsEvents, setGdacsEvents] = useState<any[]>([]);
  const [gdacsLoading, setGdacsLoading] = useState<boolean>(false);

  // Structured live feed state (used by right panel)
  const [liveCyclones, setLiveCyclones] = useState<any[]>([]);
  const [liveEarthquakes, setLiveEarthquakes] = useState<any[]>([]);
  const [liveFeedLoading, setLiveFeedLoading] = useState<boolean>(false);

  // Earthquake/tornado impact analysis — computed in RoutingSidebar's
  // ImpactPanel, rendered on the map here since MapDashboard is a sibling,
  // not a child, of that panel.
  const [selectedEarthquake, setSelectedEarthquake] = useState<EarthquakeEvent | null>(null);
  const [earthquakeBands, setEarthquakeBands] = useState<any>(null);
  const [tornado, setTornado] = useState<any>(null);

  // Vulnerability zones state (for map highlighting) — aggregated across all
  // analyzed + toggled-visible hazards in Aegis Prevent's multi-hazard view
  const [vulnerabilityZones, setVulnerabilityZones] = useState<any>(null);
  const [hazardPolygons, setHazardPolygons] = useState<any>(null);
  const [hazardOrigins, setHazardOrigins] = useState<any>(null);
  const [hazardPaths, setHazardPaths] = useState<any>(null);

  // Lifted disaster type state to keep all sidebars and right panel in sync
  const [incidentType, setIncidentType] = useState<string>("Wildfire");

  // Temperature Heatmap state
  const [showTemperatureHeatmap, setShowTemperatureHeatmap] = useState<boolean>(false);
  const [temperatureGridData, setTemperatureGridData] = useState<any>(null);
  const [temperatureHeatmapLoading, setTemperatureHeatmapLoading] = useState<boolean>(false);

  // Auto Jobs suggestions. Lifted here rather than kept inside the panel that
  // renders them, because the tab strip needs the pending count for its badge —
  // an alert waiting for review has to be visible from the other tabs too, now
  // that notifications no longer have a column of their own.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsAvailable, setSuggestionsAvailable] = useState<boolean>(true);

  const refreshSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/target-areas/suggestions?status=pending");
      if (res.status === 503) {
        setSuggestionsAvailable(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setSuggestionsAvailable(true);
      }
    } catch (err) {
      console.error("Failed to load target-area suggestions:", err);
    }
  }, []);

  useEffect(() => {
    refreshSuggestions();
    const interval = setInterval(refreshSuggestions, 60_000);
    return () => clearInterval(interval);
  }, [refreshSuggestions]);

  // Fetch active real-world disasters on mount
  useEffect(() => {
    const fetchGdacs = async () => {
      setGdacsLoading(true);
      try {
        const res = await fetch("/api/gdacs");
        if (res.ok) {
          const data = await res.json();
          setGdacsEvents(data.events || []);
        }
      } catch (err) {
        console.error("Failed to load GDACS feed:", err);
      } finally {
        setGdacsLoading(false);
      }
    };
    fetchGdacs();
  }, []);

  // Fetch aggregated live feed (cyclones + earthquakes from all sources)
  useEffect(() => {
    const fetchLiveFeed = async () => {
      setLiveFeedLoading(true);
      try {
        const res = await fetch("/api/live-feed");
        if (res.ok) {
          const data = await res.json();
          setLiveCyclones(data.cyclones || []);
          setLiveEarthquakes(data.earthquakes || []);
        }
      } catch (err) {
        console.error("Failed to load live feed:", err);
      } finally {
        setLiveFeedLoading(false);
      }
    };
    fetchLiveFeed();
  }, []);

  // Fetch 4 AI-suggested real-world evacuation shelters safely outside the dome radius
  useEffect(() => {
    if (!hazardCenter) {
      setEvacuationPoints(null);
      return;
    }

    const timer = setTimeout(() => {
      const fetchAIShelters = async () => {
        try {
          console.log(`[Client] Querying AI-suggested evacuation shelters for epicentre [${hazardCenter[0]}, ${hazardCenter[1]}]...`);
          const res = await fetch("/api/evacuation-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hazardCenter,
              hazardRadius
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.shelters && Array.isArray(data.shelters)) {
              const features = data.shelters.map((sh: any) => ({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: sh.coordinates
                },
                properties: {
                  id: sh.id,
                  name: sh.name,
                  direction: sh.direction,
                  reason: sh.reason
                }
              }));
              
              console.log(`[Client] AI successfully suggested shelters:`, data.shelters);
              
              if (data.allAvailableShelters && Array.isArray(data.allAvailableShelters)) {
                console.log(`[Client] All available safe shelters near the affected area (${data.allAvailableShelters.length} found):`);
                data.allAvailableShelters.forEach((s: any, idx: number) => {
                  console.log(`  ${idx + 1}. ${s.name} (${s.categories.join(", ")}) - ${Math.round(s.distance)}m away at [${s.coordinates.join(", ")}]`);
                });
              }

              setEvacuationPoints({
                type: "FeatureCollection",
                features
              });
              return;
            }
          }
        } catch (err) {
          console.error("Failed to fetch AI evacuation points:", err);
        }

        // Mathematical Fallback in case of API failures
        const [lng, lat] = hazardCenter;
        const distMeters = hazardRadius + 1500;
        const deltaLat = distMeters / 110574;
        const deltaLng = distMeters / (111320 * Math.cos((lat * Math.PI) / 180));

        const sheltersFallback = [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat + deltaLat] },
            properties: { id: "north", name: "Evacuation Center North (High School Fallback)", direction: "North", reason: "Safe zone located outside hazard boundary." }
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat - deltaLat] },
            properties: { id: "south", name: "Evacuation Center South (Sports Complex Fallback)", direction: "South", reason: "Large capacity public facility." }
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng + deltaLng, lat] },
            properties: { id: "east", name: "Evacuation Center East (Community Center Fallback)", direction: "East", reason: "Equipped with power generators." }
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng - deltaLng, lat] },
            properties: { id: "west", name: "Evacuation Center West (Regional Park Fallback)", direction: "West", reason: "Open air zone with water supply." }
          }
        ];

        setEvacuationPoints({
          type: "FeatureCollection",
          features: sheltersFallback
        });
      };

      fetchAIShelters();
    }, 400);

    return () => clearTimeout(timer);
  }, [hazardCenter, hazardRadius]);

  // Fetch city name and population density when hazardCenter is updated
  useEffect(() => {
    if (!hazardCenter) {
      setCityName("");
      setDensityPerKm2(null);
      return;
    }

    const fetchCityAndDensity = async () => {
      setDensityLoading(true);
      console.log(`[Client] Reverse geocoding hazard epicentre coordinates: [${hazardCenter[0].toFixed(5)}, ${hazardCenter[1].toFixed(5)}]`);
      try {
        const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || 'get_your_own_OpIi9ZULNHzrESv6T2vL';
        const res = await fetch(
          `https://api.maptiler.com/geocoding/${hazardCenter[0]},${hazardCenter[1]}.json?key=${mapTilerKey}`
        );
        let resolvedCity = "Local Area";
        if (res.ok) {
          const data = await res.json();
          const cityFeature = data.features.find((f: any) =>
            f.place_type?.includes("municipality") ||
            f.place_type?.includes("place") ||
            f.place_type?.includes("city")
          );
          if (cityFeature) {
            resolvedCity = cityFeature.text;
          } else if (data.features[0]) {
            resolvedCity = data.features[0].text;
          }
        }

        console.log(`[Client] Resolved location coordinates to city: "${resolvedCity}"`);
        setCityName(resolvedCity);

        console.log(`[Client] Querying population density API for city: "${resolvedCity}"...`);
        const densityRes = await fetch(`/api/city-density?city=${encodeURIComponent(resolvedCity)}`);
        if (densityRes.ok) {
          const densityData = await densityRes.json();
          console.log(`[Client] Population density loaded for "${resolvedCity}": ${densityData.densityPerKm2} ppl/km²`);
          setDensityPerKm2(densityData.densityPerKm2);
        } else {
          console.log(`[Client] Failed to load density for "${resolvedCity}". Falling back to 5000 ppl/km²`);
          setDensityPerKm2(5000);
        }
      } catch (err) {
        console.error("Failed to retrieve city population density:", err);
        setDensityPerKm2(5000);
      } finally {
        setDensityLoading(false);
      }
    };

    fetchCityAndDensity();
  }, [hazardCenter]);

  // Fetch temperature grid data when heatmap is active and hazardCenter changes
  useEffect(() => {
    if (!showTemperatureHeatmap) {
      setTemperatureGridData(null);
      return;
    }
    if (!hazardCenter) return;

    setTemperatureHeatmapLoading(true);
    const timer = setTimeout(async () => {
      const [lng, lat] = hazardCenter;
      try {
        // 11x11 over 0.6deg (~6km spacing) — dense enough that neighbouring points blend
        // into a continuous thermal field at city zoom instead of isolated blobs.
        const res = await fetch(`/api/temperature-grid?lat=${lat}&lng=${lng}&grid=11&span=0.6`);
        if (res.ok) {
          const data = await res.json();
          if (data.grid && data.grid.features) {
            console.log(`[Heatmap] Loaded ${data.grid.features.length} temperature points — range ${data.meta.minTemp.toFixed(1)}°C to ${data.meta.maxTemp.toFixed(1)}°C`);
            setTemperatureGridData(data.grid);
          }
        }
      } catch (err) {
        console.error("Failed to load temperature grid:", err);
      } finally {
        setTemperatureHeatmapLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [showTemperatureHeatmap, hazardCenter]);

  if (!mounted) {
    return (
      <main className="h-screen w-full flex items-center justify-center" style={{ background: "var(--color-background-body)" }}>
        <VStack gap={3} hAlign="center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--color-accent)" }} />
          <Text type="supporting" color="inherit" weight="bold" style={{ color: "var(--color-text-primary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Initializing Aegis Command Center...
          </Text>
        </VStack>
      </main>
    );
  }

  return (
    /* Docked two-column shell: tabbed control panel, then the map. The map is
       the only region that flexes; the panel holds a fixed width so its content
       never reflows as the window resizes.

       Below lg the columns stack instead: a fixed-height map on top with the
       control panel scrolling beneath it. Without this the 27rem panel eats a
       narrow window whole and leaves the map a few pixels wide. */
    <main className="flex h-screen w-full flex-col overflow-hidden lg:flex-row" style={{ background: "var(--color-background-body)" }}>
      {/* Left control panel — a fixed tab strip over a scrolling content area.
          Given its own surface colour and a right border so it reads as a
          distinct panel rather than blending into the map. */}
      <aside
        className="order-2 w-full flex-1 min-h-0 flex flex-col overflow-hidden lg:order-1 lg:w-[27rem] lg:flex-none lg:h-full lg:border-r"
        style={{ background: "var(--color-background-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="shrink-0 px-6 pt-5 pb-1">
          <TabList value={activeTab} onChange={(v) => setActiveTab(v as WorkspaceTab)} layout="fill" size="lg">
            <Tab value="prevention" label="Prevention" icon={<ShieldAlert className="w-4 h-4" />} />
            <Tab value="routing" label="Routing" icon={<Navigation className="w-4 h-4" />} />
            <Tab
              value="autojobs"
              label="Auto Jobs"
              icon={<Radar className="w-4 h-4" />}
              endContent={suggestions.length > 0 ? <Badge variant="error" label={String(suggestions.length)} /> : undefined}
            />
          </TabList>
        </div>

        {/* Every panel stays mounted and is hidden with display:none rather than
            unmounted, so switching tabs never throws away an in-progress
            analysis, a computed route, or half-filled form input. Each keeps its
            own scroll container so tabs remember where they were scrolled to. */}
        <div className="flex-1 min-h-0">
          <div className={`h-full overflow-y-auto ${activeTab === "routing" ? "" : "hidden"}`}>
            <RoutingSidebar
              hazardCenter={hazardCenter}
              setHazardCenter={setHazardCenter}
              hazardRadius={hazardRadius}
              setHazardRadius={setHazardRadius}
              startCoords={startCoords}
              setStartCoords={setStartCoords}
              endCoords={endCoords}
              setEndCoords={setEndCoords}
              routeGeoJSON={routeGeoJSON}
              setRouteGeoJSON={setRouteGeoJSON}
              bypassRouteGeoJSON={bypassRouteGeoJSON}
              setBypassRouteGeoJSON={setBypassRouteGeoJSON}
              isPlacingHazard={isPlacingHazard}
              setIsPlacingHazard={setIsPlacingHazard}
              setMapFlyToCoords={setMapFlyToCoords}
              aiRecommendation={aiRecommendation}
              setAiRecommendation={setAiRecommendation}
              aiLoading={aiLoading}
              setAiLoading={setAiLoading}
              evacuationPoints={evacuationPoints}
              cityName={cityName}
              setCityName={setCityName}
              densityPerKm2={densityPerKm2}
              setDensityPerKm2={setDensityPerKm2}
              densityLoading={densityLoading}
              setDensityLoading={setDensityLoading}
              gdacsEvents={gdacsEvents}
              gdacsLoading={gdacsLoading}
              incidentType={incidentType}
              setIncidentType={setIncidentType}
              pendingAutoRoute={pendingAutoRoute}
              clearPendingAutoRoute={() => setPendingAutoRoute(false)}
              cyclones={liveCyclones}
              earthquakes={liveEarthquakes}
              feedLoading={liveFeedLoading}
              selectedEarthquake={selectedEarthquake}
              setSelectedEarthquake={setSelectedEarthquake}
              setEarthquakeBands={setEarthquakeBands}
              setTornado={setTornado}
            />
          </div>

          <div className={`h-full overflow-y-auto ${activeTab === "prevention" ? "" : "hidden"}`}>
            <PreventionSidebar
              hazardCenter={hazardCenter}
              setHazardCenter={setHazardCenter}
              hazardRadius={hazardRadius}
              setMapFlyToCoords={setMapFlyToCoords}
              activeDefenses={activeDefenses}
              setActiveDefenses={setActiveDefenses}
              cityName={cityName}
              densityPerKm2={densityPerKm2}
              gdacsEvents={gdacsEvents}
              gdacsLoading={gdacsLoading}
              incidentType={incidentType}
              setIncidentType={setIncidentType}
              setVulnerabilityZones={setVulnerabilityZones}
              setHazardPolygons={setHazardPolygons}
              setHazardOrigins={setHazardOrigins}
              setHazardPaths={setHazardPaths}
              showTemperatureHeatmap={showTemperatureHeatmap}
              setShowTemperatureHeatmap={setShowTemperatureHeatmap}
              temperatureHeatmapLoading={temperatureHeatmapLoading}
              onSendToEvacuation={handleSendToEvacuation}
            />
          </div>

          <div className={`h-full overflow-y-auto ${activeTab === "autojobs" ? "" : "hidden"}`}>
            <AutoJobsSidebar
              suggestions={suggestions}
              suggestionsAvailable={suggestionsAvailable}
              refreshSuggestions={refreshSuggestions}
              setHazardCenter={setHazardCenter}
              setMapFlyToCoords={setMapFlyToCoords}
              setIncidentType={setIncidentType}
              onReview={() => setActiveTab("prevention")}
            />
          </div>
        </div>
      </aside>

      {/* Map region — the only element that flexes. Relative so MapLibre's
          absolutely-positioned canvas fills exactly this column. */}
      <div className="relative order-1 w-full h-[45vh] shrink-0 lg:order-2 lg:w-auto lg:h-full lg:flex-1 lg:shrink lg:min-w-0">
        <MapDashboard
        hazardCenter={hazardCenter}
        hazardRadius={hazardRadius}
        routeGeoJSON={routeGeoJSON}
        bypassRouteGeoJSON={bypassRouteGeoJSON}
        isPlacingHazard={isPlacingHazard}
        onMapClick={(lng, lat) => {
          if (isPlacingHazard) {
            setHazardCenter([lng, lat]);
            setIsPlacingHazard(false);
          }
        }}
        mapFlyToCoords={mapFlyToCoords}
        clearFlyTo={() => setMapFlyToCoords(null)}
        evacuationPoints={evacuationPoints}
        onSelectDestination={(coords: [number, number]) => setEndCoords(coords)}
        activeDefenses={activeDefenses}
        vulnerabilityZones={vulnerabilityZones}
        hazardPolygons={hazardPolygons}
        hazardOrigins={hazardOrigins}
        hazardPaths={hazardPaths}
        earthquakeBands={earthquakeBands}
        tornado={tornado}
          temperatureGridData={showTemperatureHeatmap ? temperatureGridData : null}
          showTemperatureHeatmap={showTemperatureHeatmap}
        />
      </div>
    </main>
  );
}
