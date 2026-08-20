// Dialog creazione / modifica opportunità commerciale.
// Riusa SoggettoCombobox (ricerca unica clienti + lead) e i componenti UI esistenti.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SoggettoCombobox } from "@/components/soggetto-combobox";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { usePermessiCommerciale } from "@/hooks/use-permessi-commerciale";
import {
  TIPI_OPPORTUNITA, STATI_OPPORTUNITA, TIPO_LABEL, STATO_LABEL,
  type OpportunitaRow, type TipoOpportunita, type StatoOpportunita,
} from "@/lib/opportunita";

type Agente = { codice: string; descrizione: string | null };
export type SoggettoFissoOpp = {
  tipo: "cliente" | "lead";
  id: string;
  etichetta: string;
  clienteIdAssociato?: string | null;
};

export function OpportunitaDialog({
  open,
  onOpenChange,
  opportunita,
  agenti,
  soggettoFisso,
  queryKeysExtra,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  opportunita?: OpportunitaRow | null;
  agenti?: Agente[];
  soggettoFisso?: SoggettoFissoOpp;
  queryKeysExtra?: ReadonlyArray<readonly unknown[]>;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const { puoEliminareOpportunita } = usePermessiCommerciale();
  const isAgente = roles.includes("agente");
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );
  const forzaAgente = isAgente && !isTrasversale;

  const { data: agentiFetch = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    enabled: !agenti,
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Agente[];
    },
    staleTime: 300_000,
  });
  const listaAgenti = agenti ?? agentiFetch;

  async function invalida() {
    await qc.invalidateQueries({ queryKey: ["opportunita-lista"] });
    await Promise.all((queryKeysExtra ?? []).map((k) => qc.invalidateQueries({ queryKey: [...k] })));
  }


  const [titolo, setTitolo] = useState("");
  const [tipo, setTipo] = useState<TipoOpportunita>("vendita");
  const [stato, setStato] = useState<StatoOpportunita>("aperta");
  const [soggetto, setSoggetto] = useState<{ tipo: "cliente" | "lead"; id: string; etichetta: string } | null>(null);
  const [cantiereId, setCantiereId] = useState<string>("");
  const [agenteCodice, setAgenteCodice] = useState<string>("");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [valore, setValore] = useState<string>("");
  const [probabilita, setProbabilita] = useState<string>("");
  const [dataPrevista, setDataPrevista] = useState<string>("");
  const [dataChiusura, setDataChiusura] = useState<string>("");
  const [motivoPerdita, setMotivoPerdita] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // codice agente dell'utente corrente (per forzare l'intestazione all'agente)
  const { data: mioCodice } = useQuery({
    queryKey: ["mio-codice-agente", user?.id],
    enabled: !!user?.id && forzaAgente,
    queryFn: async () => {
      const { data } = await supabase.from("profili").select("codice_agente").eq("id", user!.id).maybeSingle();
      return (data as { codice_agente: string | null } | null)?.codice_agente ?? "";
    },
    staleTime: 300_000,
  });

  // Reset all'apertura
  useEffect(() => {
    if (!open) return;
    const o = opportunita;
    setTitolo(o?.titolo ?? "");
    setTipo((o?.tipo as TipoOpportunita) ?? "vendita");
    setStato((o?.stato as StatoOpportunita) ?? "aperta");
    setSoggetto(
      o?.cliente_id
        ? { tipo: "cliente", id: o.cliente_id, etichetta: o.clienti?.ragione_sociale ?? "Cliente" }
        : o?.lead_id
          ? { tipo: "lead", id: o.lead_id, etichetta: o.lead?.ragione_sociale || `${o.lead?.nome ?? ""} ${o.lead?.cognome ?? ""}`.trim() || "Lead" }
          : null,
    );
    setCantiereId(o?.cantiere_id ?? "");
    setAgenteCodice(o?.agente_codice ?? "");
    setStoreId(o?.store_id ?? null);
    setValore(o?.valore_stimato != null ? String(o.valore_stimato) : "");
    setProbabilita(o?.probabilita != null ? String(o.probabilita) : "");
    setDataPrevista(o?.data_prevista_chiusura ?? "");
    setDataChiusura(o?.data_chiusura ?? "");
    setMotivoPerdita(o?.motivo_perdita ?? "");
    setNote(o?.note ?? "");
  }, [open, opportunita]);

  // Precompilazione agente/store dal soggetto selezionato
  useEffect(() => {
    if (!open || !soggetto) return;
    let annullato = false;
    (async () => {
      if (soggetto.tipo === "cliente") {
        const { data } = await supabase
          .from("clienti").select("codice_agente, store_id").eq("id", soggetto.id).maybeSingle();
        if (annullato || !data) return;
        const d = data as { codice_agente: string | null; store_id: string | null };
        if (d.codice_agente) setAgenteCodice((prev) => prev || d.codice_agente!);
        setStoreId((prev) => prev ?? d.store_id);
      } else {
        const { data } = await supabase
          .from("lead").select("agente_codice, store_id").eq("id", soggetto.id).maybeSingle();
        if (annullato || !data) return;
        const d = data as { agente_codice: string | null; store_id: string | null };
        if (d.agente_codice) setAgenteCodice((prev) => prev || d.agente_codice!);
        setStoreId((prev) => prev ?? d.store_id);
      }
    })();
    return () => { annullato = true; };
  }, [open, soggetto]);

  // Agente forzato per l'utente agente-only
  useEffect(() => {
    if (forzaAgente && mioCodice) setAgenteCodice(mioCodice);
  }, [forzaAgente, mioCodice]);

  // Cantieri del soggetto
  const { data: cantieri = [] } = useQuery({
    queryKey: ["cantieri-soggetto", soggetto?.tipo, soggetto?.id],
    enabled: open && !!soggetto,
    queryFn: async () => {
      const col = soggetto!.tipo === "cliente" ? "cliente_id" : "lead_id";
      const { data, error } = await supabase
        .from("cantieri").select("id, nome").eq(col, soggetto!.id).order("nome");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  // data_chiusura automatica su vinta/persa
  useEffect(() => {
    if (stato === "vinta" || stato === "persa") {
      setDataChiusura((prev) => prev || new Date().toISOString().slice(0, 10));
    }
  }, [stato]);

  const agentiOrdinati = useMemo(
    () => [...agenti].sort((a, b) => (a.descrizione ?? a.codice).localeCompare(b.descrizione ?? b.codice)),
    [agenti],
  );

  async function salva() {
    if (!titolo.trim()) { toast.error("Il titolo è obbligatorio"); return; }
    if (!soggetto) { toast.error("Seleziona un cliente o un lead"); return; }
    setSaving(true);
    const payload = {
      titolo: titolo.trim(),
      tipo,
      stato,
      cliente_id: soggetto.tipo === "cliente" ? soggetto.id : null,
      lead_id: soggetto.tipo === "lead" ? soggetto.id : null,
      cantiere_id: cantiereId || null,
      agente_codice: agenteCodice || null,
      store_id: storeId,
      valore_stimato: valore.trim() ? Number(valore.replace(",", ".")) : null,
      probabilita: probabilita.trim() ? Math.max(0, Math.min(100, Number(probabilita))) : null,
      data_prevista_chiusura: dataPrevista || null,
      data_chiusura: stato === "vinta" || stato === "persa" ? (dataChiusura || null) : null,
      motivo_perdita: stato === "persa" ? (motivoPerdita.trim() || null) : null,
      note: note.trim() || null,
    };
    try {
      if (opportunita?.id) {
        const { error } = await supabase.from("opportunita").update(payload).eq("id", opportunita.id);
        if (error) throw error;
        toast.success("Opportunità aggiornata");
      } else {
        const { error } = await supabase
          .from("opportunita")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
        toast.success("Opportunità creata");
      }
      await qc.invalidateQueries({ queryKey: ["opportunita-lista"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function elimina() {
    if (!opportunita?.id) return;
    const { error } = await supabase.from("opportunita").delete().eq("id", opportunita.id);
    if (error) {
      toast.error("Eliminazione non riuscita: non hai i permessi su questa opportunità.");
      return;
    }
    toast.success("Opportunità eliminata");
    await qc.invalidateQueries({ queryKey: ["opportunita-lista"] });
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{opportunita ? "Modifica opportunità" : "Nuova opportunità"}</DialogTitle>
          <DialogDescription>
            Collega l&apos;opportunità a un cliente esistente o a un lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="opp-titolo">Titolo *</Label>
            <Input id="opp-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Fornitura pavimenti villa" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoOpportunita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_OPPORTUNITA.map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stato</Label>
              <Select value={stato} onValueChange={(v) => setStato(v as StatoOpportunita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATI_OPPORTUNITA.map((s) => <SelectItem key={s} value={s}>{STATO_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Soggetto (cliente o lead) *</Label>
            {soggetto ? (
              <div className="flex items-center gap-2 mt-1 rounded-md border p-2">
                <Badge variant={soggetto.tipo === "cliente" ? "default" : "secondary"}>
                  {soggetto.tipo === "cliente" ? "Cliente" : "Lead"}
                </Badge>
                <span className="truncate text-sm font-medium flex-1">{soggetto.etichetta}</span>
                <Button variant="ghost" size="sm" onClick={() => { setSoggetto(null); setCantiereId(""); }}>
                  Cambia
                </Button>
              </div>
            ) : (
              <div className="mt-1">
                <SoggettoCombobox onSelect={(s) => { setSoggetto(s); setCantiereId(""); }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Cantiere (opzionale)</Label>
              <Select value={cantiereId || "nessuno"} onValueChange={(v) => setCantiereId(v === "nessuno" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuno</SelectItem>
                  {cantieri.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agente</Label>
              <Select
                value={agenteCodice || "nessuno"}
                onValueChange={(v) => setAgenteCodice(v === "nessuno" ? "" : v)}
                disabled={forzaAgente}
              >
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuno</SelectItem>
                  {agentiOrdinati.map((a) => (
                    <SelectItem key={a.codice} value={a.codice}>
                      {a.descrizione ?? a.codice} ({a.codice})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="opp-valore">Valore stimato (€)</Label>
              <Input id="opp-valore" inputMode="decimal" value={valore} onChange={(e) => setValore(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label htmlFor="opp-prob">Probabilità (%)</Label>
              <Input id="opp-prob" type="number" min={0} max={100} value={probabilita} onChange={(e) => setProbabilita(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="opp-data">Chiusura prevista</Label>
              <Input id="opp-data" type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
            </div>
          </div>

          {(stato === "vinta" || stato === "persa") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opp-dchiusura">Data chiusura</Label>
                <Input id="opp-dchiusura" type="date" value={dataChiusura} onChange={(e) => setDataChiusura(e.target.value)} />
              </div>
              {stato === "persa" && (
                <div>
                  <Label htmlFor="opp-motivo">Motivo perdita</Label>
                  <Input id="opp-motivo" value={motivoPerdita} onChange={(e) => setMotivoPerdita(e.target.value)} placeholder="Es. prezzo, tempi, concorrenza" />
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="opp-note">Note</Label>
            <Textarea id="opp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {opportunita && puoEliminareOpportunita(opportunita) && (
            <BottoneElimina
              variant="outline"
              etichetta="Elimina"
              className="sm:mr-auto text-destructive hover:text-destructive"
              titolo="Eliminare questa opportunità?"
              descrizione={`"${opportunita.titolo}" verrà eliminata definitivamente insieme alle attività collegate. L'azione è irreversibile.`}
              onConferma={elimina}
            />
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
