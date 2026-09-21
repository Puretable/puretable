import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPlanCatalog } from "@/lib/owner-portal.functions";

/**
 * Plan definitions are public (RLS lets anyone read them), so admins and business owners share the
 * same public loader. Editing them stays admin-only (`updatePlanDefinition`).
 */
export function usePlanDefinitions() {
  const read = useServerFn(listPlanCatalog);
  return useQuery({
    queryKey: ["plan-definitions"],
    queryFn: () => read(),
    refetchInterval: 30000,
  });
}
