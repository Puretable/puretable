/**
 * Shared social-preview image. Businesses use their own cover when they have
 * one; every other page (and covers-less businesses) falls back to this
 * branded card so a shared link never renders without an image.
 *
 * Filename is versioned (v2) so chat apps and crawlers that cache preview images by URL (WhatsApp,
 * Slack, etc.) pick up the new artwork instead of serving a stale cached copy of the old one.
 */
export const OG_IMAGE = "https://www.puretable.co/og-pure-table-v2.png";

export function ogImageMeta(url?: string | null) {
  const src = url && /^https:\/\//i.test(url) ? url : OG_IMAGE;
  const isDefault = src === OG_IMAGE;
  return [
    { property: "og:image", content: src },
    { name: "twitter:image", content: src },
    // A business's own cover photo can be any size — only declare fixed dimensions for the
    // branded default card, which is always exactly 1200x630.
    ...(isDefault
      ? [
          { property: "og:image:width", content: "1200" },
          { property: "og:image:height", content: "630" },
          { property: "og:image:alt", content: "Pure Table — Gluten-Free Directory, Saudi Arabia" },
        ]
      : []),
  ];
}
