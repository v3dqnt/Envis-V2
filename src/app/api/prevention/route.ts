import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(req: Request) {
  try {
    const {
      incidentType,
      cityName,
      activeDefenses,
      densityPerKm2,
      weatherRisk,
      satelliteFire,
      airQuality,
    } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { 
          strategyMarkdown: "### OpenAI API Key Missing\nPlease configure your `OPENAI_API_KEY` in `.env.local` to receive AI-powered disaster prevention strategy analyses.",
          checklist: [
            "Clear gutters and remove dry leaf accumulation.",
            "Establish a 30-meter defensible space boundary around buildings.",
            "Verify backup emergency generator fuel supplies.",
            "Conduct drills for emergency evacuation routes."
          ],
          vulnerabilityMetrics: {
            infrastructure: 55,
            residential: 60,
            evacuationReadiness: 50
          }
        },
        { status: 200 }
      );
    }

    // Build weather context block if available
    let weatherContext = "";
    if (weatherRisk) {
      const { historical, recent, risks } = weatherRisk;
      const riskList = risks
        .map((r: any) => `  - ${r.type} (${r.confidence} confidence): ${r.historicalBasis}${r.recentSignal ? `. RECENT SIGNAL: ${r.recentSignal}` : ""}`)
        .join("\n");
      weatherContext = `
OPEN-METEO CLIMATE INTELLIGENCE (${historical.yearsAnalyzed} years of archive, ${historical.startYear}–${historical.endYear}):
Historical extremes:
  - Peak single-day rainfall: ${historical.maxDailyPrecipMm.toFixed(0)}mm
  - Max recorded temperature: ${historical.maxTempC.toFixed(1)}°C
  - Min recorded temperature: ${historical.minTempC.toFixed(1)}°C
  - Max wind speed: ${historical.maxWindKmh.toFixed(0)} km/h
  - Max daily snowfall: ${historical.maxDailySnowCm.toFixed(0)}cm
  - Annual avg precipitation: ${historical.annualAvgPrecipMm.toFixed(0)}mm/year

Recent ${recent.days}-day conditions:
  - Total precipitation: ${recent.totalPrecipMm.toFixed(0)}mm
  - Peak temperature: ${recent.maxTempC.toFixed(1)}°C
  - Peak wind: ${recent.maxWindKmh.toFixed(0)} km/h
  - Snowfall: ${recent.totalSnowCm.toFixed(0)}cm

Climate-derived disaster risk signals:
${riskList || "  - No statistically significant risk signals detected"}

Use this climate data as the PRIMARY basis for your analysis. The user-selected threat (${incidentType}) may be overridden or supplemented by the climate evidence above.`;
    }

    // Build satellite fire detection context if available
    let satelliteContext = "";
    if (satelliteFire?.available) {
      if (satelliteFire.hotspotCount > 0) {
        satelliteContext = `\nNASA FIRMS SATELLITE FIRE DETECTION (VIIRS, last 24h, 50km radius): ${satelliteFire.hotspotCount} active fire hotspot(s) detected, nearest ${satelliteFire.nearestDistanceKm.toFixed(1)}km away.`;
      } else {
        satelliteContext = `\nNASA FIRMS SATELLITE FIRE DETECTION: No active fire hotspots detected within 50km in the last 24h.`;
      }
    }

    // Build ground air-quality sensor context if available
    let airQualityContext = "";
    if (airQuality?.available) {
      airQualityContext = `\nGROUND AIR-QUALITY SENSOR (OpenAQ, nearest station "${airQuality.stationName}", ${airQuality.distanceKm?.toFixed(1)}km away): ${airQuality.parameter.toUpperCase()} = ${airQuality.value} ${airQuality.units}${airQuality.category ? ` (${airQuality.category})` : ""}.`;
    }

    const materialsReference = `
ADVANCED MATERIALS REFERENCE (cite specific materials by name wherever relevant to ${incidentType} — do not just say "better materials", name the actual material class):
- Cool roofs / Passive Daytime Radiative Cooling (PDRC) coatings — reflect and emit heat to cool below ambient temperature, reduce urban heat island and cooling demand. Relevant to: Heatwave, Drought, Wildfire.
- Superabsorbent polymers / hydrogels — improve soil water retention for agriculture and urban green spaces during extended dry periods. Relevant to: Drought.
- Permeable pavements — allow stormwater infiltration, reduce surface runoff and flooding, recharge groundwater (clogging/maintenance is a known tradeoff). Relevant to: Flooding, Heavy Rainfall, Thunderstorm.
- Fiber-reinforced polymer (FRP) retrofitting and hydrophobic/corrosion-resistant coatings — strengthen and waterproof existing bridges, buildings and coastal infrastructure without full replacement. Relevant to: Flooding, Tropical Cyclone, Landslide, Extreme Cold.
- Fire-retardant building materials and impact-resistant composites — defensible structural protection in fire-prone areas. Relevant to: Wildfire.`;

    const prompt = `You are Aegis Mitigation Engine, an AI disaster prevention and structural safety auditor.
Analyze the threat profile for the following context:
- Primary Disaster Threat: ${incidentType}
- Target Region/City: ${cityName || "Local Area"}
- Active Countermeasures: ${activeDefenses.join(", ") || "None"}
- Local Population Density: ${densityPerKm2 || "Unknown"} people/km²
${weatherContext}
${satelliteContext}
${airQualityContext}
${materialsReference}

Perform these tasks:
1. Based on ALL available evidence (climate data + selected threat), identify the top 1-3 most likely disaster types for this location and explain why.
2. Estimate the vulnerability scores (from 0 to 100, where 100 is highly vulnerable) for:
   a) Infrastructure Vulnerability
   b) Residential Vulnerability
   c) Evacuation Bottleneck Risk
3. Create a prioritized 5-item emergency preparation checklist for local engineers, specific to this location's actual climate history. Where a specific material from the reference list applies, name it explicitly in the checklist item.
4. Write a concise, highly strategic mitigation directive (in Markdown format) referencing the specific weather patterns and historical extremes, outlining structural reinforcement steps, buffer zone creations, sensor grid placements, and specific advanced materials from the reference list above where applicable.

Output your response strictly as a JSON object with this schema:
{
  "vulnerabilityMetrics": {
    "infrastructure": number,
    "residential": number,
    "evacuationReadiness": number
  },
  "checklist": [string],
  "strategyMarkdown": string
}

Do not include any explanation or markdown formatting outside the JSON. The output must be valid JSON only.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are Aegis Mitigation Engine, an elite structural safety auditor. You return only valid JSON matching the requested schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI Prevention endpoint error:", error);
    return NextResponse.json(
      { 
        strategyMarkdown: `### Mitigation Analysis Failed\nAn error occurred while generating structural directives: ${error.message}`,
        checklist: [],
        vulnerabilityMetrics: { infrastructure: 50, residential: 50, evacuationReadiness: 50 }
      },
      { status: 500 }
    );
  }
}
