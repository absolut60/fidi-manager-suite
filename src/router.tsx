import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function isAuthError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; message?: string } | null;
  if (!e) return false;
  if (e.status === 401 || e.status === 403) return true;
  const msg = `${e.code ?? ""} ${e.message ?? ""}`.toLowerCase();
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("pgrst301") ||
    msg.includes("refresh token")
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Errori di rete transitori: ritenta; errori di autenticazione: no.
        retry: (failureCount, error) => !isAuthError(error) && failureCount < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
        // Le query NON devono mai risalire all'error boundary globale.
        throwOnError: false,
      },
      mutations: { throwOnError: false },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
