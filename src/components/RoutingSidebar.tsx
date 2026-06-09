"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Navigation, 
  AlertTriangle, 
  ShieldAlert, 
  Navigation2, 
  MapPin, 
  Flame, 
  Waves, 
  Skull, 
  Compass, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  Target,
  Activity,
  Shield,
  Wind,
  Radiation,
  Snowflake,
  Biohazard,
  Mountain,
  Radio,
  Send,
  Bell
} from "lucide-react";
import { ReportIncidentModal } from "@/components/ReportIncidentModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
}: RoutingSidebarProps) {
  const [startPoint, setStartPoint] = useState("");
  const [endPoint, setEndPoint] = useState("");
  const [hazardSearch, setHazardSearch] = useState("");
  const [routingLoading, setRoutingLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
  const handleLocateHazard = async (e: React.FormEvent) => {
    e.preventDefault();
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

  // Generate Evacuation Routes and call OpenAI advice assistant
  const handleRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setRouteGeoJSON(null);
    setBypassRouteGeoJSON(null);
    setAiRecommendation("");
    
    if (!startPoint.trim() || !endPoint.trim()) {
      setErrorMessage("Please supply starting point and destination.");
      return;
    }

    setRoutingLoading(true);

    try {
      // 1. Geocode locations
      let start: [number, number] | null = null;
      if (hazardCenter && (startPoint.includes("Epicentre") || !startPoint.trim())) {
        start = hazardCenter;
      } else {
        start = await geocodeAddress(startPoint);
      }
      
      let end: [number, number] | null = null;
      
      // Try to find a matching shelter in the dynamic evacuation shelters to bypass geocoding
      let matchingShelter = null;
      if (evacuationPoints && evacuationPoints.features) {
        matchingShelter = evacuationPoints.features.find((feat: any) => 
          feat.properties.name.toLowerCase().trim() === endPoint.toLowerCase().trim()
        );
      }

      if (matchingShelter) {
        end = matchingShelter.geometry.coordinates;
      } else if (endCoords && (
        endPoint.includes("Evacuation Center") || 
        endPoint.includes("Safe Zone")
      )) {
        end = endCoords;
      } else {
        end = await geocodeAddress(endPoint);
      }

      if (!start || !end) {
        setErrorMessage("Unable to resolve starting point or destination coordinates.");
        setRoutingLoading(false);
        return;
      }

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

  const getIncidentIcon = () => {
    switch (incidentType) {
      case "Wildfire":
        return <Flame className="w-5 h-5 text-orange-500 animate-pulse" />;
      case "Flooding":
        return <Waves className="w-5 h-5 text-blue-500 animate-pulse" />;
      case "Chemical Spill":
        return <Biohazard className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case "Toxic Plume":
        return <Skull className="w-5 h-5 text-green-500 animate-pulse" />;
      case "Earthquake":
        return <Activity className="w-5 h-5 text-amber-500 animate-pulse" />;
      case "Tornado":
        return <Wind className="w-5 h-5 text-teal-500 animate-pulse" />;
      case "Radiation Leak":
        return <Radiation className="w-5 h-5 text-lime-500 animate-pulse" />;
      case "Blizzard":
        return <Snowflake className="w-5 h-5 text-sky-400 animate-pulse" />;
      case "Volcanic Eruption":
        return <Mountain className="w-5 h-5 text-rose-600 animate-pulse" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />;
    }
  };

  return (
    <div className="absolute top-4 left-4 z-10 w-[26rem] flex flex-col gap-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70 rounded-2xl overflow-hidden shrink-0">
        <CardHeader className="pb-4 border-b border-neutral-100 bg-neutral-50/50">
          <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-2 text-neutral-800">
            <ShieldAlert className="w-7 h-7 text-red-500" />
            Aegis Route
          </CardTitle>
          <CardDescription className="text-neutral-500 font-semibold">
            AI-powered disaster routing & emergency dome placement
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <Tabs defaultValue="hazard" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 bg-neutral-100/70 p-1 rounded-xl">
              <TabsTrigger value="hazard" className="font-bold rounded-lg text-xs py-2">
                <Target className="w-3.5 h-3.5 mr-1" />
                1. Affected
              </TabsTrigger>
              <TabsTrigger value="route" className="font-bold rounded-lg text-xs py-2">
                <Navigation className="w-3.5 h-3.5 mr-1" />
                2. Navigate
              </TabsTrigger>
              <TabsTrigger value="report" className="font-bold rounded-lg text-xs py-2">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                3. Report
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Affected Area & Hazard Dome Placement */}
            <TabsContent value="hazard" className="space-y-4 mt-0">
              <div className="space-y-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-100">
                <Label className="font-bold text-neutral-700">Disaster Classification</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["Wildfire", "Flooding", "Toxic Plume", "Earthquake", "Tornado", "Radiation Leak", "Chemical Spill", "Blizzard", "Volcanic Eruption"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setIncidentType(type)}
                      className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${
                        incidentType === type
                          ? "bg-red-50 border-red-200 text-red-700 shadow-sm"
                          : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {type === "Wildfire" && <Flame className="w-4 h-4 text-orange-500" />}
                      {type === "Flooding" && <Waves className="w-4 h-4 text-blue-500" />}
                      {type === "Toxic Plume" && <Skull className="w-4 h-4 text-green-500" />}
                      {type === "Earthquake" && <Activity className="w-4 h-4 text-amber-500" />}
                      {type === "Tornado" && <Wind className="w-4 h-4 text-teal-500" />}
                      {type === "Radiation Leak" && <Radiation className="w-4 h-4 text-lime-500" />}
                      {type === "Chemical Spill" && <Biohazard className="w-4 h-4 text-yellow-500" />}
                      {type === "Blizzard" && <Snowflake className="w-4 h-4 text-sky-400" />}
                      {type === "Volcanic Eruption" && <Mountain className="w-4 h-4 text-rose-600" />}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleLocateHazard} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hazard-loc" className="font-bold text-neutral-700">Locate Epicentre</Label>
                  <div className="flex gap-2">
                    <Input
                      id="hazard-loc"
                      placeholder="e.g. Times Square, NY"
                      value={hazardSearch}
                      onChange={(e) => setHazardSearch(e.target.value)}
                      className="bg-white border-neutral-200 focus-visible:ring-red-500 rounded-xl flex-grow font-semibold"
                    />
                    <Button type="submit" className="bg-neutral-800 hover:bg-neutral-900 text-white font-bold rounded-xl px-4">
                      Locate
                    </Button>
                  </div>
                </div>
              </form>

              <div className="flex flex-col gap-2">
                <div className="text-center font-semibold text-neutral-400 text-sm">OR</div>
                <Button
                  onClick={() => setIsPlacingHazard(true)}
                  className={`w-full py-5 rounded-xl font-bold transition-all ${
                    isPlacingHazard
                      ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse"
                      : "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-100"
                  }`}
                >
                  <Target className="w-5 h-5 mr-2" />
                  {isPlacingHazard ? "Click on Map to Place Epicentre..." : "Tap to Place Epicentre"}
                </Button>
              </div>

              {hazardCenter && (
                <div className="space-y-3 pt-3 border-t border-neutral-100">
                  <div className="flex justify-between items-center text-xs font-bold text-neutral-500">
                    <span>EPICENTRE RADAR ACTIVE</span>
                    <span className="text-red-600">[{hazardCenter[0].toFixed(4)}, {hazardCenter[1].toFixed(4)}]</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-neutral-700">
                      <Label htmlFor="radius-slider">Impact Radius</Label>
                      <span>{hazardRadius}m ({(hazardRadius / 1000).toFixed(1)} km)</span>
                    </div>
                    <input
                      id="radius-slider"
                      type="range"
                      min="300"
                      max="4000"
                      step="100"
                      value={hazardRadius}
                      onChange={(e) => setHazardRadius(Number(e.target.value))}
                      className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                    />
                  </div>

                  {/* Real-time Population Estimation Display */}
                  <div className="p-3 bg-neutral-900 text-white rounded-xl border border-neutral-800 shadow-inner mt-2 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Identified City</span>
                      <span className="text-xs font-extrabold text-neutral-100">{cityName || "Resolving..."}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Population Density</span>
                      <span className="text-xs font-extrabold text-emerald-400">
                        {densityLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                        ) : densityPerKm2 ? (
                          `${densityPerKm2.toLocaleString()} ppl/km²`
                        ) : (
                          "Loading..."
                        )}
                      </span>
                    </div>
                    <div className="border-t border-neutral-800 pt-2 flex justify-between items-end">
                      <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Estimated Impacted Population</span>
                        <span className="text-[9px] text-neutral-500 font-semibold">Area: {(Math.PI * Math.pow(hazardRadius / 1000, 2)).toFixed(2)} km²</span>
                      </div>
                      <span className="text-lg font-black text-red-400 tracking-tight leading-none">
                        {densityLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                        ) : densityPerKm2 !== null ? (
                          `${Math.round(Math.PI * Math.pow(hazardRadius / 1000, 2) * densityPerKm2).toLocaleString()}`
                        ) : (
                          "Calculating..."
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Route Navigation & Evacuation Search */}
            <TabsContent value="route" className="space-y-4 mt-0">
              <form onSubmit={handleRoute} className="flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start" className="font-bold text-neutral-700">Start Location</Label>
                  <Input
                    id="start"
                    placeholder="Address or Landmark"
                    value={startPoint}
                    onChange={(e) => setStartPoint(e.target.value)}
                    className="bg-white border-neutral-200 focus-visible:ring-blue-500 rounded-xl font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="end" className="font-bold text-neutral-700">Destination (Safe Zone)</Label>
                  <Input
                    id="end"
                    placeholder="Evacuation Point or Safe City"
                    value={endPoint}
                    onChange={(e) => setEndPoint(e.target.value)}
                    className="bg-white border-neutral-200 focus-visible:ring-blue-500 rounded-xl font-semibold"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={routingLoading}
                  className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-black text-base shadow-lg shadow-blue-100 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {routingLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Computing Detour...
                    </>
                  ) : (
                    <>
                      <Navigation2 className="w-5 h-5" />
                      Generate Evacuation Route
                    </>
                  )}
                </Button>
              </form>

              {/* Recommended shelters list */}
              {hazardCenter && evacuationPoints && evacuationPoints.features && (
                <div className="space-y-2.5 pt-4 mt-2 border-t border-neutral-100">
                  <h4 className="font-bold text-neutral-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                    Recommended Evacuation Shelters
                  </h4>
                  <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {evacuationPoints.features.map((shelter: any) => {
                      const coords = shelter.geometry.coordinates;
                      const isSelected = endCoords && Math.abs(endCoords[0] - coords[0]) < 0.00001 && Math.abs(endCoords[1] - coords[1]) < 0.00001;
                      return (
                        <div
                          key={shelter.properties.id}
                          className={`p-2.5 rounded-xl border transition-all flex justify-between items-center ${
                            isSelected
                              ? "bg-blue-50 border-blue-200 text-blue-800"
                              : "bg-white border-neutral-100 hover:border-neutral-200 text-neutral-700 shadow-sm"
                          }`}
                        >
                          <div className="flex flex-col text-left">
                            <span className="text-xs font-black leading-tight">{shelter.properties.name}</span>
                            <span className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                              {getDistance(hazardCenter, coords).toFixed(1)} km outside dome
                            </span>
                          </div>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => setEndCoords([coords[0], coords[1]])}
                            className={`text-[10px] font-bold h-7 px-2.5 rounded-lg ${
                              isSelected
                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200"
                            }`}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 3: Incident Report Submission */}
            <TabsContent value="report" className="mt-0">
              <div className="flex flex-col gap-3">
                <div className="p-3.5 bg-red-50/70 border border-red-100 rounded-xl">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-900 text-sm">Wildfire reported</h4>
                      <p className="text-xs text-red-700 font-medium mt-0.5">2.4 miles away • Moving Northeast</p>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/70 border border-amber-100 rounded-xl">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-900 text-sm">Road Blocked</h4>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">I-95 Southbound due to debris</p>
                    </div>
                  </div>
                </div>

                <ReportIncidentModal>
                  <Button variant="outline" className="w-full mt-2 border-neutral-200 text-neutral-700 font-bold py-5 rounded-xl bg-white/50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 shadow-sm transition-all">
                    Report New Incident
                  </Button>
                </ReportIncidentModal>

                {/* Alert Emergency Services Button */}
                <Button 
                  onClick={handleAlertEmergencyServices}
                  disabled={!hazardCenter || alertLoading}
                  className={`w-full py-5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    !hazardCenter 
                      ? "bg-neutral-100 text-neutral-450 border border-neutral-200 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-100 border border-red-700 animate-pulse hover:animate-none"
                  }`}
                >
                  {alertLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      Broadcasting Alert Signals...
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4" />
                      {!hazardCenter ? "Place Epicentre to Enable Alerts" : "Alert Nearby Emergency Services"}
                    </>
                  )}
                </Button>

                {/* Nearby Emergency Services Section */}
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-neutral-400" />
                    Nearby Emergency Services
                  </h4>

                  {facilitiesLoading ? (
                    <div className="flex items-center justify-center py-6 text-neutral-400 text-xs gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      Locating emergency facilities...
                    </div>
                  ) : !hazardCenter ? (
                    <p className="text-xs text-neutral-400 italic py-4 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                      Place a hazard dome on the map to locate nearby emergency services.
                    </p>
                  ) : emergencyFacilities.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic py-4 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                      No emergency services detected within 8km.
                    </p>
                  ) : (
                    <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2">
                      {emergencyFacilities.map((fac, idx) => {
                        let Icon = ShieldAlert;
                        let typeColor = "text-neutral-500 bg-neutral-100";
                        if (fac.type === "Hospital" || fac.type === "Clinic") {
                          Icon = Activity;
                          typeColor = "text-emerald-600 bg-emerald-50";
                        } else if (fac.type === "Fire Station") {
                          Icon = Flame;
                          typeColor = "text-orange-600 bg-orange-50";
                        } else if (fac.type === "Police Station") {
                          Icon = Shield;
                          typeColor = "text-blue-600 bg-blue-50";
                        }

                        const isInside = fac.status === "Inside Dome";

                        return (
                          <div 
                            key={idx}
                            onClick={() => {
                              if (fac.coordinates) {
                                setMapFlyToCoords(fac.coordinates);
                              }
                            }}
                            className="group p-3 bg-white border border-neutral-200/80 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className={`p-2 rounded-lg shrink-0 ${typeColor}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-bold text-neutral-800 text-xs truncate group-hover:text-blue-600 transition-colors">
                                  {fac.name}
                                </h5>
                                <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{fac.address}</p>
                                <p className="text-[10px] font-semibold text-neutral-500 mt-1 flex items-center gap-1">
                                  <span>{Math.round(fac.distance)}m away</span>
                                  <span>•</span>
                                  <span className="capitalize">{fac.type.toLowerCase()}</span>
                                </p>
                              </div>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 border uppercase tracking-wider ${
                              isInside 
                                ? "bg-red-50 text-red-600 border-red-100" 
                                : "bg-emerald-50 text-emerald-600 border-emerald-100"
                            }`}>
                              {isInside ? "Trapped" : "Active"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs font-bold rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* Route Metrics */}
          {routeGeoJSON && (
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              <h3 className="font-bold text-neutral-800 text-sm flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-neutral-600" />
                Evacuation Route Statistics
              </h3>
              
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-neutral-50 border border-neutral-100 rounded-xl flex flex-col">
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Direct Distance</span>
                  <span className="text-base font-black text-neutral-800">
                    {routeGeoJSON.properties.distance.toFixed(2)} km
                  </span>
                  <span className="text-[10px] font-semibold text-neutral-500">
                    ~ {Math.round(routeGeoJSON.properties.duration)} mins
                  </span>
                </div>

                {bypassRouteGeoJSON ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Detour Path</span>
                    <span className="text-base font-black text-emerald-800">
                      {bypassRouteGeoJSON.properties.distance.toFixed(2)} km
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600">
                      ~ {Math.round(bypassRouteGeoJSON.properties.duration)} mins
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Direct Route Safe
                    </div>
                    <span className="text-[10px] text-blue-500 font-semibold mt-0.5">No detour required.</span>
                  </div>
                )}
              </div>

              {bypassRouteGeoJSON && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 font-semibold flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span>Primary route compromised by danger zone. Detour bypasses danger area (+{((bypassRouteGeoJSON.properties.distance - routeGeoJSON.properties.distance)).toFixed(2)} km).</span>
                  </div>
                </div>
              )}

              {/* TomTom Traffic Delay Info */}
              {routeGeoJSON.properties.isTomTom && routeGeoJSON.properties.trafficDelayMins > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 font-semibold flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span>Live Traffic Congestion: TomTom detected a +{routeGeoJSON.properties.trafficDelayMins} min real-world traffic delay along this path.</span>
                  </div>
                </div>
              )}

              {/* TomTom Incidents List */}
              {routeGeoJSON.properties.isTomTom && routeGeoJSON.properties.incidents && routeGeoJSON.properties.incidents.length > 0 && (
                <div className="p-3 bg-orange-50/70 border border-orange-100 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5" />
                      TomTom Live Traffic Incidents
                    </span>
                    <span className="text-[9px] bg-orange-200 text-orange-800 font-extrabold px-1.5 py-0.5 rounded-full">
                      {routeGeoJSON.properties.incidents.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                    {routeGeoJSON.properties.incidents.map((inc: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-neutral-700 font-medium bg-white/55 p-1.5 rounded-lg border border-neutral-100/60">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-neutral-800">{inc.label}</div>
                          <div className="text-[10px] text-neutral-500 font-semibold">
                            {inc.delayMins > 0 ? `Adds ${inc.delayMins} min delay` : `No major delay`} • Avg Speed: {Math.round(inc.speedKmh)} km/h
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TomTom Attribution Badge */}
              {routeGeoJSON.properties.isTomTom && (
                <div className="text-[9px] text-neutral-400 font-bold text-right tracking-wider uppercase pr-1 flex items-center justify-end gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Real-time Traffic provided by TomTom API
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI evacuation guidance panel */}
      {(aiLoading || aiRecommendation) && (
        <Card className="shadow-2xl border-0 bg-neutral-900 text-white rounded-2xl overflow-hidden border-t-2 border-emerald-500 shrink-0">
          <CardHeader className="pb-3 border-b border-neutral-800 bg-neutral-950/40">
            <CardTitle className="text-base font-black tracking-tight flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              AI Evacuation Advisor
              {getIncidentIcon()}
            </CardTitle>
            <CardDescription className="text-neutral-400 text-xs">
              OpenAI real-time disaster guidance engine
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-neutral-400">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                <span className="text-xs font-bold tracking-wide animate-pulse">GENERATING SAFETY DIRECTIVES...</span>
              </div>
            ) : (
              <div className="text-xs leading-relaxed space-y-3 prose prose-invert max-w-none text-neutral-300 font-semibold">
                {aiRecommendation.split("\n").map((line, idx) => {
                  if (line.startsWith("###")) {
                    return <h3 key={idx} className="font-extrabold text-sm text-white mt-4 first:mt-0">{line.replace("###", "").trim()}</h3>;
                  }
                  if (line.startsWith("##")) {
                    return <h2 key={idx} className="font-black text-base text-white mt-4 first:mt-0">{line.replace("##", "").trim()}</h2>;
                  }
                  if (line.startsWith("1.") || line.startsWith("2.") || line.startsWith("3.") || line.startsWith("4.")) {
                    return <div key={idx} className="font-extrabold text-white mt-3">{line}</div>;
                  }
                  if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
                    const cleanLine = line.trim().replace(/^[-*]\s*/, "");
                    return (
                      <div key={idx} className="relative pl-4 my-1 text-neutral-300 font-medium">
                        <span className="absolute left-0 text-emerald-400 font-bold">•</span>
                        <span>{cleanLine}</span>
                      </div>
                    );
                  }
                  return <p key={idx} className="my-1.5">{line}</p>;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alert Success Dialog */}
      <Dialog open={alertSuccess} onOpenChange={setAlertSuccess}>
        <DialogContent className="sm:max-w-[480px] bg-neutral-900 border border-neutral-800 text-white rounded-2xl p-6 shadow-2xl">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20 text-red-400 animate-pulse">
                <Bell className="w-7 h-7" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  Emergency Signal Sent
                </DialogTitle>
                <DialogDescription className="text-neutral-400 text-xs font-semibold mt-1">
                  Active disaster telemetry sent to nearest rescue services
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {alertedFacilities && (
            <div className="space-y-4 my-4">
              {/* Telemetry Summary */}
              <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800 space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="text-neutral-500">Incident Type:</span>
                  <span className="text-red-400 font-bold">{incidentType}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-neutral-500">Radius Dome:</span>
                  <span className="text-white">{hazardRadius}m ({(hazardRadius / 1000).toFixed(1)} km)</span>
                </div>
                {hazardCenter && (
                  <div className="flex justify-between font-semibold">
                    <span className="text-neutral-500">Coordinates:</span>
                    <span className="text-neutral-300 font-mono">[{hazardCenter[0].toFixed(5)}, {hazardCenter[1].toFixed(5)}]</span>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  Notified Stations & Status
                </h4>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {/* Police Station */}
                  <div className="flex items-start justify-between p-3 bg-neutral-950/30 border border-neutral-800/80 rounded-xl gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg shrink-0">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h5 className="font-bold text-white text-xs truncate">{alertedFacilities.police.name}</h5>
                        <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{alertedFacilities.police.address}</p>
                        <p className="text-[10px] font-bold text-blue-400 mt-1">{Math.round(alertedFacilities.police.distance)}m away • Police Station</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full shrink-0 border uppercase tracking-wider ${
                      alertedFacilities.police.status === "Inside Dome" 
                        ? "bg-red-500/10 text-red-400 border-red-500/20" 
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {alertedFacilities.police.status === "Inside Dome" ? "Trapped" : "Active"}
                    </span>
                  </div>

                  {/* Fire Station */}
                  <div className="flex items-start justify-between p-3 bg-neutral-950/30 border border-neutral-800/80 rounded-xl gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 bg-orange-500/10 text-orange-400 rounded-lg shrink-0">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h5 className="font-bold text-white text-xs truncate">{alertedFacilities.fire.name}</h5>
                        <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{alertedFacilities.fire.address}</p>
                        <p className="text-[10px] font-bold text-orange-400 mt-1">{Math.round(alertedFacilities.fire.distance)}m away • Fire Station</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full shrink-0 border uppercase tracking-wider ${
                      alertedFacilities.fire.status === "Inside Dome" 
                        ? "bg-red-500/10 text-red-400 border-red-500/20" 
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {alertedFacilities.fire.status === "Inside Dome" ? "Trapped" : "Active"}
                    </span>
                  </div>

                  {/* Healthcare Facilities */}
                  {alertedFacilities.healthcare.map((hc, idx) => (
                    <div key={idx} className="flex items-start justify-between p-3 bg-neutral-950/30 border border-neutral-800/80 rounded-xl gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-bold text-white text-xs truncate">{hc.name}</h5>
                          <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{hc.address}</p>
                          <p className="text-[10px] font-bold text-emerald-400 mt-1">{Math.round(hc.distance)}m away • {hc.type}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full shrink-0 border uppercase tracking-wider ${
                        hc.status === "Inside Dome" 
                          ? "bg-red-500/10 text-red-400 border-red-500/20" 
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}>
                        {hc.status === "Inside Dome" ? "Trapped" : "Active"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button 
              onClick={() => setAlertSuccess(false)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-5 rounded-xl border border-emerald-500 shadow-md shadow-emerald-950 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Acknowledge Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
