import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MapPin, Map as MapIcon, Pencil, Construction } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CantiereDialog } from "@/components/cantiere-dialog";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { usePermessiCommerciale } from "@/hooks/use-permessi-commerciale";
import type { CantiereRow } from "@/lib/cantieri";

export function ClienteCantieriTab({
  clienteId,
  ragioneSociale,
}: {
  clienteId: string;
  ragioneSociale?: string | null;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { puoEliminareCantiere } = usePermessiCommerciale();
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const queryKey = useMemo(() => ["cantieri", clienteId] as const, [clienteId]);

  const soggettoFisso = useMemo(
    () => ({ tipo: "cliente" as const, id: clienteId, etichetta: ragioneSociale?.trim() || "Cliente" }),
    [clienteId, ragioneSociale],
  );
  const queryKeysExtra = useMemo(() => [["cantieri", clienteId]], [clienteId]);

  function mostraSuMappa(c: { id: string; lat: number | null; lng: number | null }) {
    if (c.lat == null || c.lng == null) {
      toast.error("Cantiere non posizionato: verifica l'indirizzo");
      return;
    }
    navigate({ to: "/cantieri", search: { tab: "mappa", focus: c.id } });
  }

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cantieri")
        .select("*, sede:stores!cantieri_sede_piu_vicina_id_fkey(nome)")
        .eq("cliente_id", clienteId)
        .order("attivo", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CantiereRow[];
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cantieri").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cantiere eliminato");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["cantieri-lista"] });
    },
    onError: () => toast.error("Eliminazione non riuscita: non hai i permessi su questo cantiere."),
  });

  const editingCantiere = data?.find((c) => c.id === editId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)}>
          <Plus className="size-4" /> Nuovo cantiere
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : data?.length === 0 ? (
        <Card className="p-12 text-center">
          <Construction className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessun cantiere</p>
          <p className="text-xs text-muted-foreground mt-1">Aggiungi un cantiere per tracciare le forniture.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{c.nome}</p>
                    {c.attivo ? (
                      <Badge className="bg-success/15 text-success">Attivo</Badge>
                    ) : (
                      <Badge variant="outline">Chiuso</Badge>
                    )}
                  </div>
                  {c.descrizione && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descrizione}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost" size="icon" title="Mostra su mappa"
                    onClick={() => mostraSuMappa(c)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <MapIcon className="size-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" title="Modifica"
                    onClick={() => setEditId(c.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {puoEliminareCantiere(c) && (
                    <BottoneElimina
                      titolo="Eliminare questo cantiere?"
                      descrizione={`"${c.nome}" verrà eliminato definitivamente. L'azione è irreversibile.`}
                      onConferma={() => delMut.mutateAsync(c.id)}
                    />
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                {(c.indirizzo || c.citta) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="size-3.5 mt-0.5 shrink-0" />
                    <span>
                      {c.indirizzo}
                      {c.citta && `${c.indirizzo ? ", " : ""}${c.citta}`}
                      {c.provincia && ` (${c.provincia})`}
                      {c.cap && ` — ${c.cap}`}
                    </span>
                  </div>
                )}
                {c.referente && <div>Referente: <span className="text-foreground">{c.referente}</span></div>}
                {(c.data_inizio || c.data_fine_prevista) && (
                  <div>
                    {c.data_inizio && `dal ${new Date(c.data_inizio).toLocaleDateString("it-IT")}`}
                    {c.data_fine_prevista && ` al ${new Date(c.data_fine_prevista).toLocaleDateString("it-IT")}`}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CantiereDialog
        open={openNew}
        onOpenChange={setOpenNew}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
      />

      <CantiereDialog
        open={!!editingCantiere}
        onOpenChange={(o) => !o && setEditId(null)}
        cantiere={editingCantiere}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
      />
    </div>
  );
}
