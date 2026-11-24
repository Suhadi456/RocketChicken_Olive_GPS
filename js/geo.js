const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km) {
  if (km == null || Number.isNaN(km)) return '--';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

export function formatAreaKm2(m2) {
  if (m2 == null || Number.isNaN(m2)) return '--';
  return `${(m2 / 1_000_000).toFixed(1)} km²`;
}

export function buildGoogleMapsUrl(destLat, destLng, origin) {
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  if (origin && origin.lat != null && origin.lng != null) {
    url += `&origin=${origin.lat},${origin.lng}`;
  }
  return url;
}
