// Lista opportunità di un soggetto (cliente o lead). Riusa OpportunitaDialog con soggetto fisso.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunitaDialog } from "@/components/opportunita-dialog";
import {
  STATO_LABEL, STATO_CLASS, TIPO_LABEL, fmtEuro, fmtData, type OpportunitaRow,
} from "@/lib/opportunita";

export function OpportunitaSoggettoLista({
  soggetto,
}: {
  soggetto: { tipo: "cliente" | "lead"; id: string; etichetta?: string | null; clienteIdAssociato?: string | null };
}) {
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["opportunita-soggetto", soggetto.tipo, soggetto.id] as const,
    [soggetto.tipo, soggetto.id],
  );

  const soggettoFisso = useMemo(
    () => ({
      tipo: soggetto.tipo,
      id: soggetto.id,
      etichetta: soggetto.etichetta?.trim() || (soggetto.tipo === "cliente" ? "Cliente" : "Lead"),
      clienteIdAssociato: soggetto.clienteIdAssociato ?? null,
    }),
    [soggetto.tipo, soggetto.id, soggetto.etichetta, soggetto.clienteIdAssociato],
  );

  const queryKeysExtra = useMemo(() => [queryKey], [queryKey]);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const col = soggetto.tipo === "cliente" ? "cliente_id" : "lead_id";
      const { data, error } = await supabase
        .from("opportunita")
        .select("*, clienti(ragione_sociale, codice_agente), lead(ragione_sociale, nome, cognome), cantieri(nome)")
        .eq(col, soggetto.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OpportunitaRow[];
    },
  });

  const editing = data?.find((o) => o.id === editId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setOpenNew(true)}>
          <Plus className="size-4" /> Nuova opportunità
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <Card className="p-12 text-center">
          <Target className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessuna opportunità</p>
          <p className="text-xs text-muted-foreground mt-1">
            Crea un&apos;opportunità per tracciare trattative e preventivi.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{o.titolo}</p>
                    <Badge variant="outline" className={STATO_CLASS[o.stato]}>{STATO_LABEL[o.stato]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{TIPO_LABEL[o.tipo]}</p>
                </div>
                <Button variant="ghost" size="icon" title="Modifica" onClick={() => setEditId(o.id)}>
                  <Pencil className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Valore stimato</p>
                  <p className="font-medium">{fmtEuro(o.valore_stimato)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Chiusura prevista</p>
                  <p className="font-medium">{fmtData(o.data_prevista_chiusura)}</p>
                </div>
                {o.agente_codice && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Agente</p>
                    <p className="font-medium">{o.agente_codice}</p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <OpportunitaDialog
        open={openNew}
        onOpenChange={setOpenNew}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
      />
      <OpportunitaDialog
        open={!!editId}
        onOpenChange={(v) => { if (!v) setEditId(null); }}
        opportunita={editing}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
        onDeleted={() => setEditId(null)}
      />
    </div>
  );
}
