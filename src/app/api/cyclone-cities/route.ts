import { NextResponse } from "next/server";
import OpenAI from "openai";

export interface CityRisk {
  name: string;
  country: string | null;
  population: number | null;
  impactLevel: "catastrophic" | "severe" | "moderate" | "watch";
  risks: string[];
  summary: string;
  coordinates: [number, number];
}

// Basin-aware 72-hour forecast track (7 points, 12h apart)
function forecastTrackPoints(lng: number, lat: number): [number, number][] {
  const isNH = lat > 0;
  const latStep = isNH ? 1.4 : -1.4;
  const lngStep = isNH
    ? lng < -30 ? 0.9 : -0.5
    : lng > 100 ? -0.6 : 0.8;
  const pts: [number, number][] = [[lng, lat]];
  for (let i = 1; i <= 6; i++) pts.push([lng + lngStep * i, lat + latStep * i]);
  return pts;
}

// Reverse-geocode each track point using MapTiler and collect unique cities/regions
async function findCitiesAlongTrack(track: [number, number][]): Promise<any[]> {
  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  if (!mapTilerKey) return [];

  const seen = new Set<string>();
  const cities: any[] = [];

  await Promise.all(
    track.map(async ([lng, lat]) => {
      try {
        const res = await fetch(
          `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${mapTilerKey}&language=en`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const features: any[] = data.features || [];

        // Prefer municipality > place > region
        const placeFeature =
          features.find((f) =>
            ["municipality", "city", "place", "town"].some((t) =>
              (f.place_type || []).includes(t)
            )
          ) || features[0];

        if (!placeFeature) return;

        const cityName: string = placeFeature.text || placeFeature.place_name?.split(",")[0];
        const country: string | null =
          features.find((f) => (f.place_type || []).includes("country"))?.text || null;

        if (!cityName || seen.has(cityName.toLowerCase())) return;
        seen.add(cityName.toLowerCase());

        cities.push({
          name: cityName,
          country,
          population: null,
          lat,
          lng,
        });
      } catch {
        // skip this point silently
      }
    })
  );

  return cities;
}

export async function POST(req: Request) {
  const { coordinates, windSpeed, name } = await req.json();
  const [lng, lat] = coordinates as [number, number];
  const track = forecastTrackPoints(lng, lat);

  const cities = await findCitiesAlongTrack(track);
  if (cities.length === 0) {
    return NextResponse.json({ cities: [] });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      cities: cities.map((c) => ({
        name: c.name,
        country: c.country,
        population: null,
        impactLevel: "watch" as const,
        risks: ["Strong winds", "Heavy rainfall"],
        summary: "City is within the forecast cone of this system.",
        coordinates: [c.lng, c.lat] as [number, number],
      })),
    });
  }

  const client = new OpenAI({ apiKey });

  const trackStr = track
    .map(([lo, la], i) => `T+${i * 12}h: ${la.toFixed(1)}°N ${lo.toFixed(1)}°E`)
    .join(" → ");

  const cityList = cities
    .map((c) => `${c.name}${c.country ? ` (${c.country})` : ""} at ${c.lat.toFixed(2)}°N ${c.lng.toFixed(2)}°E`)
    .join("\n");

  const prompt = `You are a disaster risk analyst assessing Tropical Cyclone ${name || "UNNAMED"}.

Wind speed: ${windSpeed ?? 100} km/h
72-hour forecast track: ${trackStr}

Cities/regions along the path:
${cityList}

For EACH location, assess the likely impact based on proximity to the track, coastal exposure, regional geography, and the cyclone's intensity. Consider storm surge for coastal cities, river flooding for inland ones.

Return ONLY a JSON array (no markdown, no explanation):
[{"name":"exact name from list","impactLevel":"catastrophic"|"severe"|"moderate"|"watch","risks":["2-4 specific risks"],"summary":"one sentence"}]`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
    });

    const raw = (completion.choices[0]?.message?.content || "[]")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```[\s\S]*$/i, "")
      .trim();

    const assessments: any[] = JSON.parse(raw);
    const assessMap = new Map(assessments.map((a) => [a.name, a]));

    const result: CityRisk[] = cities.map((c) => {
      const ai = assessMap.get(c.name);
      return {
        name: c.name,
        country: c.country,
        population: null,
        impactLevel: ai?.impactLevel ?? "watch",
        risks: ai?.risks ?? ["Strong winds", "Heavy rainfall"],
        summary: ai?.summary ?? "Within forecast cone of this system.",
        coordinates: [c.lng, c.lat] as [number, number],
      };
    });

    return NextResponse.json({ cities: result });
  } catch (err) {
    console.error("[cyclone-cities] AI error:", err);
    // Return cities with fallback assessment
    return NextResponse.json({
      cities: cities.map((c) => ({
        name: c.name,
        country: c.country,
        population: null,
        impactLevel: "watch" as const,
        risks: ["Strong winds", "Heavy rainfall", "Potential flooding"],
        summary: "Within the forecast cone — monitor official advisories.",
        coordinates: [c.lng, c.lat] as [number, number],
      })),
    });
  }
}
