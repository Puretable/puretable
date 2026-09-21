import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  WHATSAPP_INQUIRY_MESSAGE,
  encodeWhatsappText,
  pureTableWhatsAppMessage,
  whatsappHref,
  withPureTableUtm,
} from "@/lib/contact";
import { extractUrl } from "@/lib/link-url";
import { isKnownHost } from "@/lib/outbound";

/** The exact wording requested for business WhatsApp buttons. */
const MESSAGE =
  "أهلًا، وصلت لكم عن طريق Pure Table وأرغب بالاستفسار عن الخيارات الخالية من الجلوتين.";

describe("business WhatsApp inquiry message", () => {
  test("is the exact requested wording, for both site languages", () => {
    assert.equal(WHATSAPP_INQUIRY_MESSAGE, MESSAGE);
    assert.equal(pureTableWhatsAppMessage(), MESSAGE);
    assert.ok(MESSAGE.endsWith("الجلوتين."));
    assert.ok(MESSAGE.includes("Pure Table"));
  });

  test("opens WhatsApp with the message pre-filled for a saved number", () => {
    for (const number of ["0501234567", "+966 50 123 4567", "00966501234567", "966501234567"]) {
      const href = whatsappHref(number, pureTableWhatsAppMessage())!;
      const url = new URL(href);
      assert.equal(url.origin + url.pathname, "https://wa.me/966501234567", number);
      assert.equal(url.searchParams.get("text"), MESSAGE, number);
    }
  });

  test("the final full stop is percent-encoded so it cannot be trimmed", () => {
    assert.equal(encodeWhatsappText("a. b! c'(d)*"), "a%2E%20b%21%20c%27%28d%29%2A");
    const href = whatsappHref("0501234567", MESSAGE)!;
    assert.ok(href.endsWith("%2E"), "text ends with an encoded full stop");
    assert.ok(!href.endsWith("."));
  });

  test("survives the tracked /go redirect without losing a character", () => {
    const href = whatsappHref("0501234567", MESSAGE)!;
    // goHref puts the destination in ?to=…; /go reads it back and cleans it with extractUrl.
    const go = new URLSearchParams({ to: href, type: "click_whatsapp" });
    const received = new URLSearchParams(go.toString()).get("to")!;
    const cleaned = extractUrl(received)!;
    assert.equal(cleaned, href);
    assert.equal(new URL(cleaned).searchParams.get("text"), MESSAGE);
    assert.ok(isKnownHost(cleaned), "wa.me is an allowed redirect target");
  });

  test("documents the trap: a plain URLSearchParams encoding loses the final full stop in /go", () => {
    const naive = new URL("https://wa.me/966501234567");
    naive.searchParams.set("text", MESSAGE);
    const trimmed = extractUrl(naive.toString())!;
    assert.notEqual(new URL(trimmed).searchParams.get("text"), MESSAGE);
    assert.equal(new URL(trimmed).searchParams.get("text"), MESSAGE.slice(0, -1));
  });

  test("a saved WhatsApp link keeps its other parameters and takes the standard message", () => {
    const href = whatsappHref("https://wa.me/966501234567?text=old%20text&app_absent=0", MESSAGE)!;
    const url = new URL(href);
    assert.equal(url.searchParams.get("text"), MESSAGE);
    assert.equal(url.searchParams.get("app_absent"), "0");
    assert.equal(url.searchParams.getAll("text").length, 1);
    assert.ok(href.endsWith("%2E"));
    assert.equal(whatsappHref("https://wa.me/966501234567", null), "https://wa.me/966501234567");
  });

  test("invalid numbers still produce no button", () => {
    assert.equal(whatsappHref("", MESSAGE), null);
    assert.equal(whatsappHref("123", MESSAGE), null);
    assert.equal(whatsappHref(null, MESSAGE), null);
  });
});

describe("business contact attribution", () => {
  test("adds the Pure Table message to a Saudi WhatsApp number", () => {
    const href = whatsappHref("0501234567", "وصلتكم عن طريق بيور تيبل");
    const url = new URL(href!);
    assert.equal(url.hostname, "wa.me");
    assert.equal(url.pathname, "/966501234567");
    assert.equal(url.searchParams.get("text"), "وصلتكم عن طريق بيور تيبل");
  });

  test("preserves existing website parameters and adds Pure Table UTM attribution", () => {
    const url = new URL(withPureTableUtm("https://example.com/menu?branch=1"));
    assert.equal(url.searchParams.get("branch"), "1");
    assert.equal(url.searchParams.get("utm_source"), "pure_table");
    assert.equal(url.searchParams.get("utm_medium"), "referral");
    assert.equal(url.searchParams.get("utm_campaign"), "business_profile");
  });
});
