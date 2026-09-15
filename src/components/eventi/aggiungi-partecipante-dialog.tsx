import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import {
  ModuloConsensoPrivacy, registraConsensoDiPersona,
  type ModuloConsensoPayload,
} from "@/components/privacy-post-creazione";
import { creaORiusaContattoInSoggetto } from "@/lib/firma-privacy.functions";

import { formattaNomeProprio, formattaRagioneSociale } from "@/lib/formato-nomi";
import {
  EVENTI_PARTECIPANTE_STATI, EVENTI_PARTECIPANTE_STATO_LABEL,
  type EventiPartecipanteStato,
} from "@/lib/eventi-costanti";


type Campi = {
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

  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"collega" | "nuovo">("collega");
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [stato, setStato] = useState<EventiPartecipanteStato>("presentato");
  const [campi, setCampi] = useState<Campi>({ ...CAMPI_VUOTI });

  /**
   * Esito del salvataggio: guida la fase privacy post-creazione.
   * - contattoId nullo → nessun contatto-persona su cui raccogliere la privacy
   */
  type EsitoSalvataggio = {
    contattoId: string | null;
    giaFirmata: boolean;
    nome: string;
    cognome: string;
    societa: string;
    email: string;
    cellulare: string;
    luogo_nascita: string;
    data_nascita: string;
    codice_fiscale: string;
    residenza: string;
    soggetto?: { tipo: "cliente" | "lead"; id: string } | null;
    partecipanteId?: string | null;
  };
  const [esito, setEsito] = useState<EsitoSalvataggio | null>(null);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const diPersonaFn = useServerFn(registraConsensoDiPersona);
  const creaContattoFn = useServerFn(creaORiusaContattoInSoggetto);

  const reset = () => {
    setModo("collega");
    setSoggetto(null);
    setStato("presentato");
    setCampi({ ...CAMPI_VUOTI });
    setEsito(null);
    setSavingPrivacy(false);
  };

  const chiudi = () => { setOpen(false); reset(); };


  // Contatto-persona su cui raccogliere la privacy (ramo "collega esistente").
  const caricaContattoSoggetto = async (s: SoggettoSelezionato) => {
    const q = supabase
      .from("contatti")
      .select("id, nome, cognome, email, cellulare, luogo_nascita, data_nascita, codice_fiscale, residenza, privacy_firmata, principale")
      .order("principale", { ascending: false })
      .limit(1);
    const { data } = s.tipo === "cliente"
      ? await q.eq("cliente_id", s.id)
      : await q.eq("lead_id", s.id);
    return data?.[0] ?? null;
  };

  // ——— salvataggio ———
  const salva = useMutation({
    mutationFn: async (): Promise<EsitoSalvataggio> => {
      if (modo === "collega") {
        if (!soggetto) throw new Error("Seleziona un soggetto");
        const { error } = await supabase.from("eventi_partecipanti").insert({
          evento_id: eventoId,
          stato,
          cliente_id: soggetto.tipo === "cliente" ? soggetto.id : null,
          lead_id: soggetto.tipo === "lead" ? soggetto.id : null,
        });
        if (error) throw error;
        const c = await caricaContattoSoggetto(soggetto);
        return {
          contattoId: c?.id ?? null,
          giaFirmata: !!c?.privacy_firmata,
          nome: c?.nome ?? "",
          cognome: c?.cognome ?? "",
          societa: soggetto.etichetta,
          email: c?.email ?? "",
          cellulare: c?.cellulare ?? "",
          luogo_nascita: c?.luogo_nascita ?? "",
          data_nascita: c?.data_nascita ?? "",
          codice_fiscale: c?.codice_fiscale ?? "",
          residenza: c?.residenza ?? "",
        };
      }

      // Creazione atomica lato DB: lead + storico + contatto + partecipante
      // in un'unica transazione (nessun lead orfano in caso di errore).
      // Il tipo soggetto è derivato: ragione sociale valorizzata → azienda.
      const tipoSoggetto = campi.ragione_sociale.trim().length > 0 ? "azienda" : "persona_fisica";
      const { data, error } = await supabase.rpc("crea_partecipante_da_nuovo_soggetto", {
        _evento_id: eventoId,
        _stato: stato,
        _tipo_soggetto: tipoSoggetto,
        _ragione_sociale: campi.ragione_sociale,
        _nome: campi.nome,
        _cognome: campi.cognome,
        _partita_iva: campi.partita_iva,
        _codice_fiscale: campi.codice_fiscale,
        _email: campi.email,
        _telefono: campi.telefono,
        _cellulare: campi.cellulare,
        _indirizzo: campi.indirizzo,
        _citta: campi.citta,
        _cap: campi.cap,
        _provincia: campi.provincia,
        _note: campi.note,
        _fonte_dettaglio: nomeEvento,
        _crea_contatto: campi.nome.trim().length > 0,
      });
      if (error) throw error;

      const riga = Array.isArray(data) ? data[0] : data;
      return {
        contattoId: (riga?.contatto_id as string | null) ?? null,
        giaFirmata: false,
        nome: campi.nome,
        cognome: campi.cognome,
        societa: campi.ragione_sociale,
        email: campi.email,
        cellulare: campi.cellulare,
        luogo_nascita: "",
        data_nascita: "",
        codice_fiscale: campi.codice_fiscale,
        residenza: [campi.indirizzo, campi.cap, campi.citta, campi.provincia].filter(Boolean).join(" "),
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Partecipante aggiunto");
      // Chi ha già firmato non si rifà firmare: nessuna proposta di raccolta.
      if (res.contattoId && res.giaFirmata) { chiudi(); return; }
      setEsito(res);
    },
    onError: (e: Error) => toast.error("Errore nell'inserimento", { description: e.message }),
  });

  // ——— conferma telematica di persona (modalità flag, senza firma grafica) ———
  const salvaConferma = async (p: ModuloConsensoPayload) => {
    if (!esito?.contattoId) return;
    setSavingPrivacy(true);
    try {
      const res = await diPersonaFn({ data: { contattoId: esito.contattoId, ...p } });
      toast.success(
        res.emailInviata
          ? "Consenso registrato — copia PDF inviata via email"
          : "Consenso registrato — invio email non riuscito, il PDF è archiviato",
      );
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      chiudi();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSavingPrivacy(false);
    }
  };


  const nuovoValido = campi.nome.trim().length > 0 && campi.cognome.trim().length > 0;

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
      <DialogContent
        className={`${
          esito && esito.contattoId && !esito.giaFirmata ? "max-w-3xl" : "max-w-xl"
        } max-h-[85vh] overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle>
            {esito ? "Privacy del partecipante" : "Aggiungi partecipante"}
          </DialogTitle>
        </DialogHeader>

        {esito ? (
          !esito.contattoId ? (
            // Nessun contatto-persona (es. azienda senza referente): niente raccolta privacy.
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nessun contatto-persona: la privacy si raccoglie dopo, aggiungendo un referente.
              </p>
              <DialogFooter>
                <Button onClick={chiudi}>Chiudi</Button>
              </DialogFooter>
            </div>
          ) : esito.giaFirmata ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Il consenso privacy è già stato firmato per questo contatto.
              </p>
              <DialogFooter>
                <Button onClick={chiudi}>Chiudi</Button>
              </DialogFooter>
            </div>
          ) : (
            <ModuloConsensoPrivacy
              modalita="flag"
              valoriIniziali={{
                nome: esito.nome,
                cognome: esito.cognome,
                societa: esito.societa,
                luogo_nascita: esito.luogo_nascita,
                data_nascita: esito.data_nascita,
                codice_fiscale: esito.codice_fiscale,
                residenza: esito.residenza,
                email: esito.email,
                cellulare: esito.cellulare,
              }}
              placeholderSocieta={esito.societa}
              inviaLabel="Conferma consensi"
              isPending={savingPrivacy}
              onSubmit={salvaConferma}
            />
          )
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-nome">Nome *</Label>
                    <Input id="np-nome" value={campi.nome}
                      onChange={(e) => set({ nome: e.target.value })}
                      onBlur={(e) => {
                        const f = formattaNomeProprio(e.target.value);
                        if (f !== campi.nome) set({ nome: f });
                      }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cognome">Cognome *</Label>
                    <Input id="np-cognome" value={campi.cognome}
                      onChange={(e) => set({ cognome: e.target.value })}
                      onBlur={(e) => {
                        const f = formattaNomeProprio(e.target.value);
                        if (f !== campi.cognome) set({ cognome: f });
                      }} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="np-rs">Ragione sociale (azienda)</Label>
                  <Input id="np-rs" value={campi.ragione_sociale}
                    onChange={(e) => set({ ragione_sociale: e.target.value })}
                    onBlur={(e) => {
                      const f = formattaRagioneSociale(e.target.value);
                      if (f !== campi.ragione_sociale) set({ ragione_sociale: f });
                    }} />
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

                <div className="space-y-1.5">
                  <Label htmlFor="np-email">Email</Label>
                  <Input id="np-email" type="email" value={campi.email} onChange={(e) => set({ email: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
