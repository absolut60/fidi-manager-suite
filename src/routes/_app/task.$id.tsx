import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CanaleConversazione } from "@/components/chat/canale-conversazione";
import { STATO_LABEL, STATO_BADGE, type StatoTask } from "@/lib/task-stato";
import type { Database } from "@/integrations/supabase/types";

type TaskRow = Database["public"]["Tables"]["task"]["Row"];

export const Route = createFileRoute("/_app/task/$id")({
  component: TaskDetailPage,
  head: () => ({
    meta: [
      { title: "Task — FidiManager" },
      { name: "description", content: "Dettaglio di un task e relativi commenti." },
      { property: "og:title", content: "Task — FidiManager" },
      { property: "og:description", content: "Dettaglio di un task e relativi commenti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TaskDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: task, isLoading: loadingTask } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as TaskRow | null;
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["chat", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profili")
        .select("id, nome, cognome, attivo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: aree } = useQuery({
    queryKey: ["task", "aree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("aree_funzionali")
        .select("id, nome")
        .eq("attiva", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  function nomeUtente(uid: string | null) {
    if (!uid) return null;
    const p = (profili ?? []).find((x) => x.id === uid);
    if (!p) return "—";
    return [p.nome, p.cognome].filter(Boolean).join(" ") || "—";
  }

  function nomeArea(aid: string | null) {
    if (!aid) return null;
    const a = (aree ?? []).find((x) => x.id === aid);
    return a?.nome ?? "—";
  }

  if (loadingTask) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-[70vh] w-full" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate({ to: "/task" })}>
          <ArrowLeft className="mr-2 size-4" /> Torna ai task
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Task non trovato</p>
            <Button className="mt-4" onClick={() => navigate({ to: "/task" })}>
              Torna ai task
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scaduto =
    !!task.scadenza &&
    task.stato !== "fatto" &&
    task.stato !== "annullato" &&
    isBefore(new Date(task.scadenza), startOfDay(new Date()));
  const badge = STATO_BADGE[task.stato as StatoTask];

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/task" })}>
        <ArrowLeft className="mr-2 size-4" /> Torna ai task
      </Button>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{task.titolo}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Creato il {format(new Date(task.created_at), "d MMM yyyy", { locale: it })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dettagli</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Stato</div>
                <Badge variant={badge.variant} className={badge.className}>
                  {STATO_LABEL[task.stato as StatoTask]}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Scadenza</div>
                <div className={`text-sm ${scaduto ? "text-destructive font-medium" : ""}`}>
                  {task.scadenza
                    ? format(new Date(task.scadenza), "d MMM yyyy", { locale: it })
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Titolare</div>
                <div className="text-sm">{nomeUtente(task.titolare_id) ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Esecutore</div>
                <div className="text-sm text-muted-foreground">
                  {task.esecutore_id ? nomeUtente(task.esecutore_id) : "— non assegnato"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Area</div>
                <div className="text-sm">{nomeArea(task.area_id) ?? "—"}</div>
              </div>
            </div>
            {task.descrizione && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Descrizione
                </div>
                <div className="text-sm whitespace-pre-wrap">{task.descrizione}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[70vh] flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessagesSquare className="size-5" /> Commenti
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            {task.canale_id ? (
              <CanaleConversazione canaleId={task.canale_id} />
            ) : (
              <div className="text-sm text-muted-foreground">
                Nessun canale commenti disponibile
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
