import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=green;orange;red&pagesize=30";
    console.log(`[GDACS API] Fetching live disaster data: ${url}`);
    
    const res = await fetch(url, {
      next: { revalidate: 300 } // cache for 5 minutes
    });

    if (!res.ok) {
      throw new Error(`GDACS server responded with status: ${res.status}`);
    }

    const data = await res.json();
    
    if (!data || !data.features || !Array.isArray(data.features)) {
      return NextResponse.json({ events: [] });
    }

    // Format events for client ingestion
    const events = data.features.map((feature: any) => {
      const props = feature.properties || {};
      const geom = feature.geometry || {};
      const coords = geom.coordinates; // [lng, lat]

      // Map GDACS codes to our internal disaster classifications
      let mappedType = "Other";
      if (props.eventtype === "TC") mappedType = "Tropical Cyclone";
      else if (props.eventtype === "EQ") mappedType = "Earthquake";
      else if (props.eventtype === "FL") mappedType = "Flooding";
      else if (props.eventtype === "WF") mappedType = "Wildfire";
      else if (props.eventtype === "VO") mappedType = "Volcanic Eruption";

      return {
        id: props.eventid || Math.random().toString(),
        name: props.eventname || "Unnamed Incident",
        gdacsType: props.eventtype || "OT",
        type: mappedType,
        alertLevel: (props.alertlevel || "green").toLowerCase(),
        date: props.todate || props.fromdate || "Recent",
        country: props.country || "International",
        coordinates: Array.isArray(coords) && coords.length === 2 ? [coords[0], coords[1]] : null
      };
    }).filter((evt: any) => evt.coordinates !== null);

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error("[GDACS API] Failed to fetch events:", error);
    return NextResponse.json(
      { error: "Failed to retrieve live GDACS disaster feed." },
      { status: 500 }
    );
  }
}
