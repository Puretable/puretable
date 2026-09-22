import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/desserts")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Desserts in Saudi Arabia — Pure Table" },
      { name: "description", content: "Cakes, cookies and desserts made gluten-free in Riyadh, Jeddah, Dammam and Khobar — curated for celiac safety." },
      { property: "og:title", content: "Gluten-Free Desserts in Saudi Arabia" },
      { property: "og:description", content: "Discover dessert makers producing safe gluten-free cakes, cookies and sweets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/desserts" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/desserts" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Desserts in Saudi Arabia",
          url: "https://puretable.co/desserts",
          description: "Cakes, cookies and desserts made gluten-free in Riyadh, Jeddah, Dammam and Khobar — curated for celiac safety.",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: Desserts,
});

function Desserts() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.desserts")}
      title={text("pages.desserts_title")}
      description={text("pages.desserts_desc")}
      items={data.filter((b) => hasCategory(b, "dessert"))}
    />
  );
}
