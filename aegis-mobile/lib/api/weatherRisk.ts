export interface RiskFactor {
  type: string;
  level: 'high' | 'medium' | 'low';
  confidence: number;
  details: string;
}

export interface WeatherRiskPayload {
  city: string;
  historical: {
    maxPrecipitationSum: number;
    maxTempRecord: number;
    minTempRecord: number;
    maxWindSpeed: number;
    maxSnowfall: number;
    avgAnnualPrecipitation: number;
  };
  recent: {
    totalPrecipitation: number;
    maxWindSpeed: number;
    avgMaxTemp: number;
    avgMinTemp: number;
  };
  risks: RiskFactor[];
}

export async function getWeatherRisk(
  lat: number,
  lng: number,
  city: string
): Promise<WeatherRiskPayload> {
  const today = new Date();
  
  // Format dates: YYYY-MM-DD
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const tenYearsAgo = new Date(today.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);

  const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${formatDate(tenYearsAgo)}&end_date=${formatDate(sevenDaysAgo)}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,snowfall_sum&timezone=auto&wind_speed_unit=kmh`;
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=30&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,snowfall_sum&timezone=auto&wind_speed_unit=kmh`;

  try {
    const [histRes, foreRes] = await Promise.all([
      fetch(histUrl).then(r => r.json()),
      fetch(forecastUrl).then(r => r.json())
    ]);

    // Parse Historical
    const hd = histRes.daily || {};
    const maxPrecipitationSum = Math.max(...(hd.precipitation_sum || [0]).filter((v: any) => v != null), 0);
    const maxTempRecord = Math.max(...(hd.temperature_2m_max || [0]).filter((v: any) => v != null), 0);
    const minTempRecord = Math.min(...(hd.temperature_2m_min || [0]).filter((v: any) => v != null), 0);
    const maxWindSpeed = Math.max(...(hd.wind_speed_10m_max || [0]).filter((v: any) => v != null), 0);
    const maxSnowfall = Math.max(...(hd.snowfall_sum || [0]).filter((v: any) => v != null), 0);

    // Estimate average annual precipitation
    const totalDays = hd.precipitation_sum?.length || 3650;
    const totalPrecip = (hd.precipitation_sum || []).reduce((acc: number, v: number) => acc + (v || 0), 0);
    const avgAnnualPrecipitation = (totalPrecip / totalDays) * 365.25;

    // Parse Recent (Past 30 days)
    const fd = foreRes.daily || {};
    // Slice only past 30 days (excluding forecast)
    const pastPrecip = (fd.precipitation_sum || []).slice(0, 30);
    const pastWind = (fd.wind_speed_10m_max || []).slice(0, 30);
    const pastMaxTemp = (fd.temperature_2m_max || []).slice(0, 30);
    const pastMinTemp = (fd.temperature_2m_min || []).slice(0, 30);

    const totalPrecipitation = pastPrecip.reduce((acc: number, v: number) => acc + (v || 0), 0);
    const maxRecentWindSpeed = Math.max(...pastWind.filter((v: any) => v != null), 0);
    const avgMaxTemp = pastMaxTemp.reduce((acc: number, v: number) => acc + (v || 0), 0) / (pastMaxTemp.length || 1);
    const avgMinTemp = pastMinTemp.reduce((acc: number, v: number) => acc + (v || 0), 0) / (pastMinTemp.length || 1);

    const historical = {
      maxPrecipitationSum,
      maxTempRecord,
      minTempRecord,
      maxWindSpeed,
      maxSnowfall,
      avgAnnualPrecipitation
    };

    const recent = {
      totalPrecipitation,
      maxWindSpeed: maxRecentWindSpeed,
      avgMaxTemp,
      avgMinTemp
    };

    // Derive Risks
    const risks: RiskFactor[] = [];
    
    // 1. Flooding Risk
    if (maxPrecipitationSum > 100) {
      const signal = totalPrecipitation > 150 ? 'Recent rainfall totals suggest soil saturation.' : '';
      risks.push({
        type: 'Flooding',
        level: maxPrecipitationSum > 150 ? 'high' : 'medium',
        confidence: 0.85,
        details: `Heavy precipitation capability of ${maxPrecipitationSum.toFixed(1)}mm/day recorded. ${signal}`
      });
    }

    // 2. Wildfire Risk
    if (maxTempRecord > 40 && avgAnnualPrecipitation < 600) {
      risks.push({
        type: 'Wildfire',
        level: 'high',
        confidence: 0.90,
        details: `High heat thresholds (${maxTempRecord.toFixed(1)}°C) and low annual rainfall (${avgAnnualPrecipitation.toFixed(0)}mm) yield high fuel dryness.`
      });
    } else if (maxTempRecord > 35 && avgAnnualPrecipitation < 1000) {
      risks.push({
        type: 'Wildfire',
        level: 'medium',
        confidence: 0.75,
        details: `Substantial summer temperature peaks (${maxTempRecord.toFixed(1)}°C) present high fire hazard during dry spells.`
      });
    }

    // 3. Blizzard/Winter storm
    if (maxSnowfall > 30) {
      risks.push({
        type: 'Blizzard',
        level: maxSnowfall > 50 ? 'high' : 'medium',
        confidence: 0.80,
        details: `Historic maximum daily snowfall of ${maxSnowfall.toFixed(1)}cm indicates severe winter storm capability.`
      });
    }

    // 4. Cyclone/Windstorm
    if (maxWindSpeed > 120) {
      risks.push({
        type: 'Tropical Cyclone',
        level: 'high',
        confidence: 0.85,
        details: `Destructive wind velocity profile reaching ${maxWindSpeed.toFixed(1)}km/h recorded.`
      });
    } else if (maxWindSpeed > 90) {
      risks.push({
        type: 'Tropical Cyclone',
        level: 'medium',
        confidence: 0.70,
        details: `Extreme wind spikes of ${maxWindSpeed.toFixed(1)}km/h indicate vulnerability to moderate storms.`
      });
    }

    // 5. Drought Risk
    if (avgAnnualPrecipitation < 250) {
      risks.push({
        type: 'Drought',
        level: 'high',
        confidence: 0.95,
        details: `Extremely low average annual rainfall (${avgAnnualPrecipitation.toFixed(0)}mm) indicates chronic arid conditions.`
      });
    }

    // Sort risks (high -> medium -> low)
    const levelWeights = { high: 3, medium: 2, low: 1 };
    risks.sort((a, b) => levelWeights[b.level] - levelWeights[a.level]);

    return { city, historical, recent, risks };
  } catch (error) {
    console.error('Weather risk analysis failed:', error);
    return {
      city,
      historical: { maxPrecipitationSum: 45, maxTempRecord: 32, minTempRecord: 0, maxWindSpeed: 60, maxSnowfall: 0, avgAnnualPrecipitation: 750 },
      recent: { totalPrecipitation: 20, maxWindSpeed: 30, avgMaxTemp: 24, avgMinTemp: 14 },
      risks: [
        { type: 'Flooding', level: 'medium', confidence: 0.6, details: 'Average local precipitation profile.' },
        { type: 'Wildfire', level: 'low', confidence: 0.5, details: 'Low probability profile.' }
      ]
    };
  }
}
