export function hasCoordinates<T extends { lat?: number | null; lng?: number | null }>(
  point: T,
): point is T & { lat: number; lng: number } {
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180
  );
}

function validLatLng(lat: number, lng: number): { lat: number; lng: number } | null {
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

/**
 * Pulls a lat/lng pair out of a pasted Google Maps link, when the link actually contains one —
 * short links (maps.app.goo.gl/...) don't, since they only resolve after a redirect; a link copied
 * from the address bar or a "share" action usually does. Returns null rather than guessing.
 */
export function extractLatLngFromGoogleMapsUrl(text: string): { lat: number; lng: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // .../@24.7136,46.6753,15z... (the most common pattern, from the address bar or "@" share link)
  const at = trimmed.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (at) {
    const found = validLatLng(Number(at[1]), Number(at[2]));
    if (found) return found;
  }
  // ?q=24.7136,46.6753 or &query=24.7136,46.6753
  const q = trimmed.match(/[?&](?:q|query)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (q) {
    const found = validLatLng(Number(q[1]), Number(q[2]));
    if (found) return found;
  }
  // A bare "lat,lng" pair, pasted directly.
  const bare = trimmed.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (bare) {
    const found = validLatLng(Number(bare[1]), Number(bare[2]));
    if (found) return found;
  }
  return null;
}
