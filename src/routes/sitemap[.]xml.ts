import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { fetchPublicBusinesses } from "@/lib/businesses.server";

const BASE_URL = "https://puretable.co";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/about", changefreq: "monthly", priority: "0.6" },
          { path: "/restaurants", changefreq: "weekly", priority: "0.9" },
          { path: "/cafes", changefreq: "weekly", priority: "0.9" },
          { path: "/bakeries", changefreq: "weekly", priority: "0.9" },
          { path: "/desserts", changefreq: "weekly", priority: "0.9" },
          { path: "/supermarkets", changefreq: "weekly", priority: "0.9" },
          { path: "/home-businesses", changefreq: "weekly", priority: "0.9" },
          { path: "/contact", changefreq: "monthly", priority: "0.5" },
          { path: "/complaints", changefreq: "monthly", priority: "0.5" },
          { path: "/faq", changefreq: "weekly", priority: "0.5" },
        ];

        try {
          const businesses = await fetchPublicBusinesses();
          for (const b of businesses) {
            entries.push({ path: `/business/${b.id}`, changefreq: "weekly", priority: "0.8" });
          }
        } catch {
          // listings unavailable — still serve the static routes
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
