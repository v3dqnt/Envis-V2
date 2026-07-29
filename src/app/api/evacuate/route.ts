import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(req: Request) {
  try {
    const { 
      incidentType, 
      startAddr, 
      endAddr, 
      startCoords, 
      endCoords, 
      hazardCenter, 
      hazardRadius, 
      primaryRouteCoords 
    } = await req.json();

    // Downsample coordinates to maximum 50 points to stay well within TPM rate limits
    let sampledRoute: [number, number][] = primaryRouteCoords || [];
    if (sampledRoute.length > 50) {
      const step = (sampledRoute.length - 1) / 49;
      const res: [number, number][] = [];
      for (let i = 0; i < 50; i++) {
        const idx = Math.min(Math.round(i * step), sampledRoute.length - 1);
        res.push(sampledRoute[idx]);
      }
      if (sampledRoute.length > 0) {
        res[res.length - 1] = sampledRoute[sampledRoute.length - 1];
      }
      sampledRoute = res;
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { 
          text: "### OpenAI API Key Missing\nPlease configure your `OPENAI_API_KEY` in `.env.local` to receive AI-powered evacuation guidance.",
          detourCoordinates: [],
          distanceKm: 0,
          durationMins: 0
        },
        { status: 200 }
      );
    }

    const prompt = `You are an emergency navigation engine. An active hazard zone exists.
Details:
- Incident Type: ${incidentType}
- Starting Location (Evacuation Source): ${startAddr || "Epicentre"} [Coordinates: ${JSON.stringify(startCoords)}]
- Destination (Safe Zone): ${endAddr || "Safe Zone"} [Coordinates: ${JSON.stringify(endCoords)}]
- Hazard Epicentre: [Coordinates: ${JSON.stringify(hazardCenter)}]
- Hazard Radius: ${hazardRadius} meters

The direct driving route coordinates are:
${JSON.stringify(sampledRoute)}

Tasks:
1. Analyze the direct route and identify where it intersects the hazard dome (radius of ${hazardRadius} meters around the epicentre ${JSON.stringify(hazardCenter)}).
2. Calculate 1 to 3 key intermediate detour waypoints (each as a [longitude, latitude] coordinate point) that are safely outside the hazard radius, such that a vehicle driving from the start point, passing through these intermediate waypoints in order, and then to the destination, will successfully bypass the hazard circle.
3. CRITICAL COORDINATE FORMATTING: All coordinates in "detourWaypoints" MUST be formatted as [longitude, latitude] (e.g. [-74.006, 40.7128] for New York City). DO NOT put latitude first. Flipped coordinates will result in invalid global routing.
4. The intermediate waypoints must be realistic and correspond to real-world locations (like road intersections, major avenues, or bypass streets) just outside the hazard boundary.
5. Generate these intermediate coordinates as "detourWaypoints". Do not include the start or destination coordinates in this list; only generate the intermediate detour points.
6. Generate clear, actionable bullet points of emergency safety guidelines specific to the hazard type: ${incidentType}.

Output your response strictly as a JSON object with the following schema:
{
  "detourWaypoints": [[number, number]], // 1 to 3 intermediate [longitude, latitude] points to route through
  "text": string // detailed safety advice and detour explanation in Markdown format
}

Do not include any explanation or markdown formatting outside the JSON. The output must be valid JSON only.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are Aegis Route AI, an elite spatial routing and disaster response AI. You return only valid JSON matching the requested schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2, // low temperature for precise mathematical/coordinate matching
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);
    
    // Programmatic Coordinate Corrector: Detect and swap flipped detour coordinates [latitude, longitude] -> [longitude, latitude]
    if (result.detourWaypoints && Array.isArray(result.detourWaypoints)) {
      const reference = hazardCenter || startCoords;
      if (reference && Array.isArray(reference) && reference.length === 2) {
        const [refLng, refLat] = reference;
        result.detourWaypoints = result.detourWaypoints.map((wp: any) => {
          if (Array.isArray(wp) && wp.length === 2) {
            const [c0, c1] = wp;
            // Distance squared assuming normal order [longitude, latitude]
            const dNormal = Math.pow(c0 - refLng, 2) + Math.pow(c1 - refLat, 2);
            // Distance squared assuming flipped order [latitude, longitude] (so [c1, c0] would be the [lng, lat] equivalent)
            const dFlipped = Math.pow(c1 - refLng, 2) + Math.pow(c0 - refLat, 2);
            
            if (dFlipped < dNormal) {
              console.log(`[API Route Fixer] Flipped coordinates detected: [${c0}, ${c1}] -> Swapping to [${c1}, ${c0}] (ref: [${refLng}, ${refLat}])`);
              return [c1, c0];
            }
          }
          return wp;
        });
      }
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI Evacuation endpoint error:", error);
    return NextResponse.json(
      { 
        text: `### Evacuation Advice Generation Failed\nAn error occurred while communicating with the AI assistant: ${error.message}`,
        detourWaypoints: []
      },
      { status: 500 }
    );
  }
}

