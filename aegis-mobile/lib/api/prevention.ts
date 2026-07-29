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

interface PreventionInput {
  incidentType: string;
  cityName: string;
  activeDefenses: string[];
  densityPerKm2: number | null;
  weatherRisk?: any;
}

export async function analyzePrevention(input: PreventionInput): Promise<{
  vulnerabilityMetrics: {
    infrastructure: number;
    residential: number;
    evacuationReadiness: number;
  };
  checklist: string[];
  strategyMarkdown: string;
}> {
  const openai = getOpenAIClient();
  if (!openai) {
    console.warn('OpenAI API key not configured. Using mock prevention profile...');
    return {
      vulnerabilityMetrics: {
        infrastructure: 65 - (input.activeDefenses.length * 5),
        residential: 70 - (input.activeDefenses.length * 4),
        evacuationReadiness: 55 + (input.activeDefenses.length * 5),
      },
      checklist: [
        `Ensure ${input.incidentType} alert systems are fully tested.`,
        'Verify emergency services have clear bypass routes.',
        'Distribute resident emergency guides.',
        'Review regional structural reinforcements.',
        'Confirm emergency power backup in municipal hubs.'
      ],
      strategyMarkdown: `🛡️ **[MOCK REPORT - OpenAI Key Not Set]**\n\nRegional mitigation audit for **${input.cityName || 'Simulated Area'}** under a **${input.incidentType}** warning.\n\n### Strategic Overview:\n1. Active countermeasures (**${input.activeDefenses.join(', ') || 'None'}**) reduce infrastructure risk margins.\n2. Population density is set to **${input.densityPerKm2 || '5000'} ppl/km²**.\n3. Climate data shows historical risk triggers. Immediate defense activation recommended.`
    };
  }

  try {
    let weatherContext = '';
    if (input.weatherRisk) {
      const h = input.weatherRisk.historical || {};
      const r = input.weatherRisk.recent || {};
      weatherContext = `
Climate Intelligence (Open-Meteo Integration):
- Historical 10-Year Extremes:
  * Peak Daily Precipitation: ${h.maxPrecipitationSum?.toFixed(1) || 'N/A'} mm
  * Max Temperature Record: ${h.maxTempRecord?.toFixed(1) || 'N/A'}°C
  * Min Temperature Record: ${h.minTempRecord?.toFixed(1) || 'N/A'}°C
  * Max Wind Speed Record: ${h.maxWindSpeed?.toFixed(1) || 'N/A'} km/h
  * Max Snowfall Record: ${h.maxSnowfall?.toFixed(1) || 'N/A'} cm
  * Average Annual Precipitation: ${h.avgAnnualPrecipitation?.toFixed(1) || 'N/A'} mm
- Recent 30-Day Weather Trends:
  * Accumulation: ${r.totalPrecipitation?.toFixed(1) || 'N/A'} mm
  * Max Wind: ${r.maxWindSpeed?.toFixed(1) || 'N/A'} km/h
  * Temp range: ${r.avgMinTemp?.toFixed(1) || 'N/A'}°C to ${r.avgMaxTemp?.toFixed(1) || 'N/A'}°C
`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content: 'You are Aegis Mitigation Engine, an elite structural safety auditor. You return only valid JSON matching the requested schema.'
        },
        {
          role: 'user',
          content: `You are Aegis Mitigation Engine, an AI disaster prevention and structural safety auditor.
Analyze the threat profile for the following context:
- Primary Disaster Threat: ${input.incidentType}
- Target Region/City: ${input.cityName || "Local Area"}
- Active Countermeasures: ${input.activeDefenses.join(", ") || "None"}
- Local Population Density: ${input.densityPerKm2 || "Unknown"} people/km²
${weatherContext}

Perform these tasks:
1. Based on ALL available evidence (climate data + selected threat), identify the top 1-3 most likely disaster types for this location and explain why.
2. Estimate the vulnerability scores (from 0 to 100, where 100 is highly vulnerable) for:
   a) Infrastructure Vulnerability
   b) Residential Vulnerability
   c) Evacuation Bottleneck Risk
3. Create a prioritized 5-item emergency preparation checklist.
4. Write a concise, highly strategic mitigation directive (in Markdown format).

Output schema:
{
  "vulnerabilityMetrics": { "infrastructure": number, "residential": number, "evacuationReadiness": number },
  "checklist": [string],
  "strategyMarkdown": string
}`
        }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    return JSON.parse(content);
  } catch (error) {
    console.error('Prevention advice API failed:', error);
    return {
      vulnerabilityMetrics: { infrastructure: 50, residential: 50, evacuationReadiness: 50 },
      checklist: ['Verify primary escape routes.', 'Check communication systems.'],
      strategyMarkdown: 'Prevention scan service encountered an error. Please verify weather metrics and try again.'
    };
  }
}
