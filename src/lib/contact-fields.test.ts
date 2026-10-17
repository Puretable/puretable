import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emailField,
  httpsUrlField,
  instagramField,
  normalizePhone,
  phoneField,
  tiktokField,
} from "./contact-fields";

test("normalizePhone: Saudi local and international numbers normalize to +<country><digits>", () => {
  assert.equal(normalizePhone("0551234567"), "+966551234567");
  assert.equal(normalizePhone("00966551234567"), "+966551234567");
  assert.equal(normalizePhone("+966551234567"), "+966551234567");
  assert.equal(normalizePhone("551234567"), "+966551234567");
  assert.equal(normalizePhone("+1 212 555 0100"), "+12125550100");
  assert.equal(normalizePhone("123"), null, "too short");
  assert.equal(normalizePhone("1".repeat(20)), null, "too long");
});

test("phoneField parses and normalizes, rejects angle brackets", () => {
  assert.equal(phoneField.parse("0551234567"), "+966551234567");
  assert.equal(phoneField.parse(""), null);
  assert.equal(phoneField.parse(null), null);
  assert.equal(phoneField.safeParse("<script>").success, false);
  assert.equal(phoneField.safeParse("not a phone").success, false);
});

test("httpsUrlField accepts https only, rejects javascript:/data:/http:", () => {
  assert.equal(httpsUrlField().parse("https://example.com"), "https://example.com/");
  assert.equal(httpsUrlField().safeParse("javascript:alert(1)").success, false);
  assert.equal(httpsUrlField().safeParse("data:text/html,<b>x</b>").success, false);
  assert.equal(httpsUrlField().safeParse("http://example.com").success, false);
  assert.equal(httpsUrlField().parse(""), null);
});

test("instagramField accepts a handle or a real instagram URL, normalizes to a canonical URL", () => {
  assert.equal(instagramField.parse("puretable"), "https://instagram.com/puretable");
  assert.equal(instagramField.parse("@puretable"), "https://instagram.com/puretable");
  assert.equal(
    instagramField.parse("https://www.instagram.com/puretable/"),
    "https://instagram.com/puretable",
  );
  assert.equal(instagramField.safeParse("https://tiktok.com/@puretable").success, false);
  assert.equal(instagramField.safeParse("<script>").success, false);
});

test("tiktokField accepts a handle or a real tiktok URL, normalizes to a canonical URL", () => {
  assert.equal(tiktokField.parse("puretable"), "https://tiktok.com/@puretable");
  assert.equal(
    tiktokField.parse("https://www.tiktok.com/@puretable"),
    "https://tiktok.com/@puretable",
  );
  assert.equal(tiktokField.safeParse("https://instagram.com/puretable").success, false);
});

test("emailField accepts only valid email addresses", () => {
  assert.equal(emailField.parse("hello@example.com"), "hello@example.com");
  assert.equal(emailField.safeParse("not-an-email").success, false);
  assert.equal(emailField.parse(""), null);
});
