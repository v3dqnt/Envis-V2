import OpenAI from 'openai';
import { downsampleCoords } from './routing';
import { fixFlippedCoordinates } from '../helpers/coordinates';

const getOpenAIClient = () => {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-proj-YOUR_KEY_HERE') {
    return null;
  }
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
};

interface EvacuationInput {
  incidentType: string;
  startAddr: string;
  endAddr: string;
  startCoords: [number, number] | null;
  endCoords: [number, number] | null;
  hazardCenter: [number, number] | null;
  hazardRadius: number;
  primaryRouteCoords: [number, number][];
}

export async function analyzeEvacuation(input: EvacuationInput): Promise<{
  detourWaypoints: [number, number][];
  text: string;
}> {
  const openai = getOpenAIClient();
  if (!openai) {
    // Return a mock detour response if API key is not configured yet
    console.warn('OpenAI API key not configured. Using spatial mock detour...');
    if (input.startCoords && input.endCoords && input.hazardCenter) {
      // Create a basic bypass midpoint mathematically (perpendicular detour offset)
      const [sLng, sLat] = input.startCoords;
      const [eLng, eLat] = input.endCoords;
      const [hLng, hLat] = input.hazardCenter;
      
      const midLng = (sLng + eLng) / 2;
      const midLat = (sLat + eLat) / 2;
      
      // Offset perpendicular to start-end vector
      const dx = eLng - sLng;
      const dy = eLat - sLat;
      const len = Math.sqrt(dx * dx + dy * dy);
      const px = -dy / (len || 1);
      const py = dx / (len || 1);
      
      // Detour offset factor (convert hazard radius to degrees approx: 111000m ~ 1 degree)
      const offsetDeg = (input.hazardRadius + 1500) / 111000;
      const detourPt: [number, number] = [midLng + px * offsetDeg, midLat + py * offsetDeg];
      
      return {
        detourWaypoints: [detourPt],
        text: `⚠️ **[MOCK RESPONSE - OpenAI Key Not Set]**\n\nDirect route intersects the **${input.incidentType}** dome. Calculated a mathematical waypoint at \`[${detourPt[0].toFixed(5)}, ${detourPt[1].toFixed(5)}]\` to bypass the Epicentre.\n\n### Safety Guidelines:\n- Avoid low-visibility areas.\n- Travel with emergency gear.\n- Follow local evacuation orders immediately.`
      };
    }
    return { detourWaypoints: [], text: 'OpenAI API key missing. Unable to compute detour.' };
  }

  try {
    const sampledRoute = downsampleCoords(input.primaryRouteCoords, 50);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: 'You are Aegis Route AI, an elite spatial routing and disaster response AI. You return only valid JSON matching the requested schema.'
        },
        {
          role: 'user',
          content: `You are an emergency navigation engine. An active hazard zone exists.
Details:
- Incident Type: ${input.incidentType}
- Starting Location (Evacuation Source): ${input.startAddr || "Epicentre"} [Coordinates: ${JSON.stringify(input.startCoords)}]
- Destination (Safe Zone): ${input.endAddr || "Safe Zone"} [Coordinates: ${JSON.stringify(input.endCoords)}]
- Hazard Epicentre: [Coordinates: ${JSON.stringify(input.hazardCenter)}]
- Hazard Radius: ${input.hazardRadius} meters

The direct driving route coordinates are:
${JSON.stringify(sampledRoute)}

Tasks:
1. Analyze the direct route and identify where it intersects the hazard dome (radius of ${input.hazardRadius} meters around the epicentre ${JSON.stringify(input.hazardCenter)}).
2. Calculate 1 to 3 key intermediate detour waypoints (each as a [longitude, latitude] coordinate point) that are safely outside the hazard radius.
3. CRITICAL COORDINATE FORMATTING: All coordinates in "detourWaypoints" MUST be formatted as [longitude, latitude].
4. The intermediate waypoints must be realistic and correspond to real-world locations.
5. Generate these intermediate coordinates as "detourWaypoints".
6. Generate clear, actionable bullet points of emergency safety guidelines specific to the hazard type: ${input.incidentType}.

Output your response strictly as a JSON object with the following schema:
{
  "detourWaypoints": [[number, number]], // 1 to 3 intermediate [longitude, latitude] points
  "text": string // detailed safety advice and detour explanation in Markdown format
}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const result = JSON.parse(content);
    let detourWaypoints = result.detourWaypoints || [];
    
    // Correct flipped coordinates if any (OpenAI sometimes swaps lat/lng)
    if (input.hazardCenter && detourWaypoints.length > 0) {
      detourWaypoints = fixFlippedCoordinates(detourWaypoints, input.hazardCenter);
    }

    return {
      detourWaypoints,
      text: result.text || 'No guidelines provided.'
    };
  } catch (error) {
    console.error('Evacuation advice API failed:', error);
    return {
      detourWaypoints: [],
      text: 'Failed to retrieve AI Evacuation advice. Please use the fallback map routes and move outward.'
    };
  }
}
