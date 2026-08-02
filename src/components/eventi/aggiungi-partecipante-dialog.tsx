import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Copy, Link2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import { cercaDuplicati, type DedupMatch } from "@/lib/lead-dedup";
import { creaLead } from "@/lib/lead-crea";
import { creaContattoPersona } from "@/lib/contatto-crea";
import {
  EVENTI_PARTECIPANTE_STATI, EVENTI_PARTECIPANTE_STATO_LABEL,
  type EventiPartecipanteStato,
} from "@/lib/eventi-costanti";

type Campi = {
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
  note: string;
};

const CAMPI_VUOTI: Campi = {
  tipo_soggetto: "azienda",
  ragione_sociale: "", nome: "", cognome: "", partita_iva: "", codice_fiscale: "",
  email: "", telefono: "", cellulare: "", indirizzo: "", citta: "", cap: "",
  provincia: "", note: "",
};

export function AggiungiPartecipanteDialog({
  eventoId,
  nomeEvento,
}: {
  eventoId: string;
  nomeEvento: string;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"collega" | "nuovo">("collega");
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [stato, setStato] = useState<EventiPartecipanteStato>("atteso");
  const [campi, setCampi] = useState<Campi>({ ...CAMPI_VUOTI });
  const [ignoraDuplicati, setIgnoraDuplicati] = useState(false);
  const [contattoCreatoId, setContattoCreatoId] = useState<string | null>(null);
  const [linkFirma, setLinkFirma] = useState<string | null>(null);

  const reset = () => {
    setModo("collega");
    setSoggetto(null);
    setStato("atteso");
    setCampi({ ...CAMPI_VUOTI });
    setIgnoraDuplicati(false);
    setContattoCreatoId(null);
    setLinkFirma(null);
  };

  // ——— dedup live (debounce) ———
  const chiaveDedup = useMemo(
    () => JSON.stringify({
      p: campi.partita_iva.trim(),
      c: campi.codice_fiscale.trim(),
      e: campi.email.trim(),
      n: campi.ragione_sociale.trim() || `${campi.nome} ${campi.cognome}`.trim(),
    }),
    [campi.partita_iva, campi.codice_fiscale, campi.email, campi.ragione_sociale, campi.nome, campi.cognome],
  );
  const [chiaveDeb, setChiaveDeb] = useState(chiaveDedup);
  useEffect(() => {
    const t = window.setTimeout(() => setChiaveDeb(chiaveDedup), 350);
    return () => window.clearTimeout(t);
  }, [chiaveDedup]);

  const parsed = JSON.parse(chiaveDeb) as { p: string; c: string; e: string; n: string };
  const dedupAttivo =
    modo === "nuovo" &&
    !contattoCreatoId &&
    (parsed.p.length >= 5 || parsed.c.length >= 5 || parsed.e.length >= 5 || parsed.n.length >= 3);

  const { data: duplicati } = useQuery({
    queryKey: ["eventi-dedup", chiaveDeb],
    enabled: open && dedupAttivo,
    staleTime: 30_000,
    queryFn: () =>
      cercaDuplicati({
        partitaIva: parsed.p || null,
        codiceFiscale: parsed.c || null,
        email: parsed.e || null,
        nome: parsed.n.length >= 3 ? parsed.n : null,
      }),
  });

  const matches: DedupMatch[] = duplicati ?? [];

  const collegaMatch = (m: DedupMatch) => {
    if (m.entita === "lead") {
      setSoggetto({ tipo: "lead", id: m.id, etichetta: m.etichetta });
    } else if (m.entita === "cliente") {
      setSoggetto({ tipo: "cliente", id: m.id, etichetta: m.etichetta });
    } else if (m.linkId) {
      setSoggetto({ tipo: "cliente", id: m.linkId, etichetta: m.etichetta });
    } else {
      toast.error("Questo contatto non è collegabile direttamente: apri la scheda lead");
      return;
    }
    setModo("collega");
  };

  // ——— salvataggio ———
  const salva = useMutation({
    mutationFn: async () => {
      if (modo === "collega") {
        if (!soggetto) throw new Error("Seleziona un soggetto");
        const { error } = await supabase.from("eventi_partecipanti").insert({
          evento_id: eventoId,
          stato,
          cliente_id: soggetto.tipo === "cliente" ? soggetto.id : null,
          lead_id: soggetto.tipo === "lead" ? soggetto.id : null,
        });
        if (error) throw error;
        return { contattoId: null as string | null };
      }

      const isPF = campi.tipo_soggetto === "persona_fisica";
      const { id: leadId } = await creaLead({
        tipo_soggetto: campi.tipo_soggetto,
        ragione_sociale: isPF ? null : campi.ragione_sociale,
        nome: campi.nome,
        cognome: campi.cognome,
        partita_iva: campi.partita_iva,
        codice_fiscale: campi.codice_fiscale,
        email: campi.email,
        telefono: campi.telefono,
        cellulare: campi.cellulare,
        indirizzo: campi.indirizzo,
        citta: campi.citta,
        cap: campi.cap,
        provincia: campi.provincia,
        fonte: "evento",
        fonte_dettaglio: nomeEvento,
        tipo_lead: "potenziale_cliente",
        note: campi.note,
        createdBy: user?.id ?? null,
        notaStorico: `Lead creato dall'evento "${nomeEvento}"`,
      });

      let contattoId: string | null = null;
      if (campi.nome.trim()) {
        const c = await creaContattoPersona({
          lead_id: leadId,
          nome: campi.nome,
          cognome: campi.cognome,
          email: campi.email,
          telefono: campi.telefono,
          cellulare: campi.cellulare,
          codice_fiscale: campi.codice_fiscale,
          ruolo: isPF ? null : "Referente",
        });
        contattoId = c.id;
      }

      const { error } = await supabase.from("eventi_partecipanti").insert({
        evento_id: eventoId,
        stato,
        lead_id: leadId,
        contatto_id: contattoId,
        ragione_sociale: isPF ? null : campi.ragione_sociale.trim() || null,
        nome: campi.nome.trim() || null,
        cognome: campi.cognome.trim() || null,
        partita_iva: campi.partita_iva.trim() || null,
        codice_fiscale: campi.codice_fiscale.trim() || null,
        email: campi.email.trim() || null,
        telefono: campi.telefono.trim() || null,
        note: campi.note.trim() || null,
      });
      if (error) throw error;

      return { contattoId };
    },
    onSuccess: ({ contattoId }) => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Partecipante aggiunto");
      if (contattoId) {
        setContattoCreatoId(contattoId);
      } else {
        setOpen(false);
        reset();
      }
    },
    onError: (e: Error) => toast.error("Errore nell'inserimento", { description: e.message }),
  });

  const generaLink = useMutation({
    mutationFn: async () => {
      if (!contattoCreatoId) throw new Error("Nessun contatto");
      const { generaTokenFirmaPrivacy } = await import("@/lib/firma-privacy.functions");
      const res = await generaTokenFirmaPrivacy({
        data: { contattoId: contattoCreatoId, giorniValidita: 30 },
      });
      return `${window.location.origin}/firma-privacy/${res.token}`;
    },
    onSuccess: async (url) => {
      setLinkFirma(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link firma copiato negli appunti");
      } catch {
        toast.success("Link firma generato");
      }
    },
    onError: (e: Error) => toast.error("Errore nella generazione del link", { description: e.message }),
  });

  const nuovoValido =
    campi.tipo_soggetto === "persona_fisica"
      ? campi.nome.trim().length > 0
      : campi.ragione_sociale.trim().length > 0;

  const set = (patch: Partial<Campi>) => setCampi((c) => ({ ...c, ...patch }));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-1.5"><Plus className="size-4" /> Aggiungi partecipante</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {contattoCreatoId ? "Privacy del nuovo contatto" : "Aggiungi partecipante"}
          </DialogTitle>
        </DialogHeader>

        {contattoCreatoId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Il partecipante è stato salvato. Puoi raccogliere il consenso privacy adesso
              generando un link da inviare, oppure più tardi dalla scheda lead (tab Contatti).
            </p>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={generaLink.isPending}
              onClick={() => generaLink.mutate()}
            >
              <Link2 className="size-4" /> Genera link firma privacy
            </Button>
            {linkFirma && (
              <div className="flex items-center gap-2">
                <Input readOnly value={linkFirma} className="text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(linkFirma);
                    toast.success("Link copiato");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Chiudi</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={modo === "collega" ? "default" : "outline"}
                onClick={() => setModo("collega")}
              >
                Collega esistente
              </Button>
              <Button
                size="sm"
                variant={modo === "nuovo" ? "default" : "outline"}
                onClick={() => { setModo("nuovo"); setSoggetto(null); }}
              >
                Crea nuovo soggetto
              </Button>
            </div>

            {modo === "collega" ? (
              soggetto ? (
                <div className="flex items-center gap-2 rounded-md border p-3">
                  <Badge variant={soggetto.tipo === "cliente" ? "default" : "secondary"}>
                    {soggetto.tipo === "cliente" ? "Cliente" : "Lead"}
                  </Badge>
                  <span className="font-medium truncate">{soggetto.etichetta}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setSoggetto(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <SoggettoCombobox onSelect={setSoggetto} autoFocus />
              )
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tipo soggetto</Label>
                  <Select
                    value={campi.tipo_soggetto}
                    onValueChange={(v) => set({ tipo_soggetto: v as Campi["tipo_soggetto"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="azienda">Azienda</SelectItem>
                      <SelectItem value="persona_fisica">Persona fisica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {campi.tipo_soggetto === "azienda" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="np-rs">Ragione sociale *</Label>
                    <Input id="np-rs" value={campi.ragione_sociale}
                      onChange={(e) => set({ ragione_sociale: e.target.value })} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-nome">
                      Nome {campi.tipo_soggetto === "persona_fisica" ? "*" : "referente"}
                    </Label>
                    <Input id="np-nome" value={campi.nome} onChange={(e) => set({ nome: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cognome">Cognome</Label>
                    <Input id="np-cognome" value={campi.cognome} onChange={(e) => set({ cognome: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-piva">Partita IVA</Label>
                    <Input id="np-piva" value={campi.partita_iva} onChange={(e) => set({ partita_iva: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cf">Codice fiscale</Label>
                    <Input id="np-cf" value={campi.codice_fiscale} onChange={(e) => set({ codice_fiscale: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-email">Email</Label>
                    <Input id="np-email" type="email" value={campi.email} onChange={(e) => set({ email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-tel">Telefono</Label>
                    <Input id="np-tel" value={campi.telefono} onChange={(e) => set({ telefono: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cell">Cellulare</Label>
                    <Input id="np-cell" value={campi.cellulare} onChange={(e) => set({ cellulare: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="np-ind">Indirizzo</Label>
                  <Input id="np-ind" value={campi.indirizzo} onChange={(e) => set({ indirizzo: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-citta">Città</Label>
                    <Input id="np-citta" value={campi.citta} onChange={(e) => set({ citta: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cap">CAP</Label>
                    <Input id="np-cap" value={campi.cap} onChange={(e) => set({ cap: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-prov">Provincia</Label>
                    <Input id="np-prov" value={campi.provincia} onChange={(e) => set({ provincia: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="np-note">Note</Label>
                  <Textarea id="np-note" rows={2} value={campi.note} onChange={(e) => set({ note: e.target.value })} />
                </div>

                {matches.length > 0 && !ignoraDuplicati && (
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Possibili duplicati trovati</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p className="text-xs">
                        Vuoi collegarti a uno di questi invece di creare un nuovo lead?
                      </p>
                      <div className="space-y-1.5">
                        {matches.slice(0, 6).map((m) => (
                          <div key={`${m.entita}-${m.id}-${m.campo}`} className="flex items-center gap-2">
                            <Badge variant={m.entita === "cliente" ? "default" : "secondary"} className="shrink-0">
                              {m.entita === "cliente" ? "Cliente" : m.entita === "lead" ? "Lead" : "Contatto"}
                            </Badge>
                            <span className="truncate text-xs">{m.etichetta}</span>
                            <span className="text-xs text-muted-foreground shrink-0">({m.campo})</span>
                            <Button size="sm" variant="outline" className="ml-auto shrink-0"
                              onClick={() => collegaMatch(m)}>
                              Collega
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setIgnoraDuplicati(true)}>
                        Crea comunque nuovo
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Stato partecipante</Label>
              <Select value={stato} onValueChange={(v) => setStato(v as EventiPartecipanteStato)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTI_PARTECIPANTE_STATI.map((s) => (
                    <SelectItem key={s} value={s}>{EVENTI_PARTECIPANTE_STATO_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Annulla</Button>
              <Button
                disabled={
                  salva.isPending ||
                  (modo === "collega" ? !soggetto : !nuovoValido)
                }
                onClick={() => salva.mutate()}
              >
                {modo === "collega" ? "Aggiungi partecipante" : "Crea e aggiungi"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
