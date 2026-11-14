// Dialog creazione / modifica cantiere con geocodifica automatica dell'indirizzo.
import { Switch } from "@/components/ui/switch";
import { eliminaConEsito, messaggioEliminazioneCantiere } from "@/lib/esito-eliminazione";
import { CollegamentiCantiere } from "@/components/collegamenti-cantiere";
import { PrezziCantiereDialog } from "@/components/prezzi-cantiere-dialog";
import { BadgePrezziDedicati } from "@/components/badge-prezzi-dedicati";
import { contaPrezziCantiere, chiaveConteggioPrezziCantiere, chiaveCantieriModificabili, useCantieriModificabili, puoModificareCantiereDb } from "@/lib/cantiere-listini-api";
import { provvisorioInizialeCantiere, nomeInizialeCantiere } from "@/lib/cantieri-provvisori";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Crosshair, MapPin, Navigation, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import { geocodificaCantiere, ricalcolaSedeVicina } from "@/lib/cantieri.functions";
import { BloccoIndirizzo } from "@/components/blocco-indirizzo";
import { BottoneElimina } from "@/components/conferma-eliminazione";
import { usePermessiCommerciale } from "@/hooks/use-permessi-commerciale";
import {
  CATEGORIE_CANTIERE, CATEGORIA_LABEL, GEO_CLASS, GEO_LABEL, testoSedeVicina,
  type CantiereRow, type GeoStato,
} from "@/lib/cantieri";

type Agente = { codice: string; descrizione: string | null };

/** Soggetto bloccato dall'esterno (scheda cliente / scheda lead). */
export type SoggettoFisso = {
  tipo: "cliente" | "lead";
  id: string;
  etichetta: string;
  clienteIdAssociato?: string | null;
};

export function CantiereDialog({
  open, onOpenChange, cantiere, agenti, soggettoFisso, queryKeysExtra, provvisorioIniziale = false, onSalvato, nomeIniziale = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cantiere?: CantiereRow | null;
  agenti?: Agente[];
  soggettoFisso?: SoggettoFisso;
  queryKeysExtra?: ReadonlyArray<readonly unknown[]>;
  provvisorioIniziale?: boolean;
  nomeIniziale?: string;
  onSalvato?: (c: { id: string; nome: string; nuovo: boolean }) => void;
}) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const { puoEliminareCantiere } = usePermessiCommerciale();
  const isAgente = roles.includes("agente");
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );
  const forzaAgente = isAgente && !isTrasversale;
  const { data: modificabili } = useCantieriModificabili(cantiere ? [cantiere.id] : [], cantiere, open);
  const modificabile = !cantiere || modificabili?.has(cantiere.id) === true;
  const geocodifica = useServerFn(geocodificaCantiere);
  const { data: agentiFetch = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    enabled: !agenti,
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Agente[];
    },
    staleTime: 5 * 60_000,
  });
  const listaAgenti = agenti ?? agentiFetch;
  const ricalcolaSede = useServerFn(ricalcolaSedeVicina);

  function invalida() {
    qc.invalidateQueries({ queryKey: chiaveCantieriModificabili });
    qc.invalidateQueries({ queryKey: ["cantieri-lista"] });
    queryKeysExtra?.forEach((k) => qc.invalidateQueries({ queryKey: [...k] }));
  }

  const [nome, setNome] = useState("");
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [indirizzo, setIndirizzo] = useState("");
  const [cap, setCap] = useState("");
  const [citta, setCitta] = useState("");
  const [provincia, setProvincia] = useState("");
  const [referente, setReferente] = useState("");
  const [dataInizio, setDataInizio] = useState("");
  const [dataFine, setDataFine] = useState("");
  const [categoria, setCategoria] = useState("");
  const [agenteCodice, setAgenteCodice] = useState("");
  const [note, setNote] = useState("");
  const [attivo, setAttivo] = useState(true);
  const [provvisorio, setProvvisorio] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [saving, setSaving] = useState(false);
  const [prezziOpen, setPrezziOpen] = useState(false);
  const { data: numeroPrezzi } = useQuery({ queryKey: chiaveConteggioPrezziCantiere(cantiere?.id ?? ""), queryFn: () => cantiere ? contaPrezziCantiere(cantiere.id) : 0, enabled: open && !!cantiere });
  const [geoBusy, setGeoBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [sedeBusy, setSedeBusy] = useState(false);
  const [sedeTesto, setSedeTesto] = useState<string | null>(null);
  const [sedeErrore, setSedeErrore] = useState<string | null>(null);
  const [coordDaAutocomplete, setCoordDaAutocomplete] = useState(false);

  function usaLaMiaPosizione() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocalizzazione non disponibile su questo dispositivo");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(Number(pos.coords.latitude.toFixed(6))));
        setLng(String(Number(pos.coords.longitude.toFixed(6))));
        setGpsBusy(false);
        toast.success("Posizione acquisita");
      },
      (err) => {
        setGpsBusy(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Permesso posizione negato: abilitalo nelle impostazioni del browser."
            : "Posizione non disponibile: riprova all'aperto o inserisci le coordinate a mano.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function elimina() {
    if (!cantiere?.id) return;
    const esito = await eliminaConEsito("cantieri", cantiere.id);
    if (esito.tipo !== "eliminato") {
      toast.error(messaggioEliminazioneCantiere(esito));
      return;
    }
    toast.success("Cantiere eliminato");
    await Promise.resolve(invalida());
    onOpenChange(false);
  }

  async function ricalcolaLaSede(id: string) {
    setSedeBusy(true);
    try {
      const r = await ricalcolaSede({ data: { cantiere_id: id } });
      if (r.sede_id) {
        setSedeTesto(testoSedeVicina({
          sede: { nome: r.sede_nome }, sede_piu_vicina_km: r.km, sede_piu_vicina_min: r.minuti,
        }));
        setSedeErrore(null);
        toast.success("Sede più vicina aggiornata");
      } else {
        setSedeTesto(null);
        const msg = r.messaggio ?? "Sede più vicina non calcolabile";
        setSedeErrore(msg);
        toast.error(msg);
      }
      invalida();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Calcolo sede non riuscito";
      setSedeErrore(msg);
      toast.error(msg);
    } finally {
      setSedeBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const c = cantiere;
    setNome(nomeInizialeCantiere(c, nomeIniziale));
    setSoggetto(
      soggettoFisso
        ? { tipo: soggettoFisso.tipo, id: soggettoFisso.id, etichetta: soggettoFisso.etichetta }
        : c?.cliente_id
          ? { tipo: "cliente", id: c.cliente_id, etichetta: c.clienti?.ragione_sociale ?? "Cliente" }
          : c?.lead_id
            ? {
                tipo: "lead", id: c.lead_id,
                etichetta: c.lead?.ragione_sociale || `${c.lead?.nome ?? ""} ${c.lead?.cognome ?? ""}`.trim() || "Lead",
              }
            : null,
    );
    setIndirizzo(c?.indirizzo ?? "");
    setCap(c?.cap ?? "");
    setCitta(c?.citta ?? "");
    setProvincia(c?.provincia ?? "");
    setReferente(c?.referente ?? "");
    setDataInizio(c?.data_inizio ?? "");
    setDataFine(c?.data_fine_prevista ?? "");
    setCategoria(c?.categoria ?? "");
    setAgenteCodice(c?.agente_codice ?? "");
    setNote(c?.note ?? "");
    setAttivo(c?.attivo ?? true);
    setProvvisorio(provvisorioInizialeCantiere(c, provvisorioIniziale));
    setLat(c?.lat != null ? String(c.lat) : "");
    setLng(c?.lng != null ? String(c.lng) : "");
    setSedeTesto(c ? testoSedeVicina(c) : null);
    setSedeErrore(null);
    setCoordDaAutocomplete(false);
  }, [open, cantiere, soggettoFisso, provvisorioIniziale, nomeIniziale]);

  // Precompila l'agente dal soggetto scelto
  useEffect(() => {
    if (!open || !soggetto) return;
    let annullato = false;
    (async () => {
      if (soggetto.tipo === "cliente") {
        const { data } = await supabase.from("clienti").select("codice_agente").eq("id", soggetto.id).maybeSingle();
        const d = data as { codice_agente: string | null } | null;
        if (!annullato && d?.codice_agente) setAgenteCodice((p) => p || d.codice_agente!);
      } else {
        const { data } = await supabase.from("lead").select("agente_codice").eq("id", soggetto.id).maybeSingle();
        const d = data as { agente_codice: string | null } | null;
        if (!annullato && d?.agente_codice) setAgenteCodice((p) => p || d.agente_codice!);
      }
    })();
    return () => { annullato = true; };
  }, [open, soggetto]);

  // L'agente-only intesta a sé stesso solo i cantieri nuovi (in modifica resta il valore salvato)
  useEffect(() => {
    if (!open || !forzaAgente || !user?.id || cantiere) return;
    let annullato = false;
    (async () => {
      const { data } = await supabase.from("profili").select("codice_agente").eq("id", user.id).maybeSingle();
      const cod = (data as { codice_agente: string | null } | null)?.codice_agente;
      if (!annullato && cod) setAgenteCodice(cod);
    })();
    return () => { annullato = true; };
  }, [open, forzaAgente, user?.id, cantiere]);

  const indirizzoCambiato =
    (cantiere?.indirizzo ?? "") !== indirizzo.trim() ||
    (cantiere?.cap ?? "") !== cap.trim() ||
    (cantiere?.citta ?? "") !== citta.trim() ||
    (cantiere?.provincia ?? "") !== provincia.trim();

  async function eseguiGeocodifica(id: string, silenzioso = false) {
    setGeoBusy(true);
    try {
      const esito = await geocodifica({ data: { cantiere_id: id } });
      if (esito.stato === "ok") {
        setLat(esito.lat != null ? String(esito.lat) : "");
        setLng(esito.lng != null ? String(esito.lng) : "");
        toast.success("Cantiere geocodificato");
      } else {
        toast.error(esito.messaggio ?? "Indirizzo non trovato: verifica o inserisci coordinate manuali.");
      }
      invalida();
    } catch (e) {
      if (!silenzioso) toast.error(e instanceof Error ? e.message : "Geocodifica non riuscita");
    } finally {
      setGeoBusy(false);
    }
  }

  async function salva() {
    if (cantiere && !(await puoModificareCantiereDb(cantiere))) {
      toast.error("Non hai i permessi per modificare questo cantiere."); return;
    }
    if (!nome.trim()) { toast.error("Il nome del cantiere è obbligatorio"); return; }
    if (!soggetto) { toast.error("Seleziona un cliente o un lead"); return; }

    const latN = lat.trim() ? Number(lat.replace(",", ".")) : null;
    const lngN = lng.trim() ? Number(lng.replace(",", ".")) : null;
    if ((latN != null && Number.isNaN(latN)) || (lngN != null && Number.isNaN(lngN))) {
      toast.error("Coordinate non valide"); return;
    }
    const coordManuali =
      latN != null && lngN != null &&
      (coordDaAutocomplete ||
        latN !== (cantiere?.lat ?? null) || lngN !== (cantiere?.lng ?? null));

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: nome.trim(),
        cliente_id:
          soggetto.tipo === "cliente"
            ? soggetto.id
            : soggettoFisso?.tipo === "lead"
              ? (soggettoFisso.clienteIdAssociato ?? null)
              : null,
        lead_id: soggetto.tipo === "lead" ? soggetto.id : null,
        indirizzo: indirizzo.trim() || null,
        cap: cap.trim() || null,
        citta: citta.trim() || null,
        provincia: provincia.trim() || null,
        referente: referente.trim() || null,
        data_inizio: dataInizio || null,
        data_fine_prevista: dataFine || null,
        categoria: categoria || null,
        agente_codice: agenteCodice || null,
        note: note.trim() || null,
        attivo,
        provvisorio,
        lat: latN,
        lng: lngN,
      };
      if (coordManuali) {
        payload.geocodifica_stato = "manuale";
        payload.geocodifica_messaggio = null;
        payload.geocodificato_il = new Date().toISOString();
      }

      let id = cantiere?.id ?? "";
      if (cantiere) {
        // In modifica l'agente-only non deve mai riscrivere agente_codice
        if (forzaAgente) delete payload.agente_codice;
        const { data: updated, error } = await supabase.from("cantieri").update(payload as never).eq("id", cantiere.id).select("id");
        if (error) throw error;
        if (!updated?.length) throw new Error("Non hai il permesso di modificare questo cantiere");
      } else {
        payload.created_by = user?.id ?? null;
        const { data, error } = await supabase.from("cantieri").insert(payload as never).select("id").single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }

      toast.success(cantiere ? "Cantiere aggiornato" : "Cantiere creato");
      invalida();

      const serveGeo = !coordManuali && (!cantiere || indirizzoCambiato || latN == null || lngN == null);
      if (serveGeo && (indirizzo.trim() || citta.trim())) {
        await eseguiGeocodifica(id, true);
      } else if (coordManuali) {
        try { await ricalcolaSede({ data: { cantiere_id: id } }); } catch { /* non blocca */ }
        invalida();
      }
      onSalvato?.({ id, nome: nome.trim(), nuovo: !cantiere });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  const stato = (cantiere?.geocodifica_stato ?? "da_geocodificare") as GeoStato;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">{cantiere ? "Modifica cantiere" : "Nuovo cantiere"}{cantiere && <BadgePrezziDedicati conteggio={numeroPrezzi} />}</DialogTitle>
          <DialogDescription>
            L'indirizzo viene geocodificato automaticamente per posizionare il cantiere sulla mappa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome cantiere *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Cliente o lead *</Label>
            {soggetto ? (
              <div className="flex items-center gap-2">
                <Badge variant={soggetto.tipo === "cliente" ? "default" : "secondary"}>
                  {soggetto.tipo === "cliente" ? "Cliente" : "Lead"}
                </Badge>
                <span className="text-sm font-medium truncate">{soggetto.etichetta}</span>
                {!soggettoFisso && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSoggetto(null)}>Cambia</Button>
                )}
              </div>
            ) : (
              <SoggettoCombobox onSelect={setSoggetto} />
            )}
          </div>

          <BloccoIndirizzo
            value={{ indirizzo, cap, citta, provincia }}
            onChange={(d) => {
              if (d.indirizzo !== undefined) setIndirizzo(d.indirizzo);
              if (d.cap !== undefined) setCap(d.cap);
              if (d.citta !== undefined) setCitta(d.citta);
              if (d.provincia !== undefined) setProvincia(d.provincia);
            }}
            etichette={{ provincia: "Prov." }}
            placeholder="Via Roma 10"
            descrizione="Inizia a scrivere e scegli l'indirizzo suggerito per compilare tutto e posizionare il cantiere."
            onCoordinate={(lat, lng) => { setLat(String(lat)); setLng(String(lng)); setCoordDaAutocomplete(true); }}
            onScelto={() => toast.success("Indirizzo compilato dai suggerimenti Google")}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Referente</Label>
              <Input value={referente} onChange={(e) => setReferente(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria || "nessuna"} onValueChange={(v) => setCategoria(v === "nessuna" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuna">Nessuna</SelectItem>
                  {CATEGORIE_CANTIERE.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data inizio</Label>
              <Input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fine prevista</Label>
              <Input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Agente</Label>
              <Select
                value={agenteCodice || "nessuno"}
                onValueChange={(v) => setAgenteCodice(v === "nessuno" ? "" : v)}
                disabled={forzaAgente}
              >
                <SelectTrigger><SelectValue placeholder="Agente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nessuno">Nessuno</SelectItem>
                  {listaAgenti.map((a) => (
                    <SelectItem key={a.codice} value={a.codice}>{a.descrizione ?? a.codice}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4" /> Posizione sulla mappa
                {cantiere && <Badge variant="outline" className={GEO_CLASS[stato]}>{GEO_LABEL[stato]}</Badge>}
              </div>
              {cantiere && (
                <Button
                  type="button" variant="outline" size="sm" disabled={geoBusy}
                  onClick={() => eseguiGeocodifica(cantiere.id)}
                >
                  <RefreshCw className={`size-4 mr-1.5 ${geoBusy ? "animate-spin" : ""}`} /> Riprova geocodifica
                </Button>
              )}
            </div>
            {cantiere?.geocodifica_messaggio && (
              <p className="text-xs text-destructive">{cantiere.geocodifica_messaggio}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Latitudine (manuale)</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="45.4642" />
              </div>
              <div className="space-y-1.5">
                <Label>Longitudine (manuale)</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="9.19" />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={gpsBusy} onClick={usaLaMiaPosizione}>
              <Crosshair className={`size-4 mr-1.5 ${gpsBusy ? "animate-pulse" : ""}`} />
              {gpsBusy ? "Acquisizione…" : "Usa la mia posizione"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Inserendo le coordinate a mano lo stato diventa "Coordinate manuali" e la geocodifica automatica non le sovrascrive.
            </p>
          </div>

          {cantiere && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Navigation className="size-4" /> Sede più vicina
                </div>
                <Button
                  type="button" variant="outline" size="sm" disabled={sedeBusy}
                  onClick={() => ricalcolaLaSede(cantiere.id)}
                >
                  <RefreshCw className={`size-4 mr-1.5 ${sedeBusy ? "animate-spin" : ""}`} /> Ricalcola
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {sedeTesto ?? "Non ancora calcolata: posiziona il cantiere e premi Ricalcola."}
              </p>
              {sedeErrore && <p className="text-sm text-destructive">{sedeErrore}</p>}
            </div>
          )}

          {open && cantiere && <CollegamentiCantiere cantiereId={cantiere.id} onChiudi={() => onOpenChange(false)} />}
          {cantiere && <Button type="button" variant="outline" onClick={() => setPrezziOpen(true)}>Prezzi del cantiere ({numeroPrezzi ?? "…"})</Button>}
          {open && cantiere && <PrezziCantiereDialog key={cantiere.id} open={prezziOpen} onOpenChange={setPrezziOpen} cantiere={cantiere} />}

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="cantiere-attivo" checked={attivo} onCheckedChange={(v) => setAttivo(v === true)} />
            <Label htmlFor="cantiere-attivo" className="cursor-pointer text-sm font-normal">Cantiere attivo</Label>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="cantiere-provvisorio" checked={provvisorio} onCheckedChange={setProvvisorio} className="mt-0.5" />
            <div className="min-w-0">
              <Label htmlFor="cantiere-provvisorio" className="cursor-pointer text-sm font-normal">Provvisorio</Label>
              <p className="text-xs text-muted-foreground">Spegni quando il cantiere è confermato</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          {cantiere && puoEliminareCantiere(cantiere) && (
            <BottoneElimina
              variant="outline"
              etichetta="Elimina"
              className="sm:mr-auto text-destructive hover:text-destructive"
              titolo="Eliminare questo cantiere?"
              descrizione={`"${cantiere.nome}" verrà eliminato definitivamente. L'azione è irreversibile.`}
              onConferma={elimina}
            />
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="button" onClick={salva} disabled={!modificabile || saving || geoBusy}>
            {saving ? "Salvataggio..." : cantiere ? "Salva" : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
