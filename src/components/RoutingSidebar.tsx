"use client";

import React, { useState, useRef } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutHeader, LayoutContent, LayoutFooter, VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { ToggleButtonGroup, ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Slider } from "@astryxdesign/core/Slider";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Item } from "@astryxdesign/core/Item";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  Navigation,
  AlertTriangle,
  ShieldAlert,
  Navigation2,
  Target,
  Flame,
  Waves,
  Skull,
  Compass,
  Sparkles,
  Loader2,
  CheckCircle2,
  Activity,
  Shield,
  Wind,
  Radiation,
  Snowflake,
  Biohazard,
  Mountain,
  Radio,
  Bell,
  Tornado,
  Sun,
  CloudLightning,
  ThermometerSnowflake,
  MountainSnow,
  Thermometer,
  Download,
} from "lucide-react";
import { ReportIncidentModal } from "@/components/ReportIncidentModal";

interface RoutingSidebarProps {
  hazardCenter: [number, number] | null;
  setHazardCenter: (c: [number, number] | null) => void;
  hazardRadius: number;
  setHazardRadius: (r: number) => void;
  startCoords: [number, number] | null;
  setStartCoords: (c: [number, number] | null) => void;
  endCoords: [number, number] | null;
  setEndCoords: (c: [number, number] | null) => void;
  routeGeoJSON: any;
  setRouteGeoJSON: (g: any) => void;
  bypassRouteGeoJSON: any;
  setBypassRouteGeoJSON: (g: any) => void;
  isPlacingHazard: boolean;
  setIsPlacingHazard: (b: boolean) => void;
  setMapFlyToCoords: (c: [number, number] | null) => void;
  aiRecommendation: string;
  setAiRecommendation: (s: string) => void;
  aiLoading: boolean;
  setAiLoading: (b: boolean) => void;
  evacuationPoints: any;
  cityName: string;
  setCityName: (s: string) => void;
  densityPerKm2: number | null;
  setDensityPerKm2: (n: number | null) => void;
  densityLoading: boolean;
  setDensityLoading: (b: boolean) => void;
  gdacsEvents: any[];
  gdacsLoading: boolean;
  incidentType: string;
  setIncidentType: (type: string) => void;
  pendingAutoRoute?: boolean;
  clearPendingAutoRoute?: () => void;
}

// Haversine distance helper (in kilometers)
function getDistance(coord1: [number, number], coord2: [number, number]) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371; // Radius of Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate detour waypoints around the hazard dome
function getDetourCoords(
  start: [number, number],
  end: [number, number],
  center: [number, number],
  radiusMeters: number
): { left: [number, number]; right: [number, number] } {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const [cx, cy] = center;

  let dx = ex - sx;
  let dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) {
    dx = 1;
    dy = 0;
  } else {
    dx /= len;
    dy /= len;
  }

  // Perpendicular directions
  const px1 = -dy;
  const py1 = dx;
  const px2 = dy;
  const py2 = -dx;

  // Offset waypoint with a safety factor of 1.4
  const radiusDeg = (radiusMeters * 1.4) / 111320;

  const left: [number, number] = [cx + px1 * radiusDeg, cy + py1 * radiusDeg];
  const right: [number, number] = [cx + px2 * radiusDeg, cy + py2 * radiusDeg];

  return { left, right };
}

// Downsample coordinate lists to prevent token limit issues
function downsampleCoords(coords: [number, number][], maxPoints: number = 50): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.round(i * step), coords.length - 1);
    result.push(coords[idx]);
  }
  if (coords.length > 0) {
    result[result.length - 1] = coords[coords.length - 1];
  }
  return result;
}

// Segment the route and assign congestion levels based on proximity to the hazard epicentre
function createTrafficRouteGeoJSON(
  routeFeature: any,
  hazardCenter: [number, number] | null,
  hazardRadius: number
): any {
  if (!routeFeature || !routeFeature.geometry || routeFeature.geometry.type !== "LineString") {
    return routeFeature;
  }

  const coordinates = routeFeature.geometry.coordinates;
  if (coordinates.length < 2) return routeFeature;

  const features = [];
  const radiusKm = hazardRadius / 1000;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];

    // Midpoint distance calculations
    const midpoint: [number, number] = [
      (c1[0] + c2[0]) / 2,
      (c1[1] + c2[1]) / 2
    ];

    let congestion = "clear";
    if (hazardCenter) {
      const dist = getDistance(midpoint, hazardCenter);
      if (dist <= radiusKm * 1.1) {
        congestion = "heavy";
      } else if (dist <= radiusKm * 1.6) {
        congestion = "moderate";
      }
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [c1, c2]
      },
      properties: {
        congestion
      }
    });
  }

  return {
    type: "FeatureCollection",
    features,
    properties: {
      distance: routeFeature.properties.distance,
      duration: routeFeature.properties.duration,
      trafficDelayMins: routeFeature.properties.trafficDelayMins || 0,
      incidents: routeFeature.properties.incidents || [],
      isTomTom: routeFeature.properties.isTomTom || false
    }
  };
}

// Parse TomTom route response to GeoJSON with traffic congestion segments and metadata
function parseTomTomRoute(tomtomData: any, hazardCenter: [number, number] | null, hazardRadius: number): any {
  if (!tomtomData || !tomtomData.routes || tomtomData.routes.length === 0) {
    return null;
  }

  const route = tomtomData.routes[0];
  const leg = route.legs[0];
  const coordinates = leg.points.map((p: any) => [p.longitude, p.latitude]);
  const sections = route.sections || [];
  const radiusKm = hazardRadius / 1000;

  const features = [];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const c1 = coordinates[i];
    const c2 = coordinates[i + 1];
    const midpoint: [number, number] = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];

    let congestion = "clear";

    // 1. Live TomTom Traffic Congestion
    if (sections && sections.length > 0) {
      const trafficSec = sections.find((sec: any) =>
        sec.sectionType === "traffic" &&
        i >= sec.startPointIndex &&
        i < sec.endPointIndex
      );
      if (trafficSec) {
        const magnitude = trafficSec.magnitudeOfDelay;
        if (magnitude >= 3) {
          congestion = "heavy";
        } else if (magnitude >= 2) {
          congestion = "moderate";
        }
      }
    }

    // 2. Localized Emergency Dome Congestion Override
    if (hazardCenter) {
      const dist = getDistance(midpoint, hazardCenter);
      if (dist <= radiusKm * 1.1) {
        congestion = "heavy";
      } else if (dist <= radiusKm * 1.6 && congestion !== "heavy") {
        congestion = "moderate";
      }
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [c1, c2]
      },
      properties: {
        congestion
      }
    });
  }

  // Summarize incidents along the route
  const incidents = sections.filter((sec: any) => sec.sectionType === "traffic" && sec.magnitudeOfDelay >= 2)
    .map((sec: any) => {
      let typeLabel = "Traffic Jam";
      if (sec.simpleCategory === "ROAD_WORK") typeLabel = "Road Work";
      else if (sec.simpleCategory === "ROAD_CLOSURE") typeLabel = "Road Closure";

      const startPoint = coordinates[sec.startPointIndex];
      return {
        type: sec.simpleCategory || "JAM",
        label: typeLabel,
        delayMins: Math.round(sec.delayInSeconds / 60),
        speedKmh: sec.effectiveSpeedInKmh || 0,
        coordinates: startPoint
      };
    });

  return {
    type: "FeatureCollection",
    features,
    properties: {
      distance: leg.summary.lengthInMeters / 1000,
      duration: leg.summary.travelTimeInSeconds / 60,
      trafficDelayMins: Math.round((leg.summary.trafficDelayInSeconds || 0) / 60),
      incidents,
      isTomTom: true
    }
  };
}

// Parse OSRM route response to GeoJSON
function parseOSRMRoute(osrmData: any, hazardCenter: [number, number] | null, hazardRadius: number): any {
  if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
    return null;
  }
  const primaryRouteFeature = {
    type: "Feature",
    geometry: osrmData.routes[0].geometry,
    properties: {
      distance: osrmData.routes[0].distance / 1000, // km
      duration: osrmData.routes[0].duration / 60, // mins
      trafficDelayMins: 0,
      incidents: [],
      isTomTom: false
    },
  };
  return createTrafficRouteGeoJSON(primaryRouteFeature, hazardCenter, hazardRadius);
}

// Routing helper that tries TomTom first (for real traffic with alternative calculations), and falls back to OSRM
async function getRouteData(coords: [number, number][]) {
  const tomtomKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY || 'fqSazhj2APo816F2cBqqxI0e4GqatpEh';

  if (tomtomKey) {
    try {
      // TomTom format: lat,lng:lat,lng...
      const locationsStr = coords.map(c => `${c[1]},${c[0]}`).join(':');
      // Ask TomTom to calculate the fastest route, offering up to 2 alternatives to compare and select the least congested one
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${locationsStr}/json?key=${tomtomKey}&traffic=true&departAt=now&routeType=fastest&maxAlternatives=2&sectionType=traffic`;

      console.log(`[TomTom] Requesting route data: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 1) {
          // Sort routes in-place so the fastest (shortest travelTimeInSeconds) is at index 0
          data.routes.sort((a: any, b: any) => {
            const timeA = a.legs?.[0]?.summary?.travelTimeInSeconds || Infinity;
            const timeB = b.legs?.[0]?.summary?.travelTimeInSeconds || Infinity;
            return timeA - timeB;
          });
          console.log(`[TomTom Alternatives] Sorted ${data.routes.length} routes. Selected fastest route with ${data.routes[0].legs[0].summary.travelTimeInSeconds}s travel time.`);
        }
        return { source: "tomtom", data };
      } else {
        console.error(`[TomTom] Error response:`, await res.text());
      }
    } catch (err) {
      console.error(`[TomTom] Request failed, falling back to OSRM:`, err);
    }
  }

  // OSRM Fallback
  // OSRM format: lng,lat;lng,lat...
  const osrmCoordsStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${osrmCoordsStr}?overview=full&geometries=geojson&alternatives=true`;
  console.log(`[OSRM Fallback] Requesting route data: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM routing API returned an error status.");
  const data = await res.json();
  if (data.routes && data.routes.length > 1) {
    // Sort OSRM routes in-place so the one with the smallest duration is at index 0
    data.routes.sort((a: any, b: any) => (a.duration || Infinity) - (b.duration || Infinity));
    console.log(`[OSRM Alternatives] Sorted ${data.routes.length} routes. Selected fastest fallback route with duration ${data.routes[0].duration}s.`);
  }
  return { source: "osrm", data };
}

// Hazard classification grid — icon + Astryx hue token per type
const HAZARD_OPTIONS: { type: string; icon: React.ReactNode }[] = [
  { type: "Wildfire", icon: <Flame className="w-4 h-4 text-orange-vivid" /> },
  { type: "Flooding", icon: <Waves className="w-4 h-4 text-blue-vivid" /> },
  { type: "Flash Flood", icon: <Waves className="w-4 h-4 text-cyan-vivid" /> },
  { type: "Toxic Plume", icon: <Skull className="w-4 h-4 text-green-vivid" /> },
  { type: "Earthquake", icon: <Activity className="w-4 h-4 text-yellow-vivid" /> },
  { type: "Tornado", icon: <Wind className="w-4 h-4 text-teal-vivid" /> },
  { type: "Radiation Leak", icon: <Radiation className="w-4 h-4 text-yellow-vivid" /> },
  { type: "Chemical Spill", icon: <Biohazard className="w-4 h-4 text-yellow-vivid" /> },
  { type: "Blizzard", icon: <Snowflake className="w-4 h-4 text-cyan-vivid" /> },
  { type: "Ice Storm", icon: <Snowflake className="w-4 h-4 text-cyan-vivid" /> },
  { type: "Volcanic Eruption", icon: <Mountain className="w-4 h-4 text-red-vivid" /> },
  { type: "Tropical Cyclone", icon: <Tornado className="w-4 h-4 text-cyan-vivid" /> },
  { type: "Heatwave", icon: <Thermometer className="w-4 h-4 text-red-vivid" /> },
  { type: "Drought", icon: <Sun className="w-4 h-4 text-yellow-vivid" /> },
  { type: "Extreme Cold", icon: <ThermometerSnowflake className="w-4 h-4 text-blue-vivid" /> },
  { type: "Thunderstorm", icon: <CloudLightning className="w-4 h-4 text-purple-vivid" /> },
  { type: "Landslide", icon: <MountainSnow className="w-4 h-4 text-gray-vivid" /> },
];

export default function RoutingSidebar({
  hazardCenter,
  setHazardCenter,
  hazardRadius,
  setHazardRadius,
  startCoords,
  setStartCoords,
  endCoords,
  setEndCoords,
  routeGeoJSON,
  setRouteGeoJSON,
  bypassRouteGeoJSON,
  setBypassRouteGeoJSON,
  isPlacingHazard,
  setIsPlacingHazard,
  setMapFlyToCoords,
  aiRecommendation,
  setAiRecommendation,
  aiLoading,
  setAiLoading,
  evacuationPoints,
  cityName,
  setCityName,
  densityPerKm2,
  setDensityPerKm2,
  densityLoading,
  setDensityLoading,
  gdacsEvents,
  gdacsLoading,
  incidentType,
  setIncidentType,
  pendingAutoRoute,
  clearPendingAutoRoute,
}: RoutingSidebarProps) {
  const [startPoint, setStartPoint] = useState("");
  const [endPoint, setEndPoint] = useState("");
  const [hazardSearch, setHazardSearch] = useState("");
  const [routingLoading, setRoutingLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tab, setTab] = useState("hazard");

  const [emergencyFacilities, setEmergencyFacilities] = useState<any[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState<boolean>(false);

  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState(false);
  const [alertedFacilities, setAlertedFacilities] = useState<{
    police: any;
    fire: any;
    healthcare: any[];
  } | null>(null);

  const handleAlertEmergencyServices = () => {
    if (!hazardCenter) return;
    setAlertLoading(true);
    setAlertSuccess(false);

    // Filter from state:
    const policeStations = emergencyFacilities.filter(f => f.type === "Police Station");
    const fireStations = emergencyFacilities.filter(f => f.type === "Fire Station");
    const healthcarePlaces = emergencyFacilities.filter(f => f.type === "Hospital" || f.type === "Clinic");

    // Get nearest (they are already sorted by distance in api response):
    const police = policeStations[0] || {
      name: "Local Police Precinct (Fallback)",
      distance: 1200,
      type: "Police Station",
      status: "Safe Zone",
      address: "Downtown Precinct"
    };
    const fire = fireStations[0] || {
      name: "Emergency Fire Station (Fallback)",
      distance: 1500,
      type: "Fire Station",
      status: "Safe Zone",
      address: "Central Firehouse"
    };
    const hc = healthcarePlaces.slice(0, 2);
    if (hc.length < 2) {
      if (hc.length === 0) {
        hc.push({
          name: "General Hospital Emergency Room (Fallback)",
          distance: 1800,
          type: "Hospital",
          status: "Safe Zone",
          address: "Medical Center Drive"
        });
        hc.push({
          name: "First Aid Clinic (Fallback)",
          distance: 2100,
          type: "Clinic",
          status: "Safe Zone",
          address: "Community Plaza"
        });
      } else {
        hc.push({
          name: "First Aid Clinic (Fallback)",
          distance: hc[0].distance + 500,
          type: "Clinic",
          status: "Safe Zone",
          address: "Community Plaza"
        });
      }
    }

    setAlertedFacilities({ police, fire, healthcare: hc });

    setTimeout(() => {
      setAlertLoading(false);
      setAlertSuccess(true);
    }, 1500);
  };

  // Automatically sync hazardCenter to the starting point of the navigation tab
  React.useEffect(() => {
    if (hazardCenter) {
      const startAddress = `Epicentre (${hazardCenter[0].toFixed(5)}, ${hazardCenter[1].toFixed(5)})`;
      setStartPoint(startAddress);
    }
  }, [hazardCenter]);

  // Automatically sync endPoint when a shelter is selected or endCoords updates
  React.useEffect(() => {
    if (endCoords) {
      let matchingShelter = null;
      if (evacuationPoints && evacuationPoints.features) {
        matchingShelter = evacuationPoints.features.find((feat: any) => {
          const coords = feat.geometry.coordinates;
          return Math.abs(coords[0] - endCoords[0]) < 0.00001 && Math.abs(coords[1] - endCoords[1]) < 0.00001;
        });
      }
      if (matchingShelter) {
        setEndPoint(matchingShelter.properties.name);
      } else {
        setEndPoint(`Safe Zone (${endCoords[0].toFixed(4)}, ${endCoords[1].toFixed(4)})`);
      }
    } else {
      setEndPoint("");
    }
  }, [endCoords, evacuationPoints]);

  // Fetch nearby critical emergency services (hospitals, clinics, fire stations, police stations)
  React.useEffect(() => {
    if (!hazardCenter) {
      setEmergencyFacilities([]);
      return;
    }

    const timer = setTimeout(() => {
      const fetchFacilities = async () => {
        setFacilitiesLoading(true);
        try {
          const res = await fetch("/api/emergency-services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hazardCenter, hazardRadius })
          });
          if (res.ok) {
            const data = await res.json();
            setEmergencyFacilities(data.facilities || []);
          }
        } catch (err) {
          console.error("Failed to fetch emergency facilities:", err);
        } finally {
          setFacilitiesLoading(false);
        }
      };

      fetchFacilities();
    }, 400); // 400ms debounce buffer to prevent layout thrashing on slide

    return () => clearTimeout(timer);
  }, [hazardCenter, hazardRadius]);

  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || 'get_your_own_OpIi9ZULNHzrESv6T2vL';

  // Geocoding helper
  const geocodeAddress = async (query: string): Promise<[number, number] | null> => {
    if (!query.trim()) return null;
    try {
      const res = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${mapTilerKey}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        return data.features[0].center; // [lng, lat]
      }
    } catch (err) {
      console.error("Geocoding failed:", err);
    }
    return null;
  };

  // Geocode and place dome at located area
  const handleLocateHazard = async () => {
    setErrorMessage("");
    if (!hazardSearch.trim()) return;

    const coords = await geocodeAddress(hazardSearch);
    if (coords) {
      setHazardCenter(coords);
      setMapFlyToCoords(coords);
    } else {
      setErrorMessage("Could not resolve hazard location.");
    }
  };

  // Core route-generation logic, shared between the manual form submit and the
  // auto-triggered "Route to Safety" quick action coming from Aegis Prevent.
  const runRoute = async (start: [number, number], end: [number, number]) => {
    setErrorMessage("");
    setRouteGeoJSON(null);
    setBypassRouteGeoJSON(null);
    setAiRecommendation("");
    setRoutingLoading(true);

    try {
      setStartCoords(start);
      setEndCoords(end);

      // 2. Query initial direct route
      const initialRouteResult = await getRouteData([start, end]);
      let primaryRouteGeoJSON = null;
      let primaryRouteCoords: [number, number][] = [];

      if (initialRouteResult.source === "tomtom") {
        primaryRouteGeoJSON = parseTomTomRoute(initialRouteResult.data, hazardCenter, hazardRadius);
        if (primaryRouteGeoJSON && initialRouteResult.data.routes[0].legs[0].points) {
          primaryRouteCoords = initialRouteResult.data.routes[0].legs[0].points.map((p: any) => [p.longitude, p.latitude]);
        }
      } else {
        primaryRouteGeoJSON = parseOSRMRoute(initialRouteResult.data, hazardCenter, hazardRadius);
        if (primaryRouteGeoJSON && initialRouteResult.data.routes[0].geometry) {
          primaryRouteCoords = initialRouteResult.data.routes[0].geometry.coordinates;
        }
      }

      if (!primaryRouteGeoJSON || primaryRouteCoords.length === 0) {
        setErrorMessage("No route found between coordinates.");
        setRoutingLoading(false);
        return;
      }

      setRouteGeoJSON(primaryRouteGeoJSON);
      setMapFlyToCoords(start); // zoom onto start coordinate

      setRoutingLoading(false);

      // 3. Fetch AI Evacuation Route and Guidelines
      setAiLoading(true);
      try {
        const response = await fetch("/api/evacuate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidentType,
            startAddr: startPoint,
            endAddr: endPoint,
            startCoords: start,
            endCoords: end,
            hazardCenter,
            hazardRadius,
            primaryRouteCoords: downsampleCoords(primaryRouteCoords),
          }),
        });
        const aiData = await response.json();
        setAiRecommendation(aiData.text || "No safety guidelines returned.");

        if (aiData.detourWaypoints && aiData.detourWaypoints.length > 0) {
          const reference = hazardCenter || start;
          const fixedWaypoints = aiData.detourWaypoints.map((wp: [number, number]) => {
            const [c0, c1] = wp;
            const [refLng, refLat] = reference;
            // Distance squared if [c0, c1] is [lng, lat]
            const dNormal = Math.pow(c0 - refLng, 2) + Math.pow(c1 - refLat, 2);
            // Distance squared if [c0, c1] is [lat, lng]
            const dFlipped = Math.pow(c1 - refLng, 2) + Math.pow(c0 - refLat, 2);

            if (dFlipped < dNormal) {
              console.log(`[Client Route Fixer] Swapping flipped AI waypoint: [${c0}, ${c1}] -> [${c1}, ${c0}]`);
              return [c1, c0] as [number, number];
            }
            return wp;
          });

          // Construct the full coordinate list for routing: start -> AI waypoints -> end
          const detourCoords: [number, number][] = [
            start,
            ...fixedWaypoints,
            end
          ];

          try {
            const bypassRouteResult = await getRouteData(detourCoords);
            if (bypassRouteResult.source === "tomtom") {
              setBypassRouteGeoJSON(parseTomTomRoute(bypassRouteResult.data, hazardCenter, hazardRadius));
            } else {
              setBypassRouteGeoJSON(parseOSRMRoute(bypassRouteResult.data, hazardCenter, hazardRadius));
            }
          } catch (bypassErr) {
            console.error("Waypoint routing failed, falling back to direct route:", bypassErr);
            setBypassRouteGeoJSON(null);
          }
        } else {
          setBypassRouteGeoJSON(null);
        }
      } catch (aiErr) {
        console.error("Failed to query AI advisor:", aiErr);
        setAiRecommendation("Failed to generate AI safety guidelines. Check environment keys.");
        setBypassRouteGeoJSON(null);
      } finally {
        setAiLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Routing algorithm failed. Please try again.");
      setRoutingLoading(false);
    }
  };

  // Form-triggered entry point: resolve text inputs to coordinates, then hand off to runRoute.
  const handleRoute = async () => {
    if (!startPoint.trim() || !endPoint.trim()) {
      setErrorMessage("Please supply starting point and destination.");
      return;
    }

    let start: [number, number] | null = null;
    if (hazardCenter && (startPoint.includes("Epicentre") || !startPoint.trim())) {
      start = hazardCenter;
    } else {
      start = await geocodeAddress(startPoint);
    }

    let end: [number, number] | null = null;
    let matchingShelter = null;
    if (evacuationPoints && evacuationPoints.features) {
      matchingShelter = evacuationPoints.features.find((feat: any) =>
        feat.properties.name.toLowerCase().trim() === endPoint.toLowerCase().trim()
      );
    }
    if (matchingShelter) {
      end = matchingShelter.geometry.coordinates;
    } else if (endCoords && (endPoint.includes("Evacuation Center") || endPoint.includes("Safe Zone"))) {
      end = endCoords;
    } else {
      end = await geocodeAddress(endPoint);
    }

    if (!start || !end) {
      setErrorMessage("Unable to resolve starting point or destination coordinates.");
      return;
    }

    await runRoute(start, end);
  };

  // Auto-triggered by "Route to Safety" in Aegis Prevent: hazardCenter/incidentType/radius
  // have already been carried over as shared state, so once the AI-suggested shelters load
  // we pick the nearest one and run routing immediately without any user input.
  const autoRouteFiredRef = useRef(false);
  React.useEffect(() => {
    if (!pendingAutoRoute || !hazardCenter) return;
    if (!evacuationPoints || !evacuationPoints.features || evacuationPoints.features.length === 0) return;
    if (autoRouteFiredRef.current) return;
    autoRouteFiredRef.current = true;

    let nearest = evacuationPoints.features[0];
    let nearestDist = getDistance(hazardCenter, nearest.geometry.coordinates);
    for (const feat of evacuationPoints.features) {
      const d = getDistance(hazardCenter, feat.geometry.coordinates);
      if (d < nearestDist) {
        nearest = feat;
        nearestDist = d;
      }
    }
    const end: [number, number] = nearest.geometry.coordinates;
    setEndCoords(end);
    runRoute(hazardCenter, end).finally(() => {
      clearPendingAutoRoute?.();
      autoRouteFiredRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRoute, evacuationPoints, hazardCenter]);

  // Downloadable .md export of the impacted area dome and both route geometries —
  // the coordinate-level record a responder or a second app can act on directly.
  const handleExportRoute = () => {
    const lines: string[] = [];
    const now = new Date().toISOString();
    lines.push(`# Aegis Route — Evacuation Export`);
    lines.push("");
    lines.push(`**Incident type:** ${incidentType}`);
    lines.push(`**Generated:** ${now}`);
    lines.push("");

    if (hazardCenter) {
      lines.push(`## Impacted area`);
      lines.push("");
      lines.push(`**Epicentre (lng, lat):** \`${hazardCenter[0].toFixed(6)}, ${hazardCenter[1].toFixed(6)}\``);
      lines.push(`**Dome radius:** ${hazardRadius} m (${(hazardRadius / 1000).toFixed(2)} km)`);
      lines.push(`**Dome area:** ${(Math.PI * Math.pow(hazardRadius / 1000, 2)).toFixed(2)} km²`);
      lines.push("");
    }

    if (startCoords && endCoords) {
      lines.push(`## Route endpoints`);
      lines.push("");
      lines.push(`**Start (lng, lat):** \`${startCoords[0].toFixed(6)}, ${startCoords[1].toFixed(6)}\` — ${startPoint}`);
      lines.push(`**Destination (lng, lat):** \`${endCoords[0].toFixed(6)}, ${endCoords[1].toFixed(6)}\` — ${endPoint}`);
      lines.push("");
    }

    const exportRouteCoords = (label: string, geo: any) => {
      if (!geo) return;
      const coords: [number, number][] = [];
      if (geo.type === "FeatureCollection") {
        for (const f of geo.features || []) {
          const seg = f?.geometry?.coordinates;
          if (Array.isArray(seg)) coords.push(...seg);
        }
      }
      if (coords.length === 0) return;
      lines.push(`## ${label}`);
      lines.push("");
      lines.push(`Distance: ${geo.properties?.distance?.toFixed?.(2) ?? "—"} km · Duration: ~${Math.round(geo.properties?.duration ?? 0)} min`);
      lines.push("");
      lines.push("| # | Longitude | Latitude |");
      lines.push("|---|---|---|");
      coords.forEach((c, i) => {
        if (i % Math.max(1, Math.floor(coords.length / 200)) !== 0 && i !== coords.length - 1) return;
        lines.push(`| ${i + 1} | ${c[0].toFixed(6)} | ${c[1].toFixed(6)} |`);
      });
      lines.push("");
    };

    exportRouteCoords("Primary route coordinates", routeGeoJSON);
    exportRouteCoords("Detour / bypass route coordinates", bypassRouteGeoJSON);

    if (evacuationPoints?.features?.length) {
      lines.push(`## Evacuation shelters`);
      lines.push("");
      lines.push("| Name | Longitude | Latitude | Direction |");
      lines.push("|---|---|---|---|");
      for (const s of evacuationPoints.features) {
        const c = s.geometry.coordinates;
        lines.push(`| ${s.properties.name} | ${c[0].toFixed(6)} | ${c[1].toFixed(6)} | ${s.properties.direction || "—"} |`);
      }
      lines.push("");
    }

    const md = lines.join("\n");
    const slug = incidentType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const date = new Date().toISOString().split("T")[0];
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aegis-evacuation-${slug}-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getIncidentIcon = () => {
    switch (incidentType) {
      case "Wildfire":
        return <Flame className="w-5 h-5 text-orange-vivid" />;
      case "Flooding":
        return <Waves className="w-5 h-5 text-blue-vivid" />;
      case "Chemical Spill":
        return <Biohazard className="w-5 h-5 text-yellow-vivid" />;
      case "Toxic Plume":
        return <Skull className="w-5 h-5 text-green-vivid" />;
      case "Earthquake":
        return <Activity className="w-5 h-5 text-yellow-vivid" />;
      case "Tornado":
        return <Wind className="w-5 h-5 text-teal-vivid" />;
      case "Radiation Leak":
        return <Radiation className="w-5 h-5 text-yellow-vivid" />;
      case "Blizzard":
        return <Snowflake className="w-5 h-5 text-cyan-vivid" />;
      case "Volcanic Eruption":
        return <Mountain className="w-5 h-5 text-red-vivid" />;
      case "Tropical Cyclone":
        return <Tornado className="w-5 h-5 text-cyan-vivid" />;
      case "Heatwave":
        return <Thermometer className="w-5 h-5 text-red-vivid" />;
      case "Drought":
        return <Sun className="w-5 h-5 text-yellow-vivid" />;
      case "Extreme Cold":
        return <ThermometerSnowflake className="w-5 h-5 text-blue-vivid" />;
      case "Thunderstorm":
        return <CloudLightning className="w-5 h-5 text-purple-vivid" />;
      case "Landslide":
        return <MountainSnow className="w-5 h-5 text-gray-vivid" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-vivid" />;
    }
  };

  return (
    /* The docked column in page.tsx IS the panel, so this fills it directly.
       No Card wrapper — that would draw a second border inside the sidebar. */
    <>
      <Layout
        header={
          <div className="sidebar-header">
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center">
                <ShieldAlert className="w-7 h-7" style={{ color: "#c1121f" }} />
                <span className="sidebar-header-title" style={{ color: "#fdf0d5", fontSize: "1.25rem", fontWeight: 700 }}>Aegis Route</span>
              </HStack>
              <span className="sidebar-header-subtitle" style={{ color: "#669bbc", fontSize: "0.75rem" }}>
                AI-powered disaster routing &amp; emergency dome placement
              </span>
            </VStack>
          </div>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
                  <TabList value={tab} onChange={setTab} layout="fill" hasDivider>
                    <Tab value="hazard" label="1. Affected" icon={<Target className="w-3.5 h-3.5" />} />
                    <Tab value="route" label="2. Navigate" icon={<Navigation className="w-3.5 h-3.5" />} />
                    <Tab value="report" label="3. Report" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
                  </TabList>

                  {/* TAB 1: Affected Area & Hazard Dome Placement */}
                  {tab === "hazard" && (
                    <VStack gap={4}>
                      <div className="section-accent">
                        <Text type="body" weight="bold" style={{ color: "#fdf0d5" }}>Disaster classification</Text>
                      </div>
                      <Card variant="muted" padding={3} style={{ background: "#001d2e", border: "1px solid #669bbc33", borderRadius: "0.625rem" }}>
                          <ToggleButtonGroup
                            label="Disaster classification"
                            type="single"
                            value={incidentType}
                            onChange={(v: string | null | string[]) => v && setIncidentType(v as string)}
                          >
                            {/* Two columns: labels like "Tropical Cyclone" and
                                "Volcanic Eruption" truncate at three across. */}
                            <div className="grid grid-cols-2 gap-2">
                              {HAZARD_OPTIONS.map(({ type, icon }) => (
                                <ToggleButton key={type} value={type} label={type} icon={icon} size="sm" />
                              ))}
                            </div>
                          </ToggleButtonGroup>
                      </Card>

                      <VStack gap={2}>
                        <HStack gap={2}>
                          <div className="flex-1">
                            <TextInput
                              label="Locate epicentre"
                              placeholder="e.g. Times Square, NY"
                              value={hazardSearch}
                              onChange={setHazardSearch}
                            />
                          </div>
                          <Button label="Locate" variant="secondary" clickAction={handleLocateHazard} />
                        </HStack>
                      </VStack>

                      <VStack gap={2}>
                        <Text type="supporting" color="secondary" justify="center" display="block">OR</Text>
                        <Button
                          label={isPlacingHazard ? "Click on map to place epicentre..." : "Tap to place epicentre"}
                          variant="destructive"
                          icon={<Target className="w-4 h-4" />}
                          onClick={() => setIsPlacingHazard(true)}
                          width="100%"
                        />
                      </VStack>

                      {hazardCenter && (
                        <VStack gap={3}>
                          <HStack hAlign="between">
                            <Text type="supporting" weight="bold">Epicentre radar active</Text>
                            <Text type="supporting" weight="bold" color="accent">
                              [{hazardCenter[0].toFixed(4)}, {hazardCenter[1].toFixed(4)}]
                            </Text>
                          </HStack>

                          <Slider
                            label="Impact radius"
                            value={hazardRadius}
                            onChange={((v: number) => setHazardRadius(v)) as any}
                            min={300}
                            max={4000}
                            step={100}
                            formatValue={(v) => `${v}m (${(v / 1000).toFixed(1)} km)`}
                          />

                          <Card variant="default" elevation="none" padding={3} style={{ background: "#002438", border: "1px solid #669bbc33" }}>
                            <MetadataList columns="single">
                              <MetadataListItem label="Identified city" style={{ color: "#669bbc" }}>{cityName || "Resolving..."}</MetadataListItem>
                              <MetadataListItem label="Population density" style={{ color: "#669bbc" }}>
                                {densityLoading ? "Loading..." : densityPerKm2 ? `${densityPerKm2.toLocaleString()} ppl/km²` : "Loading..."}
                              </MetadataListItem>
                              <MetadataListItem label="Estimated impacted population">
                                {densityLoading
                                  ? "Calculating..."
                                  : densityPerKm2 !== null
                                  ? Math.round(Math.PI * Math.pow(hazardRadius / 1000, 2) * densityPerKm2).toLocaleString()
                                  : "Calculating..."}
                                {" "}
                                <Text type="supporting" size="3xs" color="secondary">
                                  Area: {(Math.PI * Math.pow(hazardRadius / 1000, 2)).toFixed(2)} km²
                                </Text>
                              </MetadataListItem>
                            </MetadataList>
                          </Card>
                        </VStack>
                      )}
                    </VStack>
                  )}

                  {/* TAB 2: Route Navigation & Evacuation Search */}
                  {tab === "route" && (
                    <VStack gap={4}>
                      <VStack gap={3}>
                        <TextInput label="Start location" placeholder="Address or landmark" value={startPoint} onChange={setStartPoint} />
                        <TextInput label="Destination (safe zone)" placeholder="Evacuation point or safe city" value={endPoint} onChange={setEndPoint} />
                        <Button
                          label={routingLoading ? "Computing detour..." : "Generate evacuation route"}
                          variant="primary"
                          icon={routingLoading ? undefined : <Navigation2 className="w-4 h-4" />}
                          isLoading={routingLoading}
                          clickAction={handleRoute}
                          width="100%"
                        />
                      </VStack>

                      {hazardCenter && evacuationPoints && evacuationPoints.features && (
                        <VStack gap={2}>
                          <div className="divider-palette" />
                          <div className="section-accent-blue">
                            <Text type="supporting" weight="bold" style={{ color: "#fdf0d5" }}>Recommended evacuation shelters</Text>
                          </div>
                          <div className="max-h-[160px] overflow-y-auto">
                            <VStack gap={1}>
                              {evacuationPoints.features.map((shelter: any) => {
                                const coords = shelter.geometry.coordinates;
                                const isSelected = endCoords && Math.abs(endCoords[0] - coords[0]) < 0.00001 && Math.abs(endCoords[1] - coords[1]) < 0.00001;
                                return (
                                  <Item
                                    key={shelter.properties.id}
                                    label={shelter.properties.name}
                                    description={`${getDistance(hazardCenter, coords).toFixed(1)} km outside dome`}
                                    isSelected={!!isSelected}
                                    endContent={
                                      <Button
                                        label={isSelected ? "Selected" : "Select"}
                                        size="sm"
                                        variant={isSelected ? "primary" : "secondary"}
                                        onClick={() => setEndCoords([coords[0], coords[1]])}
                                      />
                                    }
                                  />
                                );
                              })}
                            </VStack>
                          </div>
                        </VStack>
                      )}
                    </VStack>
                  )}

                  {/* TAB 3: Incident Report Submission */}
                  {tab === "report" && (
                    <VStack gap={3}>
                      <Banner status="error" title="Wildfire reported" description="2.4 miles away · Moving Northeast" />
                      <Banner status="warning" title="Road blocked" description="I-95 Southbound due to debris" />

                      <ReportIncidentModal>
                        <Button label="Report new incident" variant="secondary" width="100%" />
                      </ReportIncidentModal>

                      <Button
                        label={alertLoading ? "Broadcasting alert signals..." : !hazardCenter ? "Place epicentre to enable alerts" : "Alert nearby emergency services"}
                        variant="destructive"
                        icon={alertLoading ? undefined : <Radio className="w-4 h-4" />}
                        isLoading={alertLoading}
                        isDisabled={!hazardCenter}
                        onClick={handleAlertEmergencyServices}
                        width="100%"
                      />

                      <VStack gap={2}>
                        <HStack gap={1.5} vAlign="center">
                          <ShieldAlert className="w-4 h-4 text-secondary" />
                          <Text type="supporting" weight="bold">Nearby emergency services</Text>
                        </HStack>

                        {facilitiesLoading ? (
                          <HStack gap={2} hAlign="center" style={{ padding: "1.5rem 0" }}>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-vivid" />
                            <Text type="supporting">Locating emergency facilities...</Text>
                          </HStack>
                        ) : !hazardCenter ? (
                          <Text type="supporting" color="secondary" justify="center" display="block">
                            Place a hazard dome on the map to locate nearby emergency services.
                          </Text>
                        ) : emergencyFacilities.length === 0 ? (
                          <Text type="supporting" color="secondary" justify="center" display="block">
                            No emergency services detected within 8km.
                          </Text>
                        ) : (
                          <div className="max-h-[350px] overflow-y-auto">
                            <VStack gap={1}>
                              {emergencyFacilities.map((fac, idx) => {
                                let Icon = ShieldAlert;
                                if (fac.type === "Hospital" || fac.type === "Clinic") Icon = Activity;
                                else if (fac.type === "Fire Station") Icon = Flame;
                                else if (fac.type === "Police Station") Icon = Shield;

                                const isInside = fac.status === "Inside Dome";

                                return (
                                  <Item
                                    key={idx}
                                    label={fac.name}
                                    onClick={fac.coordinates ? () => setMapFlyToCoords(fac.coordinates) : undefined}
                                    startContent={<Icon className="w-4 h-4" />}
                                    description={`${fac.address} · ${Math.round(fac.distance)}m away · ${fac.type.toLowerCase()}`}
                                    endContent={<Badge variant={isInside ? "error" : "success"} label={isInside ? "Trapped" : "Active"} />}
                                  />
                                );
                              })}
                            </VStack>
                          </div>
                        )}
                      </VStack>
                    </VStack>
                  )}

                  {errorMessage && <Banner status="error" title={errorMessage} />}

                  {/* Route Metrics */}
                  {routeGeoJSON && (
                    <VStack gap={3}>
                      <HStack gap={1.5} vAlign="center">
                        <Compass className="w-4 h-4 text-secondary" />
                        <Text type="body" weight="bold">Evacuation route statistics</Text>
                      </HStack>

                      <HStack gap={2}>
                        <Card variant="muted" padding={3} width="100%">
                          <VStack gap={0.5}>
                            <Text type="supporting" size="3xs" weight="bold">Direct distance</Text>
                            <Text type="body" weight="bold">{routeGeoJSON.properties.distance.toFixed(2)} km</Text>
                            <Text type="supporting" size="3xs">~ {Math.round(routeGeoJSON.properties.duration)} mins</Text>
                          </VStack>
                        </Card>

                        {bypassRouteGeoJSON ? (
                          <Card variant="green" padding={3} width="100%">
                            <VStack gap={0.5}>
                              <Text type="supporting" size="3xs" weight="bold" style={{ color: "#669bbc" }}>Detour path</Text>
                              <Text type="body" weight="bold">{bypassRouteGeoJSON.properties.distance.toFixed(2)} km</Text>
                              <Text type="supporting" size="3xs" style={{ color: "#4a6573" }}>~ {Math.round(bypassRouteGeoJSON.properties.duration)} mins</Text>
                            </VStack>
                          </Card>
                        ) : (
                          <Card variant="blue" padding={3} width="100%">
                            <VStack gap={0.5} hAlign="center">
                              <HStack gap={1.5} vAlign="center">
                                <CheckCircle2 className="w-4 h-4" />
                                <Text type="supporting" weight="bold" style={{ color: "#669bbc" }}>Direct route safe</Text>
                              </HStack>
                              <Text type="supporting" size="3xs">No detour required.</Text>
                            </VStack>
                          </Card>
                        )}
                      </HStack>

                      {bypassRouteGeoJSON && (
                        <Banner
                          status="warning"
                          title="Primary route compromised by danger zone"
                          description={`Detour bypasses danger area (+${(bypassRouteGeoJSON.properties.distance - routeGeoJSON.properties.distance).toFixed(2)} km).`}
                        />
                      )}

                      {routeGeoJSON.properties.isTomTom && routeGeoJSON.properties.trafficDelayMins > 0 && (
                        <Banner
                          status="error"
                          title="Live traffic congestion"
                          description={`TomTom detected a +${routeGeoJSON.properties.trafficDelayMins} min real-world traffic delay along this path.`}
                        />
                      )}

                      {routeGeoJSON.properties.isTomTom && routeGeoJSON.properties.incidents && routeGeoJSON.properties.incidents.length > 0 && (
                        <Card variant="orange" padding={3}>
                          <VStack gap={2}>
                            <HStack hAlign="between">
                              <HStack gap={1} vAlign="center">
                                <Compass className="w-3.5 h-3.5" />
                                <Text type="supporting" weight="bold" style={{ color: "#fdf0d5" }}>TomTom live traffic incidents</Text>
                              </HStack>
                              <Badge variant="orange" label={String(routeGeoJSON.properties.incidents.length)} />
                            </HStack>
                            <div className="max-h-[120px] overflow-y-auto">
                              <VStack gap={1}>
                                {routeGeoJSON.properties.incidents.map((inc: any, idx: number) => (
                                  <Item
                                    key={idx}
                                    label={inc.label}
                                    startContent={<AlertTriangle className="w-3.5 h-3.5" />}
                                    description={
                                      inc.delayMins > 0
                                        ? `Adds ${inc.delayMins} min delay · Avg speed ${Math.round(inc.speedKmh)} km/h`
                                        : `No major delay · Avg speed ${Math.round(inc.speedKmh)} km/h`
                                    }
                                  />
                                ))}
                              </VStack>
                            </div>
                          </VStack>
                        </Card>
                      )}

                      {routeGeoJSON.properties.isTomTom && (
                        <HStack gap={1.5} vAlign="center" hAlign="end">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-vivid animate-pulse" />
                          <Text type="supporting" size="3xs" weight="bold">Real-time traffic provided by TomTom API</Text>
                        </HStack>
                      )}

                      <Button label="Export impacted area + route coordinates (.md)" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExportRoute} width="100%" />
                    </VStack>
                  )}
                  {/* AI evacuation guidance — a result panel inside the flow,
                      not a separate floating card */}
                  {(aiLoading || aiRecommendation) && (
                    <Card variant="muted" padding={4}>
                      <VStack gap={3}>
                        <VStack gap={0.5}>
                          <HStack gap={2} vAlign="center">
                            <Sparkles className="w-5 h-5 text-blue-vivid" />
                            <Heading level={3}>AI Evacuation Advisor</Heading>
                            {getIncidentIcon()}
                          </HStack>
                          <Text type="supporting" color="secondary">OpenAI real-time disaster guidance engine</Text>
                        </VStack>

                        {aiLoading ? (
                          <VStack gap={3} hAlign="center">
                            <Loader2 className="w-7 h-7 animate-spin text-blue-vivid" />
                            <Text type="supporting" weight="bold">Generating safety directives...</Text>
                          </VStack>
                        ) : (
                          <VStack gap={2}>
                            {aiRecommendation.split("\n").map((line, idx) => {
                              if (line.startsWith("###")) {
                                return <Heading key={idx} level={4}>{line.replace("###", "").trim()}</Heading>;
                              }
                              if (line.startsWith("##")) {
                                return <Heading key={idx} level={3}>{line.replace("##", "").trim()}</Heading>;
                              }
                              if (line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.") || line.startsWith("4.")) {
                                return <Text key={idx} type="body" weight="bold" display="block">{line}</Text>;
                              }
                              if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
                                const cleanLine = line.trim().replace(/^[-*]\s*/, "");
                                return (
                                  <HStack key={idx} gap={1.5}>
                                    <Text type="body" color="accent" weight="bold">•</Text>
                                    <Text type="body">{cleanLine}</Text>
                                  </HStack>
                                );
                              }
                              return <Text key={idx} type="body" display="block">{line}</Text>;
                            })}
                          </VStack>
                        )}
                      </VStack>
                    </Card>
                  )}
                </VStack>
              </LayoutContent>
            }
          />

      {/* Alert Success Dialog */}
      <Dialog isOpen={alertSuccess} onOpenChange={setAlertSuccess} purpose="info" width={480}>
        <Layout
          header={
            <DialogHeader
              title="Emergency signal sent"
              subtitle="Active disaster telemetry sent to nearest rescue services"
              onOpenChange={() => setAlertSuccess(false)}
            />
          }
          className="sidebar-panel"
          content={
            <LayoutContent padding={4}>
              {alertedFacilities && (
                <VStack gap={4}>
                  <Card variant="muted" padding={3}>
                    <MetadataList columns="single">
                      <MetadataListItem label="Incident type">{incidentType}</MetadataListItem>
                      <MetadataListItem label="Radius dome">{`${hazardRadius}m (${(hazardRadius / 1000).toFixed(1)} km)`}</MetadataListItem>
                      {hazardCenter && (
                        <MetadataListItem label="Coordinates">{`[${hazardCenter[0].toFixed(5)}, ${hazardCenter[1].toFixed(5)}]`}</MetadataListItem>
                      )}
                    </MetadataList>
                  </Card>

                  <VStack gap={2}>
                    <Text type="supporting" weight="bold">Notified stations &amp; status</Text>
                    <div className="max-h-[240px] overflow-y-auto">
                      <VStack gap={1}>
                        <Item
                          label={alertedFacilities.police.name}
                          description={`${alertedFacilities.police.address} · ${Math.round(alertedFacilities.police.distance)}m away · Police Station`}
                          startContent={<Shield className="w-4 h-4" />}
                          endContent={<Badge variant={alertedFacilities.police.status === "Inside Dome" ? "error" : "success"} label={alertedFacilities.police.status === "Inside Dome" ? "Trapped" : "Active"} />}
                        />
                        <Item
                          label={alertedFacilities.fire.name}
                          description={`${alertedFacilities.fire.address} · ${Math.round(alertedFacilities.fire.distance)}m away · Fire Station`}
                          startContent={<Flame className="w-4 h-4" />}
                          endContent={<Badge variant={alertedFacilities.fire.status === "Inside Dome" ? "error" : "success"} label={alertedFacilities.fire.status === "Inside Dome" ? "Trapped" : "Active"} />}
                        />
                        {alertedFacilities.healthcare.map((hc, idx) => (
                          <Item
                            key={idx}
                            label={hc.name}
                            description={`${hc.address} · ${Math.round(hc.distance)}m away · ${hc.type}`}
                            startContent={<Activity className="w-4 h-4" />}
                            endContent={<Badge variant={hc.status === "Inside Dome" ? "error" : "success"} label={hc.status === "Inside Dome" ? "Trapped" : "Active"} />}
                          />
                        ))}
                      </VStack>
                    </div>
                  </VStack>
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <Button label="Acknowledge alert" variant="primary" icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setAlertSuccess(false)} width="100%" />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
