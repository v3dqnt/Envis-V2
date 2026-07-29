import OpenAI from 'openai';

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

const DENSITY_FALLBACKS: Record<string, number> = {
  'New York': 11300,
  'New York City': 11300,
  'Manhattan': 28000,
  'Brooklyn': 14600,
  'London': 5700,
  'Tokyo': 6300,
  'Paris': 21000,
  'Hong Kong': 6800,
  'Singapore': 8300,
  'Mumbai': 21000,
  'Sydney': 400,
  'Los Angeles': 3200,
  'San Francisco': 7200,
  'Chicago': 4600,
};

export async function getCityDensity(city: string): Promise<{
  city: string;
  densityPerKm2: number;
}> {
  // Normalize city name for lookup
  const cleanCity = city.trim();
  const lookupName = Object.keys(DENSITY_FALLBACKS).find(
    k => cleanCity.toLowerCase().includes(k.toLowerCase())
  );
  
  if (lookupName) {
    return { city: cleanCity, densityPerKm2: DENSITY_FALLBACKS[lookupName] };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return { city: cleanCity, densityPerKm2: 5000 }; // Standard default density fallback
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: 'You are a demographic data retrieval assistant. You return only valid JSON matching the requested schema.'
        },
        {
          role: 'user',
          content: `Identify the approximate average population density (number of people per square kilometer) for the city: "${cleanCity}".
Provide a reliable, standard demographic figure.

Your response must be strictly a JSON object with this schema:
{
  "city": string,
  "densityPerKm2": number
}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty density query response');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Density fetch failed, returning default:', error);
    return { city: cleanCity, densityPerKm2: 5000 };
  }
}
