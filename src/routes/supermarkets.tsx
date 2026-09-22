import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { useSiteText } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import { CategoryPage } from "@/components/site/CategoryPage";
import { hasCategory } from "@/data/businesses";
import { listBusinesses } from "@/lib/businesses.public.functions";

export const Route = createFileRoute("/supermarkets")({
  head: () => ({
    meta: [
      { title: "Gluten-Free Supermarkets in Saudi Arabia — Pure Table" },
      {
        name: "description",
        content:
          "Supermarkets and grocery stores in Saudi Arabia stocking gluten-free flours, breads, pasta and snacks for celiac shoppers.",
      },
      { property: "og:title", content: "Gluten-Free Supermarkets in Saudi Arabia" },
      { property: "og:description", content: "Find stores stocking certified gluten-free groceries near you." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...ogImageMeta(),
      { property: "og:url", content: "https://puretable.co/supermarkets" },
    ],
    links: [{ rel: "canonical", href: "https://puretable.co/supermarkets" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gluten-Free Supermarkets in Saudi Arabia",
          url: "https://puretable.co/supermarkets",
          description: "Gluten-Free Supermarkets in Saudi Arabia",
          isPartOf: { "@type": "WebSite", name: "Pure Table", url: "https://puretable.co/" },
        }),
      },
    ],
  }),
  component: Supermarkets,
});

function Supermarkets() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { data = [] } = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses() });
  return (
    <CategoryPage
      eyebrow={t("nav.supermarkets")}
      title={t("pages.supermarkets_title")}
      description={text("pages.supermarkets_desc")}
      items={data.filter((b) => hasCategory(b, "supermarket"))}
    />
  );
}
