import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/home-businesses")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Home Businesses in Saudi Arabia — Pure Table" },
      { name: "description", content: "Home chefs and small kitchens preparing safe gluten-free meals, snacks and cakes for delivery." },
      { property: "og:title", content: "Gluten-Free Home Businesses in Saudi Arabia" },
      { property: "og:description", content: "Support small home businesses making gluten-free food across Saudi Arabia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/home-businesses" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/home-businesses" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Home Businesses in Saudi Arabia",
          url: "https://puretable.co/home-businesses",
          description: "Home chefs and small kitchens preparing safe gluten-free meals, snacks and cakes for delivery.",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: HomeBiz,
});

function HomeBiz() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.home_businesses")}
      title={t("pages.home_title")}
      description={text("pages.home_desc")}
      items={data.filter((b) => hasCategory(b, "home"))}
    />
  );
}
