import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LEAD_STATO_LABEL, transizioniDa, transizioneAmmessa, type LeadStato,
} from "@/lib/lead-costanti";

type Profilo = { id: string; nome: string | null; cognome: string | null };

const NESSUNO = "__none__";

function nomeUtente(p: Profilo): string {
  return `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || p.id;
}

export function LeadAzioniStato({
  leadId,
  stato,
  assegnatoA,
  profili,
  operatoreId,
}: {
  leadId: string;
  stato: LeadStato;
  assegnatoA: string | null;
  profili: Profilo[];
  operatoreId: string | null;
}) {
  const qc = useQueryClient();
  const [dialogPerso, setDialogPerso] = useState(false);
  const [motivo, setMotivo] = useState("");

  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-storico", leadId] });
    qc.invalidateQueries({ queryKey: ["lead-lista"] });
  };

  /** Unico percorso di scrittura per stato/assegnazione + storico. */
  const registra = async (opts: {
    nuovoStato?: LeadStato;
    assegnatoA?: string | null;
    motivoPerdita?: string | null;
    nota: string;
  }) => {
    const patch: Record<string, unknown> = {};
    if (opts.nuovoStato) patch.stato = opts.nuovoStato;
    if (opts.assegnatoA !== undefined) {
      patch.assegnato_a = opts.assegnatoA;
      patch.assegnato_il = opts.assegnatoA ? new Date().toISOString() : null;
    }
    if (opts.motivoPerdita !== undefined) patch.motivo_perdita = opts.motivoPerdita;

    const { error } = await supabase.from("lead").update(patch).eq("id", leadId);
    if (error) throw error;

    const { error: e2 } = await supabase.from("lead_storico").insert({
      lead_id: leadId,
      stato_da: stato,
      stato_a: opts.nuovoStato ?? stato,
      operatore_id: operatoreId,
      nota: opts.nota,
    });
    if (e2) throw e2;
  };

  const transizioneMut = useMutation({
    mutationFn: async (a: LeadStato) => {
      if (!transizioneAmmessa(stato, a)) throw new Error("Transizione non ammessa");
      await registra({
        nuovoStato: a,
        ...(a === "nuovo" && stato === "perso" ? { motivoPerdita: null } : {}),
        nota: `Stato: ${LEAD_STATO_LABEL[stato]} → ${LEAD_STATO_LABEL[a]}`,
      });
    },
    onSuccess: () => { toast.success("Stato aggiornato"); invalida(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const persoMut = useMutation({
    mutationFn: async () => {
      const m = motivo.trim();
      if (!m) throw new Error("Il motivo della perdita è obbligatorio");
      await registra({
        nuovoStato: "perso",
        motivoPerdita: m,
        nota: `Stato: ${LEAD_STATO_LABEL[stato]} → Perso — motivo: ${m}`,
      });
    },
    onSuccess: () => {
      toast.success("Lead segnato come perso");
      setDialogPerso(false);
      setMotivo("");
      invalida();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assegnaMut = useMutation({
    mutationFn: async (userId: string | null) => {
      if (!userId) {
        await registra({ assegnatoA: null, nota: "Assegnazione rimossa" });
        return;
      }
      const p = profili.find((x) => x.id === userId);
      const nome = p ? nomeUtente(p) : userId;
      const promuove = stato === "nuovo";
      await registra({
        assegnatoA: userId,
        ...(promuove ? { nuovoStato: "assegnato" as LeadStato } : {}),
        nota: promuove ? `Assegnato a ${nome}` : `Riassegnato a ${nome}`,
      });
    },
    onSuccess: () => { toast.success("Assegnazione aggiornata"); invalida(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = transizioneMut.isPending || persoMut.isPending || assegnaMut.isPending;
  const transizioni = transizioniDa(stato).filter((s) => s !== "perso");
  const puoPerdere = transizioneAmmessa(stato, "perso");
  const riapre = stato === "perso";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <UserPlus className="size-4 text-muted-foreground" />
          <Select
            value={assegnatoA || NESSUNO}
            disabled={busy}
            onValueChange={(v) => assegnaMut.mutate(v === NESSUNO ? null : v)}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Assegna a…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NESSUNO}>Nessun assegnatario</SelectItem>
              {profili.map((p) => (
                <SelectItem key={p.id} value={p.id}>{nomeUtente(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {transizioni.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "nuovo" ? "outline" : "secondary"}
            disabled={busy}
            className="gap-1.5"
            onClick={() => transizioneMut.mutate(s)}
          >
            {riapre && <RotateCcw className="size-4" />}
            {riapre ? "Riapri lead" : `→ ${LEAD_STATO_LABEL[s]}`}
          </Button>
        ))}

        {puoPerdere && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={busy}
            onClick={() => { setMotivo(""); setDialogPerso(true); }}
          >
            Segna come perso
          </Button>
        )}

        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <Dialog open={dialogPerso} onOpenChange={(o) => !persoMut.isPending && setDialogPerso(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segna il lead come perso</DialogTitle>
            <DialogDescription>Indica il motivo della perdita: verrà salvato sul lead e nello storico.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Motivo perdita *</Label>
            <Textarea
              rows={3}
              maxLength={1000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Es. prezzo fuori budget, ha scelto un concorrente…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPerso(false)} disabled={persoMut.isPending}>
              Annulla
            </Button>
            <Button
              variant="destructive"
              disabled={persoMut.isPending || !motivo.trim()}
              onClick={() => persoMut.mutate()}
            >
              {persoMut.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Conferma perdita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
