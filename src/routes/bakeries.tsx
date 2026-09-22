import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/bakeries")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Bakeries in Saudi Arabia — Pure Table" },
      { name: "description", content: "Dedicated gluten-free bakeries in Riyadh, Jeddah, Dammam and Khobar — breads, cakes and pastries." },
      { property: "og:title", content: "Gluten-Free Bakeries in Saudi Arabia" },
      { property: "og:description", content: "Discover bakeries producing safe gluten-free breads, cakes and treats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/bakeries" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/bakeries" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Bakeries in Saudi Arabia",
          url: "https://puretable.co/bakeries",
          description: "Dedicated gluten-free bakeries in Riyadh, Jeddah, Dammam and Khobar — breads, cakes and pastries.",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: Bakeries,
});

function Bakeries() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.bakeries")}
      title={text("pages.bakeries_title")}
      description={text("pages.bakeries_desc")}
      items={data.filter((b) => hasCategory(b, "bakery"))}
    />
  );
}
