import { NextResponse } from "next/server";

// We represent coordinates as simple [lng, lat] arrays, adhering to standard GeoJSON specification.
// Under the hood, this API queries the TomTom Category Search engine to fetch actual, real-world
// venues (schools, stadiums, parks, community centers) surrounding the disaster epicentre.
// We then classify these venues into cardinal directions (North, South, East, West) and select 
// the closest safe shelter in each direction to optimize travel times for evacuees.

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getDirection(lat1: number, lon1: number, lat2: number, lon2: number): "North" | "South" | "East" | "West" {
  const dy = lat2 - lat1;
  const dx = lon2 - lon1;
  // Math.atan2 returns the angle in radians in the range [-PI, PI].
  // We multiply by 180/PI to convert to degrees and normalize to [0, 360).
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const normalized = angle < 0 ? angle + 360 : angle;
  
  if (normalized >= 45 && normalized < 135) return "North";
  if (normalized >= 135 && normalized < 225) return "West";
  if (normalized >= 225 && normalized < 315) return "South";
  return "East";
}

export async function POST(req: Request) {
  try {
    const { hazardCenter, hazardRadius } = await req.json();

    if (!hazardCenter || !Array.isArray(hazardCenter) || hazardCenter.length !== 2) {
      return NextResponse.json({ error: "Missing hazardCenter" }, { status: 400 });
    }

    const [lng, lat] = hazardCenter;
    const tomtomKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "fqSazhj2APo816F2cBqqxI0e4GqatpEh";

    console.log(`[Shelter Engine] Locating real-world shelters around [${lng}, ${lat}] with dome radius ${hazardRadius}m...`);

    // Dynamically scale search radius to encompass the dome radius plus a generous search buffer (e.g. 5km)
    // We cap it at 20km to ensure responsive API latencies.
    const searchRadius = Math.min(Math.max(hazardRadius + 5000, 10000), 20000);
    const categories = ["school", "stadium", "park", "community center"];

    // Fetch POIs across key shelter categories concurrently
    const apiResults = await Promise.all(
      categories.map(async (cat) => {
        try {
          const url = `https://api.tomtom.com/search/2/categorySearch/${encodeURIComponent(cat)}.json?key=${tomtomKey}&lat=${lat}&lon=${lng}&radius=${searchRadius}&limit=15`;
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return data.results || [];
        } catch (e) {
          console.error(`[Shelter Engine] Failed to fetch POIs for category "${cat}":`, e);
          return [];
        }
      })
    );

    // Flatten and de-duplicate POIs by coordinates to prevent identical facilities from clogging multiple directions
    const allPois = apiResults.flat();
    const uniquePoisMap = new Map<string, any>();
    for (const item of allPois) {
      if (item.poi && item.position) {
        const key = `${item.position.lat.toFixed(5)},${item.position.lon.toFixed(5)}`;
        if (!uniquePoisMap.has(key)) {
          uniquePoisMap.set(key, item);
        }
      }
    }
    const uniquePois = Array.from(uniquePoisMap.values());

    // Group POIs into cardinal direction buckets
    const groups: Record<"North" | "South" | "East" | "West", any[]> = {
      North: [],
      South: [],
      East: [],
      West: []
    };

    for (const poi of uniquePois) {
      const pLat = poi.position.lat;
      const pLon = poi.position.lon;
      const dist = getDistanceMeters(lat, lng, pLat, pLon);

      // Heuristic: The shelter must be strictly outside the hazard dome
      if (dist <= hazardRadius) continue;

      const dir = getDirection(lat, lng, pLat, pLon);
      groups[dir].push({
        name: poi.poi.name,
        coordinates: [pLon, pLat],
        direction: dir,
        distance: dist,
        categories: poi.poi.categories || []
      });
    }

    const selectedShelters: any[] = [];
    const directions: ("North" | "South" | "East" | "West")[] = ["North", "South", "East", "West"];

    for (const dir of directions) {
      const candidates = groups[dir];
      if (candidates.length > 0) {
        // Sort candidates by proximity to get the closest safe shelter in this direction
        candidates.sort((a, b) => a.distance - b.distance);
        const best = candidates[0];

        let categoryLabel = best.categories[0] || "Public Facility";
        categoryLabel = categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1);

        selectedShelters.push({
          id: dir.toLowerCase(),
          name: best.name,
          coordinates: best.coordinates,
          direction: best.direction,
          reason: `Real-world ${categoryLabel} located ${Math.round(best.distance)}m from epicentre.`
        });
      }
    }

    // Mathematical fallback: In case we can't find real-world POIs in a particular direction 
    // (e.g. ocean, unpopulated regions, API failure), we generate a standard geometric fallback 
    // to guarantee exactly 4 shelters are returned for map rendering.
    const distMeters = hazardRadius + 1500;
    const deltaLat = distMeters / 110574;
    const deltaLng = distMeters / (111320 * Math.cos((lat * Math.PI) / 180));

    const mathematicalFallbacks = {
      north: {
        id: "north",
        name: "Evacuation Center North (Fallback)",
        coordinates: [lng, lat + deltaLat],
        direction: "North",
        reason: "Safe zone located outside hazard boundary."
      },
      south: {
        id: "south",
        name: "Evacuation Center South (Fallback)",
        coordinates: [lng, lat - deltaLat],
        direction: "South",
        reason: "Large capacity public facility."
      },
      east: {
        id: "east",
        name: "Evacuation Center East (Fallback)",
        coordinates: [lng + deltaLng, lat],
        direction: "East",
        reason: "Equipped with power generators."
      },
      west: {
        id: "west",
        name: "Evacuation Center West (Fallback)",
        coordinates: [lng - deltaLng, lat],
        direction: "West",
        reason: "Open air zone with water supply."
      }
    } as const;

    const finalShelters = directions.map((dir) => {
      const found = selectedShelters.find((s) => s.direction === dir);
      if (found) return found;
      return mathematicalFallbacks[dir.toLowerCase() as keyof typeof mathematicalFallbacks];
    });

    const safeCandidates = uniquePois.map(poi => {
      const pLat = poi.position.lat;
      const pLon = poi.position.lon;
      const dist = getDistanceMeters(lat, lng, pLat, pLon);
      return {
        name: poi.poi.name,
        coordinates: [pLon, pLat],
        distance: dist,
        categories: poi.poi.categories || []
      };
    }).filter(poi => poi.distance > hazardRadius);

    console.log(`[Shelter Engine] All available safe shelters near the affected area (${safeCandidates.length} found):`);
    safeCandidates.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.name} (${s.categories.join(", ")}) - ${Math.round(s.distance)}m away at [${s.coordinates.join(", ")}]`);
    });

    console.log(`[Shelter Engine] Successfully located ${selectedShelters.length} real-world POIs and ${4 - selectedShelters.length} fallbacks.`);

    return NextResponse.json({ 
      shelters: finalShelters,
      allAvailableShelters: safeCandidates
    });
  } catch (error: any) {
    console.error("[Shelter Engine] Fatal error calculating evacuation shelters:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

