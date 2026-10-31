import { useQuery } from "@tanstack/react-query";
import { getQallingHomeContentRows } from "@/lib/qalling-site.functions";

export function useQallingHomeContent() {
  return useQuery({ queryKey: ["site-content", "qalling-home"], staleTime: 0, queryFn: () => getQallingHomeContentRows() });
}
