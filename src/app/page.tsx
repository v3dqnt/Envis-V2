"use client";

import React, { useState, useEffect } from "react";
import MapDashboard from "@/components/MapDashboard";
import RoutingSidebar from "@/components/RoutingSidebar";
import PreventionSidebar from "@/components/PreventionSidebar";
import GdacsRightFeed from "@/components/GdacsRightFeed";
import { Navigation, ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TabList, Tab } from "@astryxdesign/core/TabList";

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

  // Top Center Mode State
  const [mode, setMode] = useState<"routing" | "prevention">("routing");
  // When set, RoutingSidebar auto-picks the nearest shelter and generates the
  // evacuation route as soon as it mounts — set by "Route to Safety" in Aegis Prevent.
  const [pendingAutoRoute, setPendingAutoRoute] = useState<boolean>(false);

  const handleSendToEvacuation = (hazardType: string, center: [number, number], radiusMeters: number) => {
    setIncidentType(hazardType);
    setHazardCenter(center);
    setHazardRadius(Math.round(radiusMeters));
    setMapFlyToCoords(center);
    setPendingAutoRoute(true);
    setMode("routing");
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
      <main className="h-screen w-full flex items-center justify-center" style={{ background: "#003049" }}>
        <VStack gap={3} hAlign="center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#c1121f" }} />
          <Text type="supporting" color="inherit" weight="bold" style={{ color: "#fdf0d5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Initializing Aegis Command Center...
          </Text>
        </VStack>
      </main>
    );
  }

  return (
    /* Docked three-column shell: control sidebar, map, live feed. The map is the
       only region that flexes; the panels hold a fixed width so their content
       never reflows as the window resizes. */
    <main className="flex h-screen w-full overflow-hidden" style={{ background: "#001d2e" }}>
      {/* Left control panel — docked, scrolls independently of the map */}
      <aside className="sidebar-panel w-[27rem] shrink-0 h-full overflow-y-auto">
        {mode === "routing" ? (
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
          />
        ) : (
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
        )}
      </aside>

      {/* Map region — the only element that flexes. Relative so MapLibre's
          absolutely-positioned canvas fills exactly this column. */}
      <div className="relative flex-1 h-full min-w-0">
        {/* Mode switcher floats over the map, centred on the map area only */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <Card elevation="high" padding={0.5} style={{ background: "#003049", border: "1px solid #c1121f4D", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
            <TabList value={mode} onChange={(v) => setMode(v as "routing" | "prevention")} layout="hug">
              <Tab value="routing" label="Evacuation Routing" icon={<Navigation className="w-3.5 h-3.5" />} />
              <Tab value="prevention" label="Disaster Prevention" icon={<ShieldAlert className="w-3.5 h-3.5" />} />
            </TabList>
          </Card>
        </div>

        <MapDashboard
        hazardCenter={mode === "routing" ? hazardCenter : null}
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
          temperatureGridData={showTemperatureHeatmap ? temperatureGridData : null}
          showTemperatureHeatmap={showTemperatureHeatmap}
        />
      </div>

      {/* Right live-feed panel — docked, only in Aegis Prevent */}
      {mode === "prevention" && (
        <aside className="sidebar-panel-right w-[24rem] shrink-0 h-full overflow-y-auto">
          <GdacsRightFeed
            cyclones={liveCyclones}
            earthquakes={liveEarthquakes}
            feedLoading={liveFeedLoading}
            setHazardCenter={setHazardCenter}
            setMapFlyToCoords={setMapFlyToCoords}
            setIncidentType={setIncidentType}
          />
        </aside>
      )}
    </main>
  );
}
