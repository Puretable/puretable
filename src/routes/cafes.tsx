import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/cafes")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Cafes in Saudi Arabia — Pure Table" },
      { name: "description", content: "Discover cafes serving certified gluten-free pastries, breakfast, and specialty coffee across Saudi Arabia." },
      { property: "og:title", content: "Gluten-Free Cafes in Saudi Arabia" },
      { property: "og:description", content: "Curated cafes with entirely gluten-free menus or dedicated GF sections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/cafes" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/cafes" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Cafes in Saudi Arabia",
          url: "https://puretable.co/cafes",
          description: "Discover cafes serving certified gluten-free pastries, breakfast, and specialty coffee across Saudi Arabia.",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: Cafes,
});

function Cafes() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.cafes")}
      title={t("pages.cafes_title")}
      description={text("pages.cafes_desc")}
      items={data.filter((b) => hasCategory(b, "cafe"))}
    />
  );
}
