import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");

    if (!city) {
      return NextResponse.json({ error: "Missing city parameter" }, { status: 400 });
    }

    console.log(`[AI density search] API query received for city: "${city}"`);

    if (!process.env.OPENAI_API_KEY) {
      // Default fallback values if API key is not configured (or standard values)
      let fallbackDensity = 5000; // default average urban density
      const lowerCity = city.toLowerCase();
      if (lowerCity.includes("new york") || lowerCity.includes("manhattan") || lowerCity.includes("nyc")) {
        fallbackDensity = 11300;
      } else if (lowerCity.includes("london")) {
        fallbackDensity = 5700;
      } else if (lowerCity.includes("tokyo")) {
        fallbackDensity = 6300;
      } else if (lowerCity.includes("paris")) {
        fallbackDensity = 21000;
      }

      console.log(`[AI density search] Fallback density selected for "${city}": ${fallbackDensity} ppl/km² (OpenAI API key missing)`);

      return NextResponse.json({
        city,
        densityPerKm2: fallbackDensity,
        note: "Fallback density used (OpenAI API key missing)."
      });
    }

    console.log(`[AI density search] Querying OpenAI for population density of "${city}"...`);

    const prompt = `Identify the approximate average population density (number of people per square kilometer) for the city: "${city}".
Provide a reliable, standard demographic figure.

Your response must be strictly a JSON object with this schema:
{
  "city": string,
  "densityPerKm2": number // population density in people per square kilometer (numerical value only)
}

Do not include any explanation or markdown formatting outside the JSON. The output must be valid JSON only.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a demographic data retrieval assistant. You return only valid JSON matching the requested schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    console.log(`[AI density search] OpenAI returned density for "${result.city || city}": ${result.densityPerKm2 || 5000} ppl/km²`);

    return NextResponse.json({
      city: result.city || city,
      densityPerKm2: Number(result.densityPerKm2) || 5000
    });
  } catch (error: any) {
    console.error(`[AI density search] Error encountered for city search:`, error);
    return NextResponse.json({
      city: "Unknown",
      densityPerKm2: 5000,
      error: error.message
    });
  }
}
