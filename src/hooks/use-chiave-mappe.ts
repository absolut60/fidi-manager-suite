import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChiaveMappe } from "@/lib/cantieri.functions";

/** Unica cache client della chiave: sempre stringa o null, mai { key }. */
export function useChiaveMappe({ enabled = true }: { enabled?: boolean } = {}) {
  const chiaveMappe = useServerFn(getChiaveMappe);
  return useQuery({
    queryKey: ["chiave-mappe"],
    queryFn: async (): Promise<string | null> => (await chiaveMappe()).key ?? null,
    staleTime: Infinity,
    retry: false,
    enabled,
  });
}