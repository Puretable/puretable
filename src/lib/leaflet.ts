let pending: Promise<typeof import("leaflet")> | undefined;

/**
 * Free, no-key OpenStreetMap tiles via Leaflet — deliberately separate from the Mapbox setup
 * (src/lib/mapbox.ts) used elsewhere in the app: the public branches map must never depend on a
 * paid/keyed API. Loaded only by mounted maps, never during SSR.
 */
export function loadLeaflet() {
  pending ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
    ([leaflet]) => leaflet,
  );
  return pending;
}

/** OpenStreetMap's standard tile layer — free, no API key, attribution required by its usage policy. */
export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
