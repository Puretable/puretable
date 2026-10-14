import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { supabaseAnon } from "../supabase";
import { PUBLIC_BUSINESS_COLUMNS } from "@/lib/businesses.server";

export function registerGetPlaceTool(server: McpServer) {
  server.registerTool(
    "get_gluten_free_place",
    {
      title: "Get gluten-free place details",
      description:
        "Get full public details for one Pure Table listing by its slug: description, gluten-free products, opening hours, contact info, branches and delivery/ordering links.",
      inputSchema: z.object({
        slug: z
          .string()
          .trim()
          .describe("Business slug, as returned by search_gluten_free_places."),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ slug }) => {
      const supabase = supabaseAnon();
      const { data: business, error } = await supabase
        .from("businesses")
        .select(PUBLIC_BUSINESS_COLUMNS)
        .eq("published", true)
        .eq("slug", slug)
        .maybeSingle();
      if (error) return { isError: true, content: [{ type: "text", text: error.message }] };
      if (!business) {
        return {
          isError: true,
          content: [{ type: "text", text: `No published business found with slug "${slug}".` }],
        };
      }

      const [{ data: links }, { data: branches }] = await Promise.all([
        supabase
          .from("business_links")
          .select("platform,label,product_name,url,sort_order")
          .eq("business_id", business.id)
          .order("sort_order"),
        supabase
          .from("business_branches")
          .select("name,name_ar,city,address,phone,hours,maps_url,lat,lng,sort_order")
          .eq("business_id", business.id)
          .eq("published", true)
          .order("sort_order"),
      ]);

      const { id: _id, ...pub } = business as Record<string, unknown>;
      const payload = {
        ...pub,
        url: `https://puretable.co/business/${business.slug}`,
        order_links: links ?? [],
        branches: branches ?? [],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: { business: payload },
      };
    },
  );
}
