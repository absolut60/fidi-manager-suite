import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LEAD_FONTI, LEAD_FONTE_LABEL, LEAD_PRIORITA, LEAD_PRIORITA_LABEL,
  LEAD_TIPI, LEAD_TIPO_LABEL,
  type LeadFonte, type LeadPriorita, type LeadTipo,
} from "@/lib/lead-costanti";
import { cercaDuplicati, DEDUP_CAMPO_LABEL, type DedupMatch } from "@/lib/lead-dedup";

type Form = {
  tipo_soggetto: "azienda" | "persona_fisica";
  ragione_sociale: string;
  nome: string;
  cognome: string;
  partita_iva: string;
  codice_fiscale: string;
  email: string;
  telefono: string;
  cellulare: string;
  indirizzo: string;
  citta: string;
  cap: string;
  provincia: string;
  fonte: LeadFonte;
  fonte_dettaglio: string;
  tipo_lead: LeadTipo;
  priorita: LeadPriorita;
  store_id: string;
  agente_codice: string;
  note: string;
};

const EMPTY: Form = {
  tipo_soggetto: "azienda",
  ragione_sociale: "", nome: "", cognome: "",
  partita_iva: "", codice_fiscale: "", email: "", telefono: "", cellulare: "",
  indirizzo: "", citta: "", cap: "", provincia: "",
  fonte: "manuale", fonte_dettaglio: "",
  tipo_lead: "potenziale_cliente", priorita: "media",
  store_id: "", agente_codice: "", note: "",
};

const NESSUNO = "__none__";

export function NuovoLeadDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const [duplicati, setDuplicati] = useState<DedupMatch[]>([]);
  const [checking, setChecking] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });

  // Deduplica base con debounce
  useEffect(() => {
    const piva = f.partita_iva.trim();
    const cf = f.codice_fiscale.trim();
    const email = f.email.trim();
    if (!piva && !cf && !email) {
      setDuplicati([]);
      return;
    }
    let annullato = false;
    setChecking(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await cercaDuplicati({ partitaIva: piva, codiceFiscale: cf, email });
        if (!annullato) setDuplicati(res);
      } catch {
        if (!annullato) setDuplicati([]);
      } finally {
        if (!annullato) setChecking(false);
      }
    }, 600);
    return () => { annullato = true; window.clearTimeout(t); setChecking(false); window.clearTimeout(t); };
  }, [f.partita_iva, f.codice_fiscale, f.email]);

  const valido =
    f.ragione_sociale.trim().length > 0 || (f.nome.trim().length > 0 && f.cognome.trim().length > 0);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        tipo_soggetto: f.tipo_soggetto,
        ragione_sociale: f.ragione_sociale.trim() || null,
        nome: f.nome.trim() || null,
        cognome: f.cognome.trim() || null,
        partita_iva: f.partita_iva.trim() || null,
        codice_fiscale: f.codice_fiscale.trim() || null,
        email: f.email.trim() || null,
        telefono: f.telefono.trim() || null,
        cellulare: f.cellulare.trim() || null,
        indirizzo: f.indirizzo.trim() || null,
        citta: f.citta.trim() || null,
        cap: f.cap.trim() || null,
        provincia: f.provincia.trim() || null,
        fonte: f.fonte,
        fonte_dettaglio: f.fonte_dettaglio.trim() || null,
        tipo_lead: f.tipo_lead,
        priorita: f.priorita,
        store_id: f.store_id || null,
        agente_codice: f.agente_codice || null,
        note: f.note.trim() || null,
        stato: "nuovo" as const,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from("lead").insert(payload).select("id").single();
      if (error) throw error;
      if (data) {
        await supabase.from("lead_storico").insert({
          lead_id: data.id,
          stato_da: null,
          stato_a: "nuovo",
          operatore_id: user?.id ?? null,
          nota: "Lead creato manualmente",
        });
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success("Lead creato", {
        description:
          "Prossimo passo: aggiungi un contatto-persona nella scheda del lead per raccogliere privacy e consensi marketing.",
        duration: 8000,
        ...(data?.id
          ? {
              action: {
                label: "Vai al lead",
                onClick: () => navigate({ to: "/lead/$leadId", params: { leadId: data.id } }),
              },
            }
          : {}),
      });
      qc.invalidateQueries({ queryKey: ["lead-lista"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuovo lead</DialogTitle>
        <DialogDescription>
          Un lead è un potenziale cliente o una richiesta in ingresso, non ancora un cliente attivo:
          diventerà cliente con la conversione.
        </DialogDescription>
        <DialogDescription>
          Inserimento rapido. Serve almeno la ragione sociale oppure nome e cognome.
        </DialogDescription>
      </DialogHeader>

      <Alert>
        <Info className="size-4" />
        <AlertDescription>
          Privacy e consensi marketing si raccolgono dopo, sul contatto-persona: dalla scheda del lead,
          tab <span className="font-medium">Contatti</span>.
        </AlertDescription>
      </Alert>

      {duplicati.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlertTriangle className="size-4" /> Possibili duplicati
          </div>
          <ul className="mt-2 space-y-1">
            {duplicati.map((d) => (
              <li key={`${d.entita}-${d.id}-${d.campo}`} className="text-xs">
                Esiste già{" "}
                {d.entita === "lead" && d.linkId ? (
                  <Link to="/lead/$leadId" params={{ leadId: d.linkId }} className="underline font-medium">
                    Lead {d.etichetta}
                  </Link>
                ) : d.linkId ? (
                  <Link to="/clienti/$clienteId" params={{ clienteId: d.linkId }} className="underline font-medium">
                    {d.entita === "cliente" ? "Cliente" : "Contatto"} {d.etichetta}
                  </Link>
                ) : (
                  <span className="font-medium">
                    {d.entita === "cliente" ? "Cliente" : "Contatto"} {d.etichetta}
                  </span>
                )}{" "}
                con questa {DEDUP_CAMPO_LABEL[d.campo]}. Puoi comunque procedere.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Tipo soggetto</Label>
          <Select value={f.tipo_soggetto} onValueChange={(v) => set("tipo_soggetto", v as Form["tipo_soggetto"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="azienda">Azienda</SelectItem>
              <SelectItem value="persona_fisica">Persona fisica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ragione sociale</Label>
          <Input value={f.ragione_sociale} maxLength={200} onChange={(e) => set("ragione_sociale", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Nome</Label>
          <Input value={f.nome} maxLength={100} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Cognome</Label>
          <Input value={f.cognome} maxLength={100} onChange={(e) => set("cognome", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Partita IVA {checking && <Loader2 className="inline size-3 animate-spin" />}</Label>
          <Input value={f.partita_iva} maxLength={20} onChange={(e) => set("partita_iva", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Codice fiscale</Label>
          <Input value={f.codice_fiscale} maxLength={20} onChange={(e) => set("codice_fiscale", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={f.email} maxLength={255} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Telefono</Label>
          <Input value={f.telefono} maxLength={30} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Cellulare</Label>
          <Input value={f.cellulare} maxLength={30} onChange={(e) => set("cellulare", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Indirizzo</Label>
          <Input value={f.indirizzo} maxLength={200} onChange={(e) => set("indirizzo", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Città</Label>
          <Input value={f.citta} maxLength={100} onChange={(e) => set("citta", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">CAP</Label>
            <Input value={f.cap} maxLength={10} onChange={(e) => set("cap", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Provincia</Label>
            <Input value={f.provincia} maxLength={5} onChange={(e) => set("provincia", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Fonte</Label>
          <Select value={f.fonte} onValueChange={(v) => set("fonte", v as LeadFonte)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_FONTI.map((v) => <SelectItem key={v} value={v}>{LEAD_FONTE_LABEL[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Dettaglio fonte</Label>
          <Input value={f.fonte_dettaglio} maxLength={200} onChange={(e) => set("fonte_dettaglio", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Tipo lead</Label>
          <Select value={f.tipo_lead} onValueChange={(v) => set("tipo_lead", v as LeadTipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_TIPI.map((v) => <SelectItem key={v} value={v}>{LEAD_TIPO_LABEL[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priorità</Label>
          <Select value={f.priorita} onValueChange={(v) => set("priorita", v as LeadPriorita)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_PRIORITA.map((v) => <SelectItem key={v} value={v}>{LEAD_PRIORITA_LABEL[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Sede</Label>
          <Select value={f.store_id || NESSUNO} onValueChange={(v) => set("store_id", v === NESSUNO ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NESSUNO}>Nessuna</SelectItem>
              {(stores ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Agente</Label>
          <Select value={f.agente_codice || NESSUNO} onValueChange={(v) => set("agente_codice", v === NESSUNO ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NESSUNO}>Nessuno</SelectItem>
              {(agenti ?? []).map((a) => (
                <SelectItem key={a.codice} value={a.codice}>{a.descrizione || a.codice}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Note</Label>
          <Textarea value={f.note} maxLength={2000} rows={3} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button disabled={!valido || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
          Crea lead
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
