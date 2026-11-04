import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { qallingDomainRewrite } from "./lib/qalling-urls";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data fresh for 30s instead of refetching on every mount/navigation.
        // Mutations still invalidate their keys explicitly, so saves show immediately.
        staleTime: 30_000,
        // Don't re-run every query when the tab regains focus (avoids query storms).
        refetchOnWindowFocus: false,
        // Single retry on transient failures — avoids 3x retry hangs.
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Alamat bersih di domain Qalling (qalling.id/harga ↔ /qalling/harga) agar SSR dan hydration konsisten.
    rewrite: qallingDomainRewrite,
  });

  return router;
};
