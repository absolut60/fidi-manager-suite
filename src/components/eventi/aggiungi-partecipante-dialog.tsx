import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  SceltaCanalePrivacy, inviaRichiestaDopoCreazione, ModuloConsensoPrivacy,
  inviaRichiestaFirmaPrivacy, registraConsensoDiPersona,
  type CanalePrivacy, type ModuloConsensoPayload,
} from "@/components/privacy-post-creazione";
import { cercaDuplicati, type DedupMatch } from "@/lib/lead-dedup";
import { formattaNomeProprio, formattaRagioneSociale } from "@/lib/formato-nomi";
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

  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"collega" | "nuovo">("collega");
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [stato, setStato] = useState<EventiPartecipanteStato>("atteso");
  const [campi, setCampi] = useState<Campi>({ ...CAMPI_VUOTI });
  const [ignoraDuplicati, setIgnoraDuplicati] = useState(false);

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
  };
  const [esito, setEsito] = useState<EsitoSalvataggio | null>(null);
  const [canale, setCanale] = useState<CanalePrivacy | null>(null);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const inviaFn = useServerFn(inviaRichiestaFirmaPrivacy);
  const diPersonaFn = useServerFn(registraConsensoDiPersona);

  const reset = () => {
    setModo("collega");
    setSoggetto(null);
    setStato("atteso");
    setCampi({ ...CAMPI_VUOTI });
    setIgnoraDuplicati(false);
    setEsito(null);
    setCanale(null);
    setSavingPrivacy(false);
  };

  const chiudi = () => { setOpen(false); reset(); };


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
    !esito &&
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
      const { data, error } = await supabase.rpc("crea_partecipante_da_nuovo_soggetto", {
        _evento_id: eventoId,
        _stato: stato,
        _tipo_soggetto: campi.tipo_soggetto,
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

  // ——— canale privacy scelto dopo il salvataggio ———
  const scegliCanale = async (c: CanalePrivacy) => {
    if (!esito?.contattoId) return;
    if (c === "di_persona") { setCanale(c); return; }
    if (c === "a_distanza") {
      setSavingPrivacy(true);
      await inviaRichiestaDopoCreazione(inviaFn, esito.contattoId, !!esito.email.trim());
      setSavingPrivacy(false);
    } else {
      toast.success("Partecipante salvato — la privacy si raccoglie dopo dalla riga del contatto");
    }
    chiudi();
  };

  const salvaDiPersona = async (p: ModuloConsensoPayload) => {
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
      <DialogContent className={`${esito && canale === "di_persona" ? "max-w-3xl" : "max-w-xl"} max-h-[85vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>
            {esito ? "Privacy del partecipante" : "Aggiungi partecipante"}
          </DialogTitle>
        </DialogHeader>

        {esito ? (
          !esito.contattoId ? (
            // Nessun contatto-persona (es. azienda senza referente): niente canale privacy.
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nessun contatto-persona: la privacy si raccoglie dopo, aggiungendo un referente.
              </p>
              <DialogFooter>
                <Button onClick={chiudi}>Chiudi</Button>
              </DialogFooter>
            </div>
          ) : canale === "di_persona" ? (
            <ModuloConsensoPrivacy
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
              onSubmit={salvaDiPersona}
              isPending={savingPrivacy}
              inviaLabel="Conferma e firma"
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Il partecipante è stato salvato. Scegli come raccogliere il consenso privacy.
              </p>
              <SceltaCanalePrivacy onScegli={(c) => { void scegliCanale(c); }} />
              <DialogFooter>
                <Button variant="outline" onClick={chiudi} disabled={savingPrivacy}>Chiudi</Button>
              </DialogFooter>
            </div>
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
                      onChange={(e) => set({ ragione_sociale: e.target.value })}
                      onBlur={(e) => {
                        const f = formattaRagioneSociale(e.target.value);
                        if (f !== campi.ragione_sociale) set({ ragione_sociale: f });
                      }} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="np-nome">
                      Nome {campi.tipo_soggetto === "persona_fisica" ? "*" : "referente"}
                    </Label>
                    <Input id="np-nome" value={campi.nome}
                      onChange={(e) => set({ nome: e.target.value })}
                      onBlur={(e) => {
                        const f = formattaNomeProprio(e.target.value);
                        if (f !== campi.nome) set({ nome: f });
                      }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-cognome">Cognome</Label>
                    <Input id="np-cognome" value={campi.cognome}
                      onChange={(e) => set({ cognome: e.target.value })}
                      onBlur={(e) => {
                        const f = formattaNomeProprio(e.target.value);
                        if (f !== campi.cognome) set({ cognome: f });
                      }} />
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
