import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cercaCandidatiRiconciliazione } from "@/lib/firma-privacy.functions";
import { SoggettoCombobox } from "@/components/soggetto-combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ClienteScelto = { id: string; etichetta: string };
type Esito = {
  ok?: boolean;
  cliente_id?: string;
  contatti_spostati?: number;
  contatti_uniti?: number;
  contatti_creati?: number;
};

/**
 * Collega un lead a un cliente ESISTENTE come contatto (RPC collega_lead_a_cliente).
 * Suggerimenti dalla regola esistente di riconciliazione eventi (nessuna regola nuova).
 */
export function CollegaLeadClienteDialog({
  leadId,
  nomeLead,
  open,
  onOpenChange,
  onCollegato,
}: {
  leadId: string;
  nomeLead: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCollegato?: (clienteId: string) => void;
}) {
  const qc = useQueryClient();
  const cercaFn = useServerFn(cercaCandidatiRiconciliazione);
  const [scelto, setScelto] = useState<ClienteScelto | null>(null);
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    if (!open) setScelto(null);
  }, [open]);

  const { data: suggeriti, isLoading } = useQuery({
    queryKey: ["lead-collega-suggeriti", leadId],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const { data: p, error } = await supabase
          .from("eventi_partecipanti")
          .select("id")
          .eq("lead_id", leadId)
          .limit(1)
          .maybeSingle();
        if (error || !p?.id) return [];
        const righe = await cercaFn({ data: { partecipanteId: p.id } });
        return (righe ?? []).filter((c) => c.tipo === "cliente");
      } catch {
        return [];
      }
    },
  });

  async function collega() {
    if (!scelto) return;
    setInvio(true);
    try {
      const { data, error } = await supabase.rpc("collega_lead_a_cliente", {
        _lead_id: leadId,
        _cliente_id: scelto.id,
      });
      if (error) throw error;
      const e = (data ?? {}) as Esito;
      const parti: string[] = [];
      if ((e.contatti_spostati ?? 0) > 0) parti.push(`${e.contatti_spostati} contatti spostati`);
      if ((e.contatti_uniti ?? 0) > 0) parti.push(`${e.contatti_uniti} contatti uniti`);
      if ((e.contatti_creati ?? 0) > 0) parti.push(`${e.contatti_creati} contatti creati`);
      toast.success(`Lead collegato a ${scelto.etichetta}`, {
        description: parti.length ? parti.join(" · ") : undefined,
      });
      for (const k of [["lead", leadId], ["lead-storico", leadId], ["lead-lista"], ["lead-conteggi"], ["lead-contatti", leadId]]) {
        qc.invalidateQueries({ queryKey: k });
      }
      onOpenChange(false);
      onCollegato?.(scelto.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    } finally {
      setInvio(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !invio && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overflow-x-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collega a un cliente come contatto</DialogTitle>
          <DialogDescription className="break-words">
            La persona di questo lead diventa un contatto del cliente scelto e porta con sé privacy e
            consensi. Se nel cliente c'è già la stessa persona, i due contatti vengono uniti. Il lead
            resta nello storico come convertito.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium break-words">Lead: {nomeLead}</p>

        {scelto ? (
          <div className="flex items-center gap-2 rounded-md border p-3">
            <Check className="size-4 shrink-0 text-success" />
            <span className="min-w-0 flex-1 break-words font-medium">{scelto.etichetta}</span>
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setScelto(null)} disabled={invio}>
              Cambia
            </Button>
          </div>
        ) : (
          <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <p className="text-sm font-medium">Clienti suggeriti</p>
              {isLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Ricerca suggerimenti…
                </p>
              ) : !suggeriti || suggeriti.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun cliente suggerito</p>
              ) : (
                <ul className="space-y-2">
                  {suggeriti.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setScelto({ id: c.id, etichetta: c.etichetta })}
                        className="w-full min-h-10 rounded-md border p-2.5 text-left hover:bg-muted/50"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-medium">{c.etichetta}</span>
                          {c.forte && <Badge variant="secondary">Corrispondenza forte</Badge>}
                        </div>
                        {c.motivi?.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground break-words">{c.motivi.join(" · ")}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Cerca un altro cliente</p>
              <SoggettoCombobox
                soloClienti
                placeholder="Cerca cliente…"
                onSelect={(s) => setScelto({ id: s.id, etichetta: s.etichetta })}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invio}>
            Annulla
          </Button>
          <Button onClick={() => void collega()} disabled={!scelto || invio}>
            {invio && <Loader2 className="size-4 animate-spin" />}
            Collega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
