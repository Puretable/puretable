import assert from "node:assert/strict";
import { test } from "node:test";
import { extractLatLngFromGoogleMapsUrl, hasCoordinates } from "./coordinates";
import { BranchInput, BusinessInput } from "./businesses.schemas";

test("coordinates accept zero and valid Saudi locations", () => {
  assert.equal(hasCoordinates({ lat: 0, lng: 0 }), true);
  assert.equal(hasCoordinates({ lat: 24.7136, lng: 46.6753 }), true);
});
test("coordinates reject missing, infinite and out-of-range positions", () => {
  for (const point of [
    { lat: null, lng: 46 },
    { lat: 24, lng: undefined },
    { lat: NaN, lng: 3 },
    { lat: 91, lng: 0 },
    { lat: 0, lng: -181 },
    { lat: Infinity, lng: 0 },
  ]) {
    assert.equal(hasCoordinates(point), false);
  }
});
test("extracts coordinates from a Google Maps address-bar link (@lat,lng,zoom)", () => {
  const url = "https://www.google.com/maps/place/Some+Place/@24.7136,46.6753,15z/data=xyz";
  assert.deepEqual(extractLatLngFromGoogleMapsUrl(url), { lat: 24.7136, lng: 46.6753 });
});
test("extracts coordinates from a ?q=lat,lng search link", () => {
  const url = "https://www.google.com/maps/search/?api=1&query=24.7136,46.6753";
  assert.deepEqual(extractLatLngFromGoogleMapsUrl(url), { lat: 24.7136, lng: 46.6753 });
});
test("extracts a bare pasted 'lat,lng' pair", () => {
  assert.deepEqual(extractLatLngFromGoogleMapsUrl("24.7136, 46.6753"), {
    lat: 24.7136,
    lng: 46.6753,
  });
});
test("returns null for a short link with no embedded coordinates, or garbage text", () => {
  assert.equal(extractLatLngFromGoogleMapsUrl("https://maps.app.goo.gl/abcDEF123"), null);
  assert.equal(extractLatLngFromGoogleMapsUrl(""), null);
  assert.equal(extractLatLngFromGoogleMapsUrl("not a link"), null);
});
test("manual branch input rejects impossible coordinates and preserves supplied hours", () => {
  const draft = {
    business_id: "10000000-0000-4000-8000-000000000001",
    name: "فرع الرياض",
    lat: 24.7,
    lng: 46.6,
    hours: { sun: "09:00–22:00" },
  };
  assert.equal(BranchInput.parse(draft).hours.sun, "09:00–22:00");
  assert.equal(BranchInput.safeParse({ ...draft, lat: 100 }).success, false);
  assert.equal(
    BusinessInput.safeParse({ name: "Test", category: "cafe", city: "Riyadh", lng: 200 }).success,
    false,
  );
});
