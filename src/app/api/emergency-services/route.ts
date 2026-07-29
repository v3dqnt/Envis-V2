import { NextResponse } from "next/server";

// Under the hood, this API queries the TomTom POI Search engine to find real-world
// critical emergency services (hospitals, clinics, fire stations, and police stations) 
// surrounding the affected disaster area. It classifies their safety status (whether 
// they are trapped inside the active hazard dome or operate in the safe zone).

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

export async function POST(req: Request) {
  try {
    const { hazardCenter, hazardRadius } = await req.json();

    if (!hazardCenter || !Array.isArray(hazardCenter) || hazardCenter.length !== 2) {
      return NextResponse.json({ error: "Missing hazardCenter" }, { status: 400 });
    }

    const [lng, lat] = hazardCenter;
    const tomtomKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY || "fqSazhj2APo816F2cBqqxI0e4GqatpEh";

    console.log(`[Emergency Engine] Locating critical services around [${lng}, ${lat}]...`);

    const categories = [
      { key: "hospital", label: "Hospital" },
      { key: "clinic", label: "Clinic" },
      { key: "fire station", label: "Fire Station" },
      { key: "police station", label: "Police Station" }
    ];

    // Query TomTom POI search for each category concurrently
    const apiResults = await Promise.all(
      categories.map(async (cat) => {
        try {
          const url = `https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(cat.key)}.json?key=${tomtomKey}&lat=${lat}&lon=${lng}&radius=8000&limit=8`;
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return (data.results || []).map((item: any) => ({
            ...item,
            _catLabel: cat.label
          }));
        } catch (e) {
          console.error(`[Emergency Engine] Failed to fetch POIs for category "${cat.key}":`, e);
          return [];
        }
      })
    );

    const allPois = apiResults.flat();
    const uniquePoisMap = new Map<string, any>();

    for (const item of allPois) {
      if (item.poi && item.position) {
        const key = `${item.position.lat.toFixed(5)},${item.position.lon.toFixed(5)}`;
        // If there's a duplicate, keep the one with higher score or keep the first one
        if (!uniquePoisMap.has(key)) {
          uniquePoisMap.set(key, item);
        }
      }
    }

    const uniquePois = Array.from(uniquePoisMap.values());

    const facilities = uniquePois.map((item) => {
      const pLat = item.position.lat;
      const pLon = item.position.lon;
      const dist = getDistanceMeters(lat, lng, pLat, pLon);
      const isInside = dist <= hazardRadius;

      return {
        name: item.poi.name,
        type: item._catLabel,
        distance: dist,
        coordinates: [pLon, pLat],
        address: item.address?.freeformAddress || item.address?.localName || "Nearby Area",
        status: isInside ? "Inside Dome" : "Safe Zone"
      };
    });

    // Sort facilities by proximity to epicentre
    facilities.sort((a, b) => a.distance - b.distance);

    console.log(`[Emergency Engine] Found ${facilities.length} emergency facilities nearby.`);

    return NextResponse.json({ facilities });
  } catch (error: any) {
    console.error("[Emergency Engine] Fatal error fetching emergency services:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
