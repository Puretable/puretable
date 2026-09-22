import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/restaurants")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Restaurants in Saudi Arabia — Pure Table" },
      { name: "description", content: "Browse trusted gluten-free restaurants across Riyadh, Jeddah, Dammam, and Khobar." },
      { property: "og:title", content: "Gluten-Free Restaurants in Saudi Arabia" },
      { property: "og:description", content: "Restaurants with dedicated gluten-free menus and celiac-safe kitchens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/restaurants" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/restaurants" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Restaurants in Saudi Arabia",
          url: "https://puretable.co/restaurants",
          description: "Browse trusted gluten-free restaurants across Riyadh, Jeddah, Dammam, and Khobar.",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: Restaurants,
});

function Restaurants() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.restaurants")}
      title={text("pages.restaurants_title")}
      description={text("pages.restaurants_desc")}
      items={data.filter((b) => hasCategory(b, "restaurant"))}
    />
  );
}
