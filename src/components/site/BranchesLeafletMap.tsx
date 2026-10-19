import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { loadLeaflet, OSM_ATTRIBUTION, OSM_TILE_URL } from "@/lib/leaflet";
import { hasCoordinates } from "@/lib/coordinates";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export type BranchMapPoint = {
  id: string;
  title: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  /** Google Maps "Directions" link for this point — always provided by the caller. */
  directionsUrl: string;
};

/**
 * Public per-business map: one marker per branch (free OpenStreetMap tiles via Leaflet — no API
 * key, no billing; see src/lib/leaflet.ts). Each marker's popup shows the branch name and a
 * "الاتجاهات / Directions" link that opens that branch's own Google Maps location. Lazy-loaded:
 * nothing is imported until this component actually mounts with at least one point.
 */
export function BranchesLeafletMap({
  points,
  height = 400,
  activePointId,
  onPointSelect,
}: {
  points: BranchMapPoint[];
  height?: number;
  activePointId?: string | null;
  onPointSelect?: (id: string) => void;
}) {
  const { lang } = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const callback = useRef(onPointSelect);
  callback.current = onPointSelect;
  const pointsKey = JSON.stringify(points.filter(hasCoordinates));
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const directionsLabel = lang === "ar" ? "الاتجاهات" : "Directions";

  useEffect(() => {
    const pins = JSON.parse(pointsKey) as (BranchMapPoint & { lat: number; lng: number })[];
    if (!pins.length) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    const registry = markers.current;
    setStatus("loading");
    const timeout = window.setTimeout(() => {
      if (!cancelled) setStatus("error");
    }, 20000);
    loadLeaflet()
      .then((L) => {
        if (cancelled || !container.current) return;
        const m = L.map(container.current, {
          center: [pins[0].lat, pins[0].lng],
          zoom: 13,
        });
        map = m;
        mapRef.current = m;
        L.tileLayer(OSM_TILE_URL, {
          attribution: OSM_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(m);
        L.control.zoom({ position: "topright" }).addTo(m);

        const bounds = L.latLngBounds([]);
        pins.forEach((pin) => {
          const popupEl = document.createElement("div");
          popupEl.dir = lang === "ar" ? "rtl" : "ltr";
          const title = document.createElement("strong");
          title.textContent = pin.title;
          popupEl.append(title);
          if (pin.address) {
            const address = document.createElement("p");
            address.textContent = pin.address;
            address.style.margin = "4px 0";
            popupEl.append(address);
          }
          const link = document.createElement("a");
          link.href = pin.directionsUrl;
          link.target = "_blank";
          link.rel = "noreferrer noopener";
          link.textContent = `${directionsLabel} / Directions`;
          link.style.color = "var(--primary, #16a34a)";
          link.style.fontWeight = "600";
          popupEl.append(link);

          const marker = L.marker([pin.lat, pin.lng]).addTo(m).bindPopup(popupEl);
          marker.on("click", () => callback.current?.(pin.id));
          const el = marker.getElement();
          if (el) {
            el.setAttribute("role", "button");
            el.setAttribute("aria-label", pin.title);
          }
          registry.set(pin.id, marker);
          bounds.extend([pin.lat, pin.lng]);
        });
        if (pins.length > 1) m.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });

        observer = new ResizeObserver(() => m.invalidateSize());
        observer.observe(container.current);
        setStatus("ready");
        clearTimeout(timeout);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      observer?.disconnect();
      registry.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, [pointsKey, lang, attempt, directionsLabel]);

  useEffect(() => {
    if (!activePointId || status !== "ready") return;
    const marker = markers.current.get(activePointId);
    if (!marker) return;
    marker.openPopup();
    mapRef.current?.flyTo(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 14), {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.45,
    });
  }, [activePointId, status]);

  const missing = points.length - points.filter(hasCoordinates).length;
  const empty = pointsKey === "[]";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <div
        ref={container}
        style={{ height }}
        className="w-full bg-secondary/40"
        aria-label={lang === "ar" ? "خريطة الفروع" : "Branches map"}
      />
      {(empty || status !== "ready") && (
        <div
          role="status"
          className="absolute inset-0 grid place-content-center gap-3 bg-background/90 p-6 text-center text-sm"
        >
          {empty
            ? lang === "ar"
              ? "لم تُحدَّد إحداثيات هذه الفروع بعد. التفاصيل متاحة في القائمة."
              : "These branches have no saved coordinates yet. See the list for details."
            : status === "error"
              ? lang === "ar"
                ? "تعذر تحميل الخريطة. تحقق من الاتصال أو استخدم القائمة."
                : "Map unavailable. Check your connection or use the list."
              : lang === "ar"
                ? "جارٍ تحميل الخريطة…"
                : "Loading map…"}
          {!empty && status === "error" && (
            <button
              type="button"
              onClick={() => setAttempt((v) => v + 1)}
              className="rounded-lg border p-2"
            >
              {lang === "ar" ? "إعادة المحاولة" : "Retry"}
            </button>
          )}
        </div>
      )}
      {!empty && missing > 0 && (
        <p className="p-2 text-xs text-muted-foreground" role="status">
          {lang === "ar"
            ? `عدد الفروع التي تحتاج إحداثيات: ${missing}`
            : `${missing} branches still need coordinates`}
        </p>
      )}
    </div>
  );
}
