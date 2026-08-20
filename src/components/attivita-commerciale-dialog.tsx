// Dialog registrazione / modifica attività commerciale (appuntamenti, visite, chiamate…).
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import { Badge } from "@/components/ui/badge";
import { TIPI_ATTIVITA, TIPO_ATTIVITA_LABEL, type AttivitaRow, type TipoAttivita } from "@/lib/attivita-commerciale";

type Contesto = {
  opportunita_id?: string | null;
  cliente_id?: string | null;
  lead_id?: string | null;
  agente_codice?: string | null;
  store_id?: string | null;
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function AttivitaCommercialeDialog({
  open,
  onOpenChange,
  contesto,
  attivita,
  onSaved,
  dataIniziale,
  conSelettoreSoggetto = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contesto: Contesto;
  attivita?: AttivitaRow | null;
  onSaved?: () => void;
  dataIniziale?: Date | null;
  conSelettoreSoggetto?: boolean;
}) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isAgente = roles.includes("agente");
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );
  const forzaAgente = isAgente && !isTrasversale;

  const [tipo, setTipo] = useState<TipoAttivita>("appuntamento");
  const [titolo, setTitolo] = useState("");
  const [dataPianificata, setDataPianificata] = useState("");
  const [completata, setCompletata] = useState(false);
  const [esito, setEsito] = useState("");
  const [luogo, setLuogo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [soggettoMeta, setSoggettoMeta] = useState<{ agente_codice: string | null; store_id: string | null }>({ agente_codice: null, store_id: null });

  const { data: mioCodice } = useQuery({
    queryKey: ["mio-codice-agente", user?.id],
    enabled: !!user?.id && forzaAgente,
    queryFn: async () => {
      const { data } = await supabase.from("profili").select("codice_agente").eq("id", user!.id).maybeSingle();
      return (data as { codice_agente: string | null } | null)?.codice_agente ?? "";
    },
    staleTime: 300_000,
  });

  useEffect(() => {
    if (!open) return;
    const a = attivita;
    setTipo((a?.tipo as TipoAttivita) ?? "appuntamento");
    setTitolo(a?.titolo ?? "");
    setDataPianificata(toLocalInput(a?.data_pianificata));
    setCompletata(a?.completata ?? false);
    setEsito(a?.esito ?? "");
    setLuogo(a?.luogo ?? "");
    setNote(a?.note ?? "");
    setSoggetto(null);
    setSoggettoMeta({ agente_codice: null, store_id: null });
    if (!a && dataIniziale) setDataPianificata(toLocalInput(dataIniziale.toISOString()));
  }, [open, attivita, dataIniziale]);

  // Metadati (agente/store) del soggetto scelto dal calendario
  useEffect(() => {
    if (!open || !soggetto) return;
    let annullato = false;
    (async () => {
      if (soggetto.tipo === "cliente") {
        const { data } = await supabase.from("clienti").select("codice_agente, store_id").eq("id", soggetto.id).maybeSingle();
        if (annullato || !data) return;
        const d = data as { codice_agente: string | null; store_id: string | null };
        setSoggettoMeta({ agente_codice: d.codice_agente, store_id: d.store_id });
      } else {
        const { data } = await supabase.from("lead").select("agente_codice, store_id").eq("id", soggetto.id).maybeSingle();
        if (annullato || !data) return;
        const d = data as { agente_codice: string | null; store_id: string | null };
        setSoggettoMeta({ agente_codice: d.agente_codice, store_id: d.store_id });
      }
    })();
    return () => { annullato = true; };
  }, [open, soggetto]);

  async function salva() {
    if (!titolo.trim()) { toast.error("Il titolo è obbligatorio"); return; }
    const clienteId = soggetto?.tipo === "cliente" ? soggetto.id : (contesto.cliente_id ?? null);
    const leadId = soggetto?.tipo === "lead" ? soggetto.id : (contesto.lead_id ?? null);
    const opportunitaId = soggetto ? null : (contesto.opportunita_id ?? null);
    if (!opportunitaId && !clienteId && !leadId) {
      toast.error("Seleziona un cliente o un lead");
      return;
    }
    setSaving(true);
    const agenteCodice = forzaAgente
      ? (mioCodice || null)
      : (soggetto ? soggettoMeta.agente_codice : (contesto.agente_codice ?? null));
    const payload = {
      opportunita_id: opportunitaId,
      cliente_id: clienteId,
      lead_id: leadId,
      tipo,
      titolo: titolo.trim(),
      data_pianificata: dataPianificata ? new Date(dataPianificata).toISOString() : null,
      completata,
      data_svolgimento: completata
        ? (attivita?.data_svolgimento ?? new Date().toISOString())
        : null,
      esito: esito.trim() || null,
      luogo: luogo.trim() || null,
      note: note.trim() || null,
      agente_codice: agenteCodice,
      store_id: soggetto ? soggettoMeta.store_id : (contesto.store_id ?? null),
    };

    const { error } = attivita
      ? await supabase.from("attivita_commerciale").update(payload).eq("id", attivita.id)
      : await supabase.from("attivita_commerciale").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(attivita ? "Attività aggiornata" : "Attività registrata");
    qc.invalidateQueries({ queryKey: ["attivita-commerciale"] });
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{attivita ? "Modifica attività" : "Registra attività"}</DialogTitle>
          <DialogDescription>
            Appuntamenti, visite, chiamate ed esiti collegati all'opportunità.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {conSelettoreSoggetto && !attivita && (
            <div className="space-y-1.5">
              <Label>Soggetto *</Label>
              {soggetto ? (
                <div className="flex items-center gap-2">
                  <Badge variant={soggetto.tipo === "cliente" ? "default" : "secondary"}>
                    {soggetto.tipo === "cliente" ? "Cliente" : "Lead"}
                  </Badge>
                  <span className="truncate text-sm">{soggetto.etichetta}</span>
                  <Button variant="ghost" size="sm" onClick={() => setSoggetto(null)}>Cambia</Button>
                </div>
              ) : (
                <SoggettoCombobox onSelect={setSoggetto} />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAttivita)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI_ATTIVITA.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_ATTIVITA_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data e ora pianificata</Label>
              <Input
                type="datetime-local"
                value={dataPianificata}
                onChange={(e) => setDataPianificata(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Titolo *</Label>
            <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Sopralluogo cantiere" />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="attivita-completata" checked={completata} onCheckedChange={(v) => setCompletata(v === true)} />
            <Label htmlFor="attivita-completata" className="font-normal">Attività completata (registra data svolgimento)</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Esito</Label>
              <Input value={esito} onChange={(e) => setEsito(e.target.value)} placeholder="positivo, da richiamare…" />
            </div>
            <div className="space-y-1.5">
              <Label>Luogo</Label>
              <Input value={luogo} onChange={(e) => setLuogo(e.target.value)} placeholder="Indirizzo o sede" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
