import { NextResponse } from "next/server";

function categorizePm25(pm25: number): string {
  if (pm25 <= 12) return "Good";
  if (pm25 <= 35.4) return "Moderate";
  if (pm25 <= 55.4) return "Unhealthy for Sensitive Groups";
  if (pm25 <= 150.4) return "Unhealthy";
  if (pm25 <= 250.4) return "Very Unhealthy";
  return "Hazardous";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ available: false, note: "OPENAQ_API_KEY not configured — ground sensor air-quality data disabled." });
  }

  try {
    // order_by only accepts 'id' on this API — sort candidates by the returned
    // distance field ourselves, and search across several since the nearest
    // station often only carries ozone sensors, not particulate matter.
    const locRes = await fetch(
      `https://api.openaq.org/v3/locations?coordinates=${lat},${lng}&radius=25000&limit=10`,
      { headers: { "X-API-Key": apiKey }, next: { revalidate: 1800 } }
    );
    if (!locRes.ok) {
      return NextResponse.json({ available: false, note: `OpenAQ locations API returned ${locRes.status}` });
    }
    const locData = await locRes.json();
    const candidates = (locData.results || []).sort((a: any, b: any) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    if (candidates.length === 0) {
      return NextResponse.json({ available: false, note: "No OpenAQ ground station found within 25km." });
    }

    // Many listed stations are defunct (datetimeLast years in the past) — skip those
    // even if they technically have a PM sensor, so we don't call the latest-measurement
    // endpoint on a sensor that stopped reporting long ago.
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let station: any = null;
    let pmSensor: any = null;
    for (const candidate of candidates) {
      const lastReportMs = candidate.datetimeLast?.utc ? new Date(candidate.datetimeLast.utc).getTime() : 0;
      if (lastReportMs < thirtyDaysAgoMs) continue;
      const sensor = candidate.sensors?.find((s: any) => s.parameter?.name === "pm25")
        || candidate.sensors?.find((s: any) => s.parameter?.name === "pm10");
      if (sensor) {
        station = candidate;
        pmSensor = sensor;
        break;
      }
    }
    if (!station || !pmSensor) {
      return NextResponse.json({ available: false, note: `${candidates.length} station(s) found within 25km, none report recent particulate matter (PM2.5/PM10) data.` });
    }

    // The sensor's latest reading is embedded in the sensor detail response itself —
    // there is no separate /measurements/latest sub-route on this API.
    const sensorRes = await fetch(
      `https://api.openaq.org/v3/sensors/${pmSensor.id}`,
      { headers: { "X-API-Key": apiKey }, next: { revalidate: 1800 } }
    );
    if (!sensorRes.ok) {
      return NextResponse.json({ available: false, note: `OpenAQ sensor API returned ${sensorRes.status}` });
    }
    const sensorData = await sensorRes.json();
    const latest = sensorData.results?.[0]?.latest;
    if (!latest) {
      return NextResponse.json({ available: false, note: "No recent measurements from nearest station." });
    }

    const value: number = latest.value;
    const parameterName: string = pmSensor.parameter.name;

    return NextResponse.json({
      available: true,
      stationName: station.name,
      distanceKm: station.distance ? station.distance / 1000 : null,
      parameter: parameterName,
      value,
      units: pmSensor.parameter?.units || "µg/m³",
      category: parameterName === "pm25" ? categorizePm25(value) : null,
      measuredAt: latest.datetime?.utc || null,
      source: "OpenAQ ground sensor network",
    });
  } catch (error: any) {
    return NextResponse.json({ available: false, note: error.message });
  }
}
