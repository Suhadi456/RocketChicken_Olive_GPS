import { FALLBACK_SPEED_KMH, OSRM_BASE } from './config.js';
import { haversineKm } from './geo.js';

/**
 * Enrich candidate outlets with actual driving distance (km) and duration (min)
 * in a single OSRM Table API call, with automatic Haversine fallback.
 */
export async function enrichDrivingDistances(origin, candidates) {
  if (!candidates.length) return [];
  const coords = [`${origin.lng},${origin.lat}`, ...candidates.map((c) => `${c.lng},${c.lat}`)].join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OSRM table HTTP ${res.status}`);
    const data = await res.json();
    const distances = data.distances?.[0];
    const durations = data.durations?.[0];
    if (!distances || !durations) throw new Error('Invalid OSRM table payload');

    return candidates.map((c, idx) => {
      const m = distances[idx + 1];
      const sec = durations[idx + 1];
      const roadKm = typeof m === 'number' ? m / 1000 : c.straightKm;
      const etaMin = typeof sec === 'number' ? Math.max(1, Math.round(sec / 60)) : Math.max(1, Math.round((roadKm / FALLBACK_SPEED_KMH) * 60));
      return { ...c, distanceKm: roadKm, etaMin, distanceSource: 'OSRM' };
    });
  } catch {
    return candidates.map((c) => ({
      ...c,
      distanceKm: c.straightKm,
      etaMin: Math.max(1, Math.round((c.straightKm / FALLBACK_SPEED_KMH) * 60)),
      distanceSource: 'Haversine (Fallback)',
    }));
  }
}

/**
 * Fetch route geometry + turn-by-turn steps in a single OSRM Route request.
 */
export async function fetchRoute(origin, destLat, destLng) {
  const url = `${OSRM_BASE}/route/v1/driving/${origin.lng},${origin.lat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`OSRM route HTTP ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route returned');

    const steps = [];
    for (const leg of route.legs || []) {
      for (const s of leg.steps || []) {
        const road = s.name ? ` ke ${s.name}` : '';
        const type = s.maneuver?.type || 'lanjut';
        const mod = s.maneuver?.modifier ? ` (${s.maneuver.modifier})` : '';
        const dist = s.distance >= 1000 ? `${(s.distance / 1000).toFixed(2)} km` : `${Math.round(s.distance)} m`;
        steps.push(`${capitalize(type)}${mod}${road} — ${dist}`);
      }
    }

    return {
      geometry: route.geometry,
      distanceKm: route.distance / 1000,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      steps,
      isFallback: false,
    };
  } catch {
    const straightKm = haversineKm(origin.lat, origin.lng, destLat, destLng);
    return {
      geometry: {
        type: 'LineString',
        coordinates: [
          [origin.lng, origin.lat],
          [destLng, destLat],
        ],
      },
      distanceKm: straightKm,
      durationMin: Math.max(1, Math.round((straightKm / FALLBACK_SPEED_KMH) * 60)),
      steps: ['Server rute OSRM sedang sibuk. Menampilkan garis lurus estimasi dan silakan buka Google Maps untuk navigasi detail.'],
      isFallback: true,
    };
  }
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
