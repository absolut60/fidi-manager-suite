import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Lock, Mail, Phone, Bell, StickyNote, FileText, Calendar, HandCoins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AllegatiSection } from "@/components/allegati-section";
import { parseNumeroIt } from "@/lib/numero-it";

import { ESITI_AZIONE as ESITI, isEmailDaInviare, isPromessaPagamento, tipoAzioneVisualizzato, type EsitoAzione as Esito } from "@/lib/azioni-recupero-ui";
import { SelettoreScadenzeAperte } from "@/components/selettore-scadenze-aperte";

const TIPO_META: Record<string, { label: string; Icon: typeof Mail }> = {
  email: { label: "email", Icon: Mail },
  telefonata: { label: "telefonata", Icon: Phone },
  promemoria: { label: "promemoria", Icon: Bell },
  promemoria_scadenza: { label: "promemoria scadenza", Icon: Calendar },
  nota: { label: "nota", Icon: StickyNote },
  lettera: { label: "lettera", Icon: FileText },
  promessa_pagamento: { label: "promessa di pagamento", Icon: HandCoins },
};

export type AzioneModificabile = {
  id: string;
  cliente_id: string;
  tipo: string;
  esito: Esito;
  data_azione: string;
  data_promessa_pagamento: string | null;
  importo_riferimento: number | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  livello_sollecito: number | null;
  operatore_id?: string | null;
};

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ModificaAzioneDialog({
  open, onOpenChange, azione, onSaved, footerExtra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  azione: AzioneModificabile;
  onSaved?: () => void;
  footerExtra?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isEmail = azione.tipo === "email";
  // Solo un'email effettivamente inviata è in sola lettura; un'email da inviare si modifica come le altre azioni.
  const isEmailInviata = isEmail && !!azione.email_corpo_html;
  const daInviare = isEmailDaInviare(azione);
  const isSollecito = isEmail && azione.livello_sollecito != null && azione.livello_sollecito > 0;
  // Promessa (tipo promessa_pagamento): campi propri, niente esito né cambio tipo.
  const isPromessa = isPromessaPagamento(azione);
  const tipoVis = tipoAzioneVisualizzato(azione);
  const meta = TIPO_META[tipoVis] ?? { label: tipoVis, Icon: FileText };
  const TipoIcon = meta.Icon;
  const titoloLabel = meta.label.charAt(0).toUpperCase() + meta.label.slice(1);

  const canManageAll =
    roles.includes("amministratore") ||
    roles.includes("amministrazione") ||
    roles.includes("direzione");
  const canEditAllegati = canManageAll || (azione.operatore_id != null && azione.operatore_id === user?.id);

  const [dataAzione, setDataAzione] = useState(toDatetimeLocal(azione.data_azione));
  const [esito, setEsito] = useState<Esito>(azione.esito);
  const [dataPromessa, setDataPromessa] = useState<string>(azione.data_promessa_pagamento ?? "");
  const [importo, setImporto] = useState<string>(azione.importo_riferimento != null ? String(azione.importo_riferimento) : "");
  const [note, setNote] = useState(azione.note ?? "");
  const [saving, setSaving] = useState(false);
  // Scadenze collegate (solo promesse): iniziali dal ponte, poi selezione dell'utente.
  const [scadIniziali, setScadIniziali] = useState<Set<string>>(new Set());
  const [scadSel, setScadSel] = useState<Set<string>>(new Set());
  const [scadVisibili, setScadVisibili] = useState<Set<string>>(new Set());
  const handleScadState = useCallback((info: { scadenze: { id: string }[] }) => {
    setScadVisibili(new Set(info.scadenze.map((x) => x.id)));
  }, []);

  useEffect(() => {
    if (!open || !isPromessa) return;
    let vivo = true;
    supabase.from("azioni_recupero_scadenze").select("scadenza_id").eq("azione_id", azione.id).then(({ data }) => {
      if (!vivo) return;
      const ids = new Set((data ?? []).map((x) => x.scadenza_id as string));
      setScadIniziali(ids);
      setScadSel(new Set(ids));
    });
    return () => { vivo = false; };
  }, [open, isPromessa, azione.id]);

  useEffect(() => {
    if (open) {
      setDataAzione(toDatetimeLocal(azione.data_azione));
      setEsito(azione.esito);
      setDataPromessa(azione.data_promessa_pagamento ?? "");
      setImporto(azione.importo_riferimento != null ? String(azione.importo_riferimento) : "");
      setNote(azione.note ?? "");
      setSaving(false);
    }
  }, [open, azione]);

  async function handleSave() {
    if (saving) return;
    const dt = new Date(dataAzione);
    if (isNaN(dt.getTime())) {
      toast.error("Data non valida");
      return;
    }
    // Promessa: stesse regole dell'inserimento (data e importo > 0 obbligatori).
    if (isPromessa) {
      if (!dataPromessa) { toast.error("Indica la scadenza della promessa"); return; }
      const n = parseNumeroIt(importo);
      if (n == null || n <= 0) { toast.error("Indica l'importo promesso (maggiore di zero)"); return; }
    }
    setSaving(true);
    try {
      const patch: {
        esito?: Esito;
        note: string | null;
        data_promessa_pagamento: string | null;
        data_azione?: string;
        importo_riferimento?: number | null;
      } = {
        note: note.trim() || null,
        data_promessa_pagamento: isPromessa && dataPromessa ? dataPromessa : null,
      };
      // L'esito di una promessa non si tocca (resta quello salvato).
      if (!isPromessa) patch.esito = esito;
      if (!isEmailInviata) {
        patch.data_azione = dt.toISOString();
        const trimmed = importo.trim();
        if (trimmed === "") patch.importo_riferimento = null;
        else {
          const n = parseNumeroIt(trimmed) ?? NaN;
          if (!isNaN(n)) patch.importo_riferimento = n;
        }
      }
      const { error } = await supabase
        .from("azioni_recupero")
        .update(patch)
        .eq("id", azione.id);
      if (error) throw error;
      if (isPromessa) {
        // Solo le scadenze mostrate dal selettore possono essere tolte; quelle non più aperte restano.
        const daTogliere = [...scadIniziali].filter((id) => scadVisibili.has(id) && !scadSel.has(id));
        const daAggiungere = [...scadSel].filter((id) => !scadIniziali.has(id));
        if (daTogliere.length > 0) {
          const { error: eDel } = await supabase.from("azioni_recupero_scadenze")
            .delete().eq("azione_id", azione.id).in("scadenza_id", daTogliere);
          if (eDel) throw eDel;
        }
        if (daAggiungere.length > 0) {
          const { error: eIns } = await supabase.from("azioni_recupero_scadenze")
            .insert(daAggiungere.map((sid) => ({ azione_id: azione.id, scadenza_id: sid })));
          if (eIns) throw eIns;
        }
        for (const k of [
          "promesse-pagamento", "promesse-previsione",
          "scadenziario-paginata-v1", "scadenziario-totali-v1", "scadenziario-all-ids",
          "scadenziario-per-store", "scadenziario-previsione-coperture",
        ]) qc.invalidateQueries({ queryKey: [k] });
      }
      toast.success("Azione aggiornata");
      qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", azione.cliente_id] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
      qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
      qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
      qc.invalidateQueries({ queryKey: ["recupero-clienti"] });
      qc.invalidateQueries({ queryKey: ["clienti-avvisati"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore salvataggio";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" /> Modifica {meta.label}
          </DialogTitle>
          <DialogDescription>
            {isEmailInviata
              ? "Email già inviata: il contenuto è in sola lettura. Puoi aggiornare solo esito e note."
              : daInviare
                ? "Email da inviare: usa Invia ora per scriverla e spedirla."
                : "Aggiorna i dati dell'azione."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo (sola lettura) */}
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Tipo:</span>
              <Badge variant="secondary" className="gap-1.5">
                <TipoIcon className="size-3.5" />
                {titoloLabel}
              </Badge>
              {isSollecito && (
                <Badge variant="outline">Sollecito liv. {azione.livello_sollecito}</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="size-3" /> non modificabile
            </span>
          </div>

          {isEmailInviata && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Prova di invio — non modificabile
              </div>
              {azione.email_destinatario && (
                <div className="text-sm"><span className="text-muted-foreground">A: </span>{azione.email_destinatario}</div>
              )}
              {azione.email_oggetto && (
                <div className="text-sm"><span className="text-muted-foreground">Oggetto: </span>{azione.email_oggetto}</div>
              )}
            </div>
          )}

          <div className={isPromessa ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <div className="space-y-1.5">
              <Label>Data e ora</Label>
              <Input
                type="datetime-local"
                value={dataAzione}
                onChange={(e) => setDataAzione(e.target.value)}
                disabled={isEmailInviata}
              />
            </div>
            {!isPromessa && <div className="space-y-1.5">
              <Label>Esito</Label>
              <Select value={esito} onValueChange={(v) => setEsito(v as Esito)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESITI.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}
          </div>

          {!isEmailInviata && (
            <div className="space-y-1.5">
              <Label>{isPromessa ? "Importo promesso (€) *" : "Importo di riferimento (€)"}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}

          {isPromessa && (
            <div className="space-y-1.5">
              <Label>Scadenza promessa *</Label>
              <Input
                type="date"
                value={dataPromessa}
                onChange={(e) => setDataPromessa(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {isPromessa && (
            <SelettoreScadenzeAperte
              clienteId={azione.cliente_id}
              open={open}
              selectedIds={scadSel}
              onChange={setScadSel}
              mostraBadgePiani={false}
              titolo="Scadenze collegate (opzionale)"
              onStateChange={handleScadState}
            />
          )}

          <Separator />

          <AllegatiSection
            entitaTipo="azione_recupero"
            entitaId={azione.id}
            clienteId={azione.cliente_id}
            canEdit={canEditAllegati}
            compact
          />
        </div>

        <DialogFooter>
          {footerExtra}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Pencil className="size-4" /> {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
