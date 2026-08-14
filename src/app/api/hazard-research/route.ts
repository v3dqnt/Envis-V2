import { NextResponse } from "next/server";

/**
 * On-ground hazard research.
 *
 * The physical models in /api/hazard-zones predict where a hazard COULD strike from
 * terrain/weather data. This route answers a different question: what does the open
 * web actually say is happening or has happened there? It runs two Tavily searches
 * (recent news vs. general/historical), asks an LLM to pull out the specific named
 * sub-areas mentioned (not just "the city" as a whole), geocodes each one, and returns
 * them as small marker zones tagged "current" or "historical" — an on-ground report
 * layered next to the predictive polygons, not a replacement for them.
 */

type Status = "current" | "historical";
type Severity = "high" | "medium" | "low";

interface ResearchItem {
  areaName: string;
  status: Status;
  severity: Severity;
  summary: string;
  sourceUrl: string;
  sourceTitle: string;
}

// Search phrasing per hazard, matching how this actually gets reported/searched.
const QUERY_TERMS: Record<string, string> = {
  Wildfire: "wildfire fire burn area",
  Flooding: "water accumulation flooding flood",
  "Flash Flood": "flash flood flash flooding",
  Blizzard: "blizzard snowstorm snow accumulation",
  Landslide: "landslide mudslide slope failure",
};

const SUPPORTED_HAZARDS = new Set(Object.keys(QUERY_TERMS));

// Process-lifetime cache for the full route response. See the comment at the call site
// for why this exists — this route is the most expensive one in the app per call.
const RESULT_CACHE_TTL_MS = 30 * 60 * 1000;
const resultCache = new Map<string, { expires: number; body: any }>();

function getCached(key: string): any | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    resultCache.delete(key);
    return null;
  }
  return entry.body;
}

function setCached(key: string, body: any) {
  resultCache.set(key, { expires: Date.now() + RESULT_CACHE_TTL_MS, body });
  if (resultCache.size > 500) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
}

async function tavilySearch(apiKey: string, query: string, recentOnly: boolean) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: false,
        topic: recentOnly ? "news" : "general",
        ...(recentOnly ? { days: 30 } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.log(`[hazard-research] Tavily ${recentOnly ? "recent" : "general"} search -> HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.results || []) as { title: string; url: string; content: string; published_date?: string }[];
  } catch (err: any) {
    console.log(`[hazard-research] Tavily search failed: ${err.message}`);
    return [];
  }
}

async function extractAreas(
  openaiKey: string,
  hazardType: string,
  cityName: string,
  historicalResults: { title: string; url: string; content: string }[],
  currentResults: { title: string; url: string; content: string }[]
): Promise<ResearchItem[]> {
  if (historicalResults.length === 0 && currentResults.length === 0) return [];

  const formatBlock = (label: string, results: typeof historicalResults) =>
    results
      .map(
        (r, i) =>
          `[${label}-${i}] "${r.title}"\nURL: ${r.url}\n${r.content.slice(0, 700)}`
      )
      .join("\n\n");

  const prompt = `You are extracting specific affected sub-areas from web search results about ${hazardType} near ${cityName}.

CURRENT / RECENT NEWS RESULTS (last 30 days):
${formatBlock("news", currentResults) || "(none found)"}

GENERAL / HISTORICAL RESULTS:
${formatBlock("gen", historicalResults) || "(none found)"}

Only use results that are actually about ${cityName} or a place within/adjacent to it. Web search for this phrasing sometimes returns similar-sounding disasters from OTHER cities — if a result's location does not match ${cityName}, skip it entirely, even if the hazard type matches.

Extract distinct named sub-areas (neighborhoods, districts, roads, rivers, landmarks — NOT the city as a whole unless no finer area is mentioned) that these results say were or are affected by ${hazardType.toLowerCase()} IN OR NEAR ${cityName}. For each:
- areaName: the specific place name, written so it can be geocoded together with "${cityName}" (e.g. "Ravi River banks", "Old Town district", "Highway 9 underpass")
- status: "current" if from the recent-news results or describes an ongoing/recent event, "historical" if it describes a past/recurring pattern
- severity: "high" | "medium" | "low" based on how the source describes impact
- summary: one plain sentence, no more than 25 words
- sourceUrl: the URL of the result it came from
- sourceTitle: the title of that result

Only include areas you can point to a real result for. Skip vague or country-level mentions. Return at most 8 items, best/most specific first.

Respond with ONLY a JSON object: {"items": [...]}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      console.log(`[hazard-research] OpenAI extraction -> HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.filter(
      (it: any) =>
        typeof it.areaName === "string" &&
        typeof it.summary === "string" &&
        (it.status === "current" || it.status === "historical")
    );
  } catch (err: any) {
    console.log(`[hazard-research] Extraction failed: ${err.message}`);
    return [];
  }
}

/**
 * Nominatim geocode, biased toward the target city so short area names resolve
 * correctly. Requests the area's real OSM boundary (`polygon_geojson=1`) alongside
 * the centre point — a reported area is a named place with an actual shape, and
 * drawing it as a fixed-radius disc misrepresents both its extent and its outline.
 * When OSM has no boundary for the name, `geometry` stays null and the caller
 * renders a marker instead of inventing one.
 */
async function geocode(
  areaName: string,
  cityName: string
): Promise<{ coords: [number, number]; geometry: any | null } | null> {
  const attempts = [`${areaName}, ${cityName}`, areaName];
  for (const q of attempts) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&polygon_geojson=1`,
        { headers: { "User-Agent": "GAIA/1.0 (climate resilience mapping)" }, cache: "no-store" }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lon = parseFloat(data[0].lon);
        const lat = parseFloat(data[0].lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const gj = data[0].geojson;
        const geometry =
          gj && (gj.type === "Polygon" || gj.type === "MultiPolygon") ? gj : null;
        return { coords: [lon, lat], geometry };
      }
    } catch {
      /* try next attempt */
    }
  }
  return null;
}

/** Great-circle distance in km — used to drop geocoded points nowhere near the target
 * (a search/LLM step can surface real flooding news from an unrelated city that just
 * happens to share generic phrasing; this is the hard geographic backstop). */
function distanceKm(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function POST(req: Request) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!tavilyKey) {
    return NextResponse.json({ error: "TAVILY_API_KEY not configured" }, { status: 500 });
  }
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let lat: number, lng: number, hazardType: string, cityName: string;
  try {
    const body = await req.json();
    lat = body.lat;
    lng = body.lng;
    hazardType = body.hazardType;
    cityName = body.cityName || "the target location";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof lat !== "number" || typeof lng !== "number" || !hazardType) {
    return NextResponse.json({ error: "lat, lng, hazardType required" }, { status: 400 });
  }

  if (!SUPPORTED_HAZARDS.has(hazardType)) {
    return NextResponse.json({
      hazardType,
      supported: false,
      note: `On-ground research is not wired up for "${hazardType}" yet.`,
      items: [],
      zones: [],
    });
  }

  // This is the single most expensive route in the app: two Tavily searches, one LLM
  // extraction call, and up to eight geocoding lookups, per analysis. Without reuse,
  // re-analyzing a location or a second user looking at the same city re-spends all of
  // that quota from scratch. Cached per rounded coordinates + hazard, process-lifetime.
  const key = `${hazardType}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = getCached(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const terms = QUERY_TERMS[hazardType];
  const query = `${cityName} ${terms}`;

  const [currentResults, historicalResults] = await Promise.all([
    tavilySearch(tavilyKey, query, true),
    tavilySearch(tavilyKey, query, false),
  ]);

  const extracted = await extractAreas(openaiKey, hazardType, cityName, historicalResults, currentResults);

  const geocoded = await Promise.all(
    extracted.map(async (item) => {
      const hit = await geocode(item.areaName, cityName);
      return hit ? { ...item, coords: hit.coords, geometry: hit.geometry } : null;
    })
  );

  // Hard geographic backstop: search phrasing can surface a real disaster from an
  // unrelated place that happens to match the hazard wording. Anything the LLM
  // extracted that doesn't actually geocode near the target is dropped here,
  // independent of what the LLM believed about relevance.
  const MAX_DISTANCE_KM = 120;
  const items = geocoded.filter(
    (x): x is ResearchItem & { coords: [number, number]; geometry: any | null } =>
      x !== null && distanceKm([lng, lat], x.coords) <= MAX_DISTANCE_KM
  );

  const zoneProps = (item: (typeof items)[number]) => ({
    hazardType,
    status: item.status,
    severity: item.severity,
    areaName: item.areaName,
    summary: item.summary,
    sourceUrl: item.sourceUrl,
    sourceTitle: item.sourceTitle,
  });

  // Areas with a real OSM boundary are drawn as that boundary. Areas without one
  // are emitted as points and drawn as markers — never as a synthetic disc that
  // would read as a measured footprint.
  const zones = items
    .filter((item) => item.geometry)
    .map((item) => ({
      type: "Feature" as const,
      geometry: item.geometry,
      properties: zoneProps(item),
    }));

  const markers = items
    .filter((item) => !item.geometry)
    .map((item) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: item.coords },
      properties: zoneProps(item),
    }));

  const responseBody = {
    hazardType,
    supported: true,
    cityName,
    query,
    resultCounts: { current: currentResults.length, historical: historicalResults.length },
    items: items.map(({ coords, geometry, ...rest }) => ({
      ...rest,
      lat: coords[1],
      lng: coords[0],
      hasBoundary: Boolean(geometry),
    })),
    zones,
    markers,
  };
  setCached(key, responseBody);
  return NextResponse.json(responseBody);
}
