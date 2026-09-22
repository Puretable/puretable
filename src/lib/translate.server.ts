/**
 * Arabic → English machine translation for admin-managed website content.
 *
 * Uses MyMemory's free public API (no key required). Server-only: never call this from the
 * browser. Long text is split into chunks the API handles reliably, translated one at a time with
 * a short pause between requests, and rejoined preserving paragraph breaks (legal text is rendered
 * with `whitespace-pre-line`, so blank lines matter).
 *
 * Never throws away a good translation: any failure (network, rate limit, empty/garbled response)
 * throws, and the caller keeps whatever English text was already saved instead of overwriting it
 * with something worse.
 */

const MAX_CHUNK_CHARS = 450;
const REQUEST_TIMEOUT_MS = 9_000;
const DELAY_BETWEEN_REQUESTS_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Splits long text into pieces small enough for a single MyMemory request, on sentence/word
 * boundaries where possible, without ever producing an empty piece. */
export function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const sentences = text.split(/(?<=[.!?؟۔])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= MAX_CHUNK_CHARS) {
      current = sentence;
    } else {
      // A single sentence longer than the limit: fall back to a hard word-boundary split.
      const words = sentence.split(/\s+/);
      let piece = "";
      for (const word of words) {
        const next = piece ? `${piece} ${word}` : word;
        if (next.length > MAX_CHUNK_CHARS) {
          if (piece) chunks.push(piece);
          piece = word;
        } else {
          piece = next;
        }
      }
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function translateChunk(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ar|en`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Translation request failed (HTTP ${res.status})`);
  const data = (await res.json()) as {
    responseStatus?: number | string;
    responseData?: { translatedText?: string };
  };
  if (String(data.responseStatus ?? 200) !== "200") {
    throw new Error(`Translation service returned status ${data.responseStatus}`);
  }
  const translated = data.responseData?.translatedText?.trim();
  if (!translated) throw new Error("Translation service returned no text");
  // MyMemory echoes the source text back (sometimes HTML-escaped) when it cannot translate at all.
  if (translated.toLowerCase() === text.toLowerCase())
    throw new Error("Translation was not produced");
  return translated;
}

/**
 * Translates Arabic text to English. Empty input returns empty output (no request made).
 * Paragraph breaks (`\n\n`) are preserved; each paragraph is translated on its own so one
 * long paragraph cannot break the boundary of another.
 */
export async function translateArabicToEnglish(arabicText: string): Promise<string> {
  const trimmed = arabicText.trim();
  if (!trimmed) return "";
  const paragraphs = trimmed.split(/\n{2,}/);
  const translatedParagraphs: string[] = [];
  let first = true;
  for (const paragraph of paragraphs) {
    const chunks = splitIntoChunks(paragraph.trim());
    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      if (!first) await sleep(DELAY_BETWEEN_REQUESTS_MS);
      first = false;
      translatedChunks.push(await translateChunk(chunk));
    }
    translatedParagraphs.push(translatedChunks.join(" "));
  }
  return translatedParagraphs.join("\n\n");
}
