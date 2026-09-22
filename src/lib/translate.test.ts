import assert from "node:assert/strict";
import { test } from "node:test";
import { splitIntoChunks } from "./translate.server";

test("short text is returned as a single chunk", () => {
  assert.deepEqual(splitIntoChunks("خبز وكيك"), ["خبز وكيك"]);
  assert.deepEqual(splitIntoChunks(""), [""]);
});

test("long text is split on sentence boundaries and every chunk stays under the limit", () => {
  const sentence = "هذه جملة عربية تتكرر عدة مرات لاختبار التقسيم. ";
  const text = sentence.repeat(20).trim();
  const chunks = splitIntoChunks(text);
  assert.ok(chunks.length > 1, "expected more than one chunk");
  for (const chunk of chunks) assert.ok(chunk.length <= 450, `chunk too long: ${chunk.length}`);
  // Rejoining with spaces reconstructs the original text (no words lost or duplicated).
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("a single sentence longer than the limit falls back to a word-boundary split", () => {
  const words = Array.from({ length: 120 }, (_, i) => `كلمة${i}`);
  const text = words.join(" "); // no punctuation, so it is one long "sentence"
  const chunks = splitIntoChunks(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 450);
  assert.equal(chunks.join(" "), text);
});

test("no chunk is ever empty", () => {
  const text = "أ. ".repeat(300).trim();
  for (const chunk of splitIntoChunks(text)) assert.ok(chunk.length > 0);
});
