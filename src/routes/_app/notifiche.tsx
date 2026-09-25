import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { NotificaRiga } from "@/components/notifiche/notifica-riga";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { contaNonLette, notificheNonLetteQueryKey, type Notifica } from "@/lib/notifiche";

export const Route = createFileRoute("/_app/notifiche")({
  head: () => ({
    meta: [
      { title: "Notifiche — FidiManager" },
      { name: "description", content: "Consulta e gestisci tutte le tue notifiche FidiManager." },
      { property: "og:title", content: "Notifiche — FidiManager" },
      { property: "og:description", content: "Consulta e gestisci tutte le tue notifiche FidiManager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotifichePage,
});

const PER_PAGE = 50;
type Filtro = "non-lette" | "tutte";

function NotifichePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("non-lette");
  const [pagina, setPagina] = useState(0);
  const [azioneInCorso, setAzioneInCorso] = useState(false);

  const { data: nonLette = 0 } = useQuery({
    queryKey: notificheNonLetteQueryKey(user?.id),
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
    queryFn: () => contaNonLette(user?.id ?? ""),
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["notifiche", "elenco", user?.id, filtro, pagina],
    enabled: Boolean(user?.id),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!user?.id) return { righe: [] as Notifica[], totale: 0 };
      let query = supabase
        .from("notifiche")
        .select("id, tipo, titolo, messaggio, link, letta, conteggio, created_at, aggiornata_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("aggiornata_at", { ascending: false })
        .range(pagina * PER_PAGE, pagina * PER_PAGE + PER_PAGE - 1);
      if (filtro === "non-lette") query = query.eq("letta", false);
      const { data: righe, count, error } = await query;
      if (error) throw error;
      return { righe: (righe ?? []) as Notifica[], totale: count ?? 0 };
    },
  });

  const righe = data?.righe ?? [];
  const totale = data?.totale ?? 0;
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGE));

  useEffect(() => {
    if (!isFetching && pagina > 0 && pagina >= totalePagine) setPagina(totalePagine - 1);
  }, [isFetching, pagina, totalePagine]);

  async function segnaLetta(id: string) {
    const { error } = await supabase.from("notifiche").update({ letta: true }).eq("id", id);
    if (error) {
      toast.error("Non è stato possibile segnare la notifica come letta");
      throw error;
    }
    if (user?.id) {
      queryClient.setQueryData<number>(notificheNonLetteQueryKey(user.id), (corrente = 0) => Math.max(0, corrente - 1));
    }
    await refetch();
  }

  async function segnaTutteLette() {
    if (!user?.id || azioneInCorso) return;
    setAzioneInCorso(true);
    try {
      const { error } = await supabase
        .from("notifiche")
        .update({ letta: true })
        .eq("user_id", user.id)
        .eq("letta", false);
      if (error) throw error;
      queryClient.setQueryData(notificheNonLetteQueryKey(user.id), 0);
      setPagina(0);
      await queryClient.invalidateQueries({ queryKey: ["notifiche", "elenco", user.id] });
      toast.success("Tutte le notifiche sono state segnate come lette");
    } catch {
      toast.error("Non è stato possibile segnare tutte le notifiche come lette");
    } finally {
      setAzioneInCorso(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Bell className="size-7 shrink-0 text-primary" /> Notifiche
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {nonLette === 1 ? "1 notifica non letta" : `${nonLette.toLocaleString("it-IT")} notifiche non lette`}
          </p>
        </div>
        {nonLette > 0 && (
          <Button className="min-h-10 w-full sm:w-auto" variant="outline" onClick={segnaTutteLette} disabled={azioneInCorso}>
            <Check className="size-4" />
            {azioneInCorso ? "Aggiornamento…" : "Segna tutte lette"}
          </Button>
        )}
      </div>

      <Tabs
        value={filtro}
        onValueChange={(value) => {
          setFiltro(value as Filtro);
          setPagina(0);
        }}
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="non-lette" className="min-h-10 flex-1 sm:flex-none">Non lette</TabsTrigger>
          <TabsTrigger value="tutte" className="min-h-10 flex-1 sm:flex-none">Tutte</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}
          </div>
        ) : righe.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {filtro === "non-lette" ? "Non hai notifiche da leggere." : "Non hai ancora ricevuto notifiche."}
          </div>
        ) : (
          <ul className="divide-y">
            {righe.map((notifica) => (
              <li key={notifica.id}>
                <NotificaRiga notifica={notifica} onSegnaLetta={segnaLetta} className="px-4 py-4 sm:px-5" />
              </li>
            ))}
          </ul>
        )}

        {totale > PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={pagina === 0 || isFetching}
              onClick={() => setPagina((corrente) => Math.max(0, corrente - 1))}
            >
              Precedente
            </Button>
            <span className="order-first w-full text-center text-sm text-muted-foreground sm:order-none sm:w-auto">
              Pagina {pagina + 1} di {totalePagine}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              disabled={(pagina + 1) * PER_PAGE >= totale || isFetching}
              onClick={() => setPagina((corrente) => corrente + 1)}
            >
              Successiva
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
