"use client";

import React, { useState, useEffect } from "react";
import MapDashboard from "@/components/MapDashboard";
import RoutingSidebar from "@/components/RoutingSidebar";
import PreventionSidebar from "@/components/PreventionSidebar";
import GdacsRightFeed from "@/components/GdacsRightFeed";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  NavigationArrow,
  ShieldWarning,
  SignOut,
} from "@phosphor-icons/react";

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
  const [mapFlyToZoom, setMapFlyToZoom] = useState<number>(14);
  const [aiRecommendation, setAiRecommendation] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [evacuationPoints, setEvacuationPoints] = useState<any>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  // Top Center Mode State
  const [mode, setMode] = useState<"routing" | "prevention">("routing");
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

  // Vulnerability zones state (for map highlighting)
  const [vulnerabilityZones, setVulnerabilityZones] = useState<any>(null);

  // Event overlay state (cyclone track / earthquake zones from live feed click)
  const [eventOverlay, setEventOverlay] = useState<any>(null);
  
  // Lifted disaster type state to keep all sidebars and right panel in sync
  const [incidentType, setIncidentType] = useState<string>("Wildfire");

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

  // Fetch event track/zones when a live feed event is selected
  const handleEventSelect = async (event: any) => {
    const isCyclone = ["Tropical Cyclone", "Hurricane", "Typhoon", "Tornado", "Extreme Rainfall"].includes(event.type);
    // Fly to appropriate zoom — cyclone tracks span many degrees, earthquakes are local
    setMapFlyToZoom(isCyclone ? 4 : 7);
    setMapFlyToCoords(event.coordinates);
    try {
      const res = await fetch("/api/event-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          type: event.type,
          source: event.source,
          coordinates: event.coordinates,
          magnitude: event.magnitude,
          depth: event.depth,
          windSpeed: event.windSpeed,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.geojson) setEventOverlay(data.geojson);
      }
    } catch (err) {
      console.error("Failed to fetch event track:", err);
    }
  };

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

  if (!mounted) {
    return (
      <main className="h-screen w-full bg-[#070709] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[100px]" />
        </div>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-emerald-500/30 blur-xl scale-150 animate-pulse" />
            <div className="icon-bubble-emerald w-14 h-14 rounded-2xl flex items-center justify-center relative">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-white font-black text-sm tracking-widest uppercase">Aegis</span>
            <span className="text-neutral-500 text-xs tracking-widest uppercase animate-pulse">Initializing Command Center...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full flex-col relative overflow-hidden bg-[#070709]">
      {/* Sign out button */}
      <button
        onClick={handleSignOut}
        className="absolute top-4 right-4 z-20 glass-panel p-2.5 rounded-xl text-neutral-500 hover:text-white transition-all hover:border-white/15 cursor-pointer"
        title="Sign out"
      >
        <SignOut weight="duotone" size={16} />
      </button>

      {/* Top Center Tabs Navigation */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-panel p-1 rounded-2xl flex gap-1 items-center">
        <button
          onClick={() => setMode("routing")}
          className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
            mode === "routing"
              ? "btn-gradient text-white shadow-lg"
              : "text-neutral-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <NavigationArrow weight={mode === "routing" ? "fill" : "duotone"} size={14} />
          Evacuation Routing
        </button>
        <button
          onClick={() => setMode("prevention")}
          className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wide transition-all flex items-center gap-2 cursor-pointer ${
            mode === "prevention"
              ? "btn-gradient text-white shadow-lg"
              : "text-neutral-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldWarning weight={mode === "prevention" ? "fill" : "duotone"} size={14} />
          Disaster Prevention
        </button>
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
        mapFlyToZoom={mapFlyToZoom}
        clearFlyTo={() => setMapFlyToCoords(null)}
        evacuationPoints={mode === "routing" ? evacuationPoints : null}
        onSelectDestination={(coords: [number, number]) => setEndCoords(coords)}
        activeDefenses={activeDefenses}
        vulnerabilityZones={vulnerabilityZones}
        eventOverlay={eventOverlay}
      />

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
        />
      )}

      {/* Multi-source live feed panel — only in Envis Prevent */}
      {mode === "prevention" && (
        <GdacsRightFeed
          cyclones={liveCyclones}
          earthquakes={liveEarthquakes}
          feedLoading={liveFeedLoading}
          setHazardCenter={setHazardCenter}
          setIncidentType={setIncidentType}
          onEventSelect={handleEventSelect}
        />
      )}
    </main>
  );
}
