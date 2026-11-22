import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { codiceArticoloNuovo, LIMITI_GAMMA, validazioneManualeGamma } from "@/lib/esportazione-gamma";
import { formatNumeroIt, parseNumeroIt } from "@/lib/numero-it";
import { costoRiga, importoRiga, marginePercRiga, prezzoNettoRiga, rigaInUnita } from "@/lib/riga-preventivo";
import { applicaLeva, formatCascata, parseCascata, type LevaPrezzoShowroom } from "@/lib/leve-prezzo-showroom";
import type { updateRiga } from "@/lib/preventivi-api";
import type { ArticoloGammaScelto } from "@/components/preventivatore/ArticoloGammaPicker";
import { X } from "lucide-react";

type Patch = Parameters<typeof updateRiga>[1];
type RigaManuale = Parameters<typeof rigaInUnita>[0] & {
  descrizione?: string | null; fornitore_id?: string | null; marca?: string | null;
  codice_articolo_fornitore?: string | null; listino_fornitore?: number | null;
  codice_famiglia?: string | null; codice_sottofamiglia?: string | null;
  sconti_gamma?: number[] | null; ricarico?: number | null; leva_prezzo?: LevaPrezzoShowroom | null;
};

const fmt4 = (v: number | null | undefined) => (v == null ? "" : formatNumeroIt(v, { minDecimals: 2, maxDecimals: 4 }));
const vuotoNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** FM75 F4b: finestra della riga manuale showroom ("articolo in definizione"). Salva solo dati via onPatch. */
export function ArticoloInDefinizioneDialog({ open, onOpenChange, row, onPatch, onSceltaGamma, soloAnagrafica = false }: {
  open: boolean; onOpenChange: (o: boolean) => void; row: RigaManuale; onPatch: (p: Patch) => void;
  /** F4c: percorso esistente di cambio articolo Gamma della riga. */
  onSceltaGamma: (a: ArticoloGammaScelto) => void;
  /** Kit: stessi campi anagrafici, senza leve o totali di vendita. Default preventivi invariato. */
  soloAnagrafica?: boolean;
}) {
  const [fornitoreId, setFornitoreId] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");
  const [marca, setMarca] = useState("");
  const [cercaMarca, setCercaMarca] = useState("");
  const [famiglia, setFamiglia] = useState("");
  const [sottofamiglia, setSottofamiglia] = useState("");
  const [um2, setUm2] = useState("");
  const [fattore, setFattore] = useState("");
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [um, setUm] = useState("");
  const [costo, setCosto] = useState("");
  const [listino, setListino] = useState("");
  // F5b: leve prezzo, comanda l'ultima toccata.
  const [leva, setLeva] = useState<LevaPrezzoShowroom | null>(null);
  const [ricaricoTxt, setRicaricoTxt] = useState("");
  const [cascataTxt, setCascataTxt] = useState("");
  const [prezzoTxt, setPrezzoTxt] = useState("");

  useEffect(() => {
    if (!open) return;
    setFornitoreId(row.fornitore_id ?? null); setCerca("");
    setMarca(row.marca ?? ""); setCodice(row.codice_articolo_fornitore ?? "");
    setCercaMarca(""); setFamiglia(row.codice_famiglia ?? ""); setSottofamiglia(row.codice_sottofamiglia ?? "");
    setUm2(row.um2 ?? ""); setFattore(fmt4(row.fattore_conversione));
    setDescrizione(row.descrizione ?? ""); setUm(row.um ?? "");
    setCosto(fmt4(rigaInUnita({ ...row, um_scelta: 'um1' }, null).costo_unit)); setListino(fmt4(row.listino_fornitore));
    setLeva(null); setRicaricoTxt(fmt4(row.ricarico));
    setCascataTxt(row.leva_prezzo === "sconto_listino" ? formatCascata(row.sconti_gamma) : "");
    setPrezzoTxt(row.prezzo_unit == null ? "" : fmt4(prezzoNettoRiga({ prezzo_unit: row.prezzo_unit, sconti_gamma: row.sconti_gamma })));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const scelto = useQuery({
    queryKey: ["fornitore-nome", fornitoreId], enabled: open && !!fornitoreId,
    queryFn: async () => {
      if (!fornitoreId) return null;
      const { data, error } = await supabase.from("fornitori").select("id, ragione_sociale").eq("id", fornitoreId).maybeSingle();
      if (error) throw error; return data;
    },
  });
  const termine = cerca.trim();
  const risultati = useQuery({
    queryKey: ["fornitori-ricerca-riga", termine], enabled: open && termine.length >= 2,
    queryFn: async () => {
      const t = termine.replace(/[%,()]/g, " ");
      const { data, error } = await supabase.from("fornitori").select("id, ragione_sociale, alias, sconti_base")
        .or(`ragione_sociale.ilike.%${t}%,alias.ilike.%${t}%`).order("ragione_sociale").limit(20);
      if (error) throw error; return data ?? [];
    },
  });

  const marcaScelta = useQuery({
    queryKey: ["marca-manuale", marca], enabled: open && !!marca,
    queryFn: async () => {
      const { data, error } = await supabase.from("marche").select("codice,descrizione").eq("attivo", true).eq("codice", marca).maybeSingle();
      if (error) throw error; return data;
    },
  });
  const termineMarca = cercaMarca.trim();
  const marche = useQuery({
    queryKey: ["marche-ricerca-manuale", termineMarca], enabled: open && termineMarca.length >= 2,
    queryFn: async () => {
      const t = termineMarca.replace(/[%,()]/g, " ");
      const { data, error } = await supabase.from("marche").select("codice,descrizione").eq("attivo", true)
        .or(`codice.ilike.%${t}%,descrizione.ilike.%${t}%`).order("codice").limit(20);
      if (error) throw error; return data ?? [];
    },
  });
  const catalogoFamiglie = useQuery({
    queryKey: ["famiglie-articoli-gamma"], enabled: open, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("famiglie_articoli_gamma").select("codice_famiglia,famiglia,codice_sottofamiglia,sottofamiglia").order("codice_famiglia").order("codice_sottofamiglia");
      if (error) throw error; return data ?? [];
    },
  });
  const famiglie = [...new Map((catalogoFamiglie.data ?? []).flatMap(f => f.codice_famiglia ? [[f.codice_famiglia, f] as const] : [])).values()];
  const sottofamiglie = [...new Map((catalogoFamiglie.data ?? []).flatMap(f => f.codice_famiglia === famiglia && f.codice_sottofamiglia?.trim() ? [[f.codice_sottofamiglia, f] as const] : [])).values()];

  // F4c: aggancio al catalogo dal codice fornitore (dopo una pausa di digitazione o all'uscita dal campo).
  const [codiceCercato, setCodiceCercato] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCodiceCercato(codice.trim()), 600);
    return () => clearTimeout(t);
  }, [codice]);
  const aCatalogo = useQuery({
    queryKey: ["aggancio-codice-fornitore", codiceCercato, fornitoreId], enabled: open && codiceCercato.length > 0,
    queryFn: async () => {
      const esatto = codiceCercato.replace(/[\\%_]/g, (c) => `\\${c}`);
      let q = supabase.from("articoli_gamma_fornitori").select("articolo_codice").ilike("codice_articolo_fornitore", esatto);
      if (fornitoreId) q = q.eq("fornitore_id", fornitoreId);
      const { data, error } = await q.limit(5);
      if (error) throw error;
      const codici = [...new Set((data ?? []).map((r) => r.articolo_codice))];
      if (!codici.length) return [];
      const { data: art, error: e2 } = await supabase.from("articoli_gamma")
        .select("codice, descrizione, stato_gamma, um, marca_codice").in("codice", codici);
      if (e2) throw e2;
      return art ?? [];
    },
  });
  const usaArticolo = (a: { codice: string; descrizione: string | null; um: string | null; marca_codice: string | null }) => {
    onSceltaGamma({ codice: a.codice, descrizione: a.descrizione, um: a.um, marca: a.marca_codice });
    onOpenChange(false);
  };

  const costoNum = parseNumeroIt(costo);
  const listinoNum = parseNumeroIt(listino);
  const numeriValidi = (costo.trim() === "" || costoNum != null) && (listino.trim() === "" || listinoNum != null);
  const cascata = parseCascata(cascataTxt);
  const patchLeva = soloAnagrafica || leva === null ? null : applicaLeva({
    leva, costoUnit: costo.trim() === "" ? null : costoNum, listinoFornitore: listino.trim() === "" ? null : listinoNum,
    cascata, ricaricoPerc: parseNumeroIt(ricaricoTxt), prezzoManuale: parseNumeroIt(prezzoTxt),
  });
  const erroreLeva = leva === "sconto_listino" && cascata === null ? "Sconto non valido: scrivi ad esempio -45+5"
    : leva !== null && patchLeva === null ? "Dati insufficienti per questa leva (costo, listino o prezzo mancanti)" : null;
  const patchCosto = rigaInUnita({ ...row, um_scelta: 'um1' }, null, { costo_unit: costo.trim() === "" ? null : costoNum }).patchUm1;
  const anteprima = { ...row, ...(patchLeva ?? {}), costo: numeriValidi ? patchCosto.costo ?? null : row.costo ?? null };
  const importoAnteprima = importoRiga(anteprima);
  const margineEuro = importoAnteprima - Number(anteprima.costo ?? 0);
  const marginePerc = marginePercRiga(anteprima);
  const fattoreNum = parseNumeroIt(fattore);
  const controlliGamma = validazioneManualeGamma(descrizione, um2, fattoreNum, fattore.trim() !== "");
  const codiceGamma = codiceArticoloNuovo(marca, codice);
  const codiceLungo = (codiceGamma?.length ?? 0) > LIMITI_GAMMA.codiceArticolo;
  const valido = controlliGamma.descrizioneValida && controlliGamma.fattoreValido && numeriValidi && erroreLeva === null;
  const tocca = (l: LevaPrezzoShowroom) => setLeva(l);

  const salva = () => {
    if (!valido) return;
    onPatch({
      descrizione: descrizione.trim(), um: vuotoNull(um), marca: vuotoNull(marca),
      codice_articolo_fornitore: vuotoNull(codice), fornitore_id: fornitoreId,
      listino_fornitore: listino.trim() === "" ? null : listinoNum,
      codice_famiglia: vuotoNull(famiglia), codice_sottofamiglia: vuotoNull(sottofamiglia),
      um2: vuotoNull(um2), fattore_conversione: fattore.trim() === "" ? null : fattoreNum,
      ...patchCosto,
      ...(patchLeva ?? {}),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Articolo in definizione</DialogTitle>
          <DialogDescription>Compila quello che sai ora: tutto è facoltativo tranne la descrizione.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="aid-cod">Codice articolo fornitore</Label><Input id="aid-cod" value={codice} onChange={(e) => setCodice(e.target.value)} onBlur={() => setCodiceCercato(codice.trim())} /></div>
          {(aCatalogo.data ?? []).length > 0 && (
            <div className="grid gap-2 rounded-md border border-l-4 border-l-primary bg-card p-3">
              <p className="text-sm font-semibold">Articolo già a catalogo</p>
              {(aCatalogo.data ?? []).map((a) => (
                <div key={a.codice} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-mono font-semibold">{a.codice}</span>
                    <span className="break-words"> — {a.descrizione ?? "senza descrizione"}</span>
                    {a.stato_gamma && <span className="text-muted-foreground"> · {a.stato_gamma}</span>}
                  </div>
                  <Button type="button" size="sm" variant="secondary" className="min-h-10 shrink-0" onClick={() => usaArticolo(a)}>Usa questo articolo</Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Facoltativo: puoi ignorarlo e restare sulla riga manuale.</p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="aid-desc">Descrizione *</Label>
            <textarea id="aid-desc" rows={1} value={descrizione} onChange={(e) => setDescrizione(e.target.value)}
              ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
              onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }}
              className="min-h-10 w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm [field-sizing:content]" />
            {descrizione.trim() === "" && <p className="text-xs text-destructive">La descrizione è obbligatoria</p>}
            <p className={`text-xs ${descrizione.length > LIMITI_GAMMA.descrizione ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">{descrizione.length}/{LIMITI_GAMMA.descrizione}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aid-forn">Fornitore</Label>
            {fornitoreId ? (
              <div className="flex min-h-10 items-center gap-2 rounded-md border px-3 py-1.5">
                <span className="min-w-0 flex-1 break-words text-sm">{scelto.data?.ragione_sociale ?? "Caricamento…"}</span>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setFornitoreId(null)} aria-label="Togli fornitore" title="Togli fornitore">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Input id="aid-forn" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per ragione sociale (almeno 2 lettere)" />
                {termine.length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {risultati.isLoading ? <p className="p-2 text-sm text-muted-foreground">Ricerca…</p>
                      : (risultati.data ?? []).length === 0 ? <p className="p-2 text-sm text-muted-foreground">Nessun fornitore trovato</p>
                      : (risultati.data ?? []).map((f) => (
                        <Button key={f.id} type="button" variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal break-words rounded-none px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => { setFornitoreId(f.id); setCerca(""); if (cascataTxt.trim() === "" && f.sconti_base?.length) setCascataTxt(formatCascata(f.sconti_base)); }}>
                          {f.ragione_sociale}{f.alias ? <span className="text-muted-foreground"> · {f.alias}</span> : null}
                        </Button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aid-marca">Marca</Label>
            {marca ? <>
              <div className="flex min-h-11 items-center gap-2 rounded-md border px-3">
                <span className="min-w-0 flex-1 break-words text-sm">{marcaScelta.data ? `${marcaScelta.data.codice} — ${marcaScelta.data.descrizione ?? ''}` : marca}</span>
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Togli marca" title="Togli marca" onClick={() => { setMarca(""); setCercaMarca(""); }}><X className="h-4 w-4" /></Button>
              </div>
              {!marcaScelta.isPending && !marcaScelta.isError && !marcaScelta.data && <p className="text-xs text-pv-arancio">marca non in elenco, sceglila dall'elenco</p>}
            </> : <>
              <Input id="aid-marca" className="min-h-11" value={cercaMarca} onChange={e => setCercaMarca(e.target.value)} placeholder="Cerca per codice o descrizione (almeno 2 lettere)" />
              {termineMarca.length >= 2 && <div className="max-h-48 overflow-y-auto rounded-md border">
                {marche.isPending ? <p className="p-2 text-sm text-muted-foreground">Ricerca…</p> : (marche.data ?? []).length === 0 ? <p className="p-2 text-sm text-muted-foreground">Nessuna marca trovata</p> : (marche.data ?? []).map(m =>
                  <Button key={m.codice} type="button" variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal break-words rounded-none text-left" onClick={() => { setMarca(m.codice); setCercaMarca(""); }}>{m.codice} — {m.descrizione}</Button>)}
              </div>}
            </>}
            {(marcaScelta.isError || marche.isError) && <p role="alert" className="text-xs text-destructive">Impossibile caricare le marche.</p>}
          </div>
          {codiceGamma && <div className={`rounded-md border border-l-4 bg-card p-3 text-sm ${codiceLungo ? 'border-l-destructive text-destructive' : 'border-l-primary'}`}>
            Codice che verrà creato in Gamma: <strong className="break-all font-mono">{codiceGamma}</strong> ({codiceGamma.length}/{LIMITI_GAMMA.codiceArticolo})
            {codiceLungo && <p className="mt-1 text-xs">codice troppo lungo</p>}
          </div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5"><Label>Famiglia</Label><Select value={famiglia || '__none__'} onValueChange={v => { const nuova = v === '__none__' ? '' : v; if (nuova !== famiglia) setSottofamiglia(''); setFamiglia(nuova); }}>
              <SelectTrigger aria-label="Famiglia" className="min-h-11 w-full"><SelectValue placeholder="Scegli famiglia" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Nessuna famiglia</SelectItem>{famiglie.map(f => f.codice_famiglia && <SelectItem key={f.codice_famiglia} value={f.codice_famiglia}>{f.codice_famiglia} — {f.famiglia}</SelectItem>)}</SelectContent>
            </Select>{!famiglia && <p className="text-xs text-pv-arancio">Obbligatoria per l'esportazione a Gamma</p>}</div>
            <div className="min-w-0 space-y-1.5"><Label>Sottofamiglia</Label><Select value={sottofamiglia || '__none__'} disabled={!famiglia} onValueChange={v => setSottofamiglia(v === '__none__' ? '' : v)}>
              <SelectTrigger aria-label="Sottofamiglia" className="min-h-11 w-full"><SelectValue placeholder="Scegli sottofamiglia" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Nessuna sottofamiglia</SelectItem>{sottofamiglie.map(f => f.codice_sottofamiglia && <SelectItem key={f.codice_sottofamiglia} value={f.codice_sottofamiglia}>{f.codice_sottofamiglia} — {f.sottofamiglia}</SelectItem>)}</SelectContent>
            </Select></div>
          </div>
          {catalogoFamiglie.isError && <p role="alert" className="text-xs text-destructive">Impossibile caricare le famiglie.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="aid-um">U.M.</Label><Input id="aid-um" value={um} onChange={(e) => setUm(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-um2">U.M. secondaria</Label><Input id="aid-um2" value={um2} onChange={e => setUm2(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-fattore">Fattore di conversione</Label><Input id="aid-fattore" inputMode="decimal" aria-invalid={!controlliGamma.fattoreValido} value={fattore} onChange={e => setFattore(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Fattore = quante {um.trim() || '[UM1]'} ci sono in 1 {um2.trim() || '[UM2]'}. Esempio: sacco da 25 kg venduto a tonnellate → U.M. T., U.M. secondaria NR, fattore 0,025. Lascia vuoto se l'articolo ha una sola unità.</p>
          {!controlliGamma.fattoreValido && <p role="alert" className="text-xs text-destructive">Indica un fattore maggiore di zero, con al massimo 4 decimali, per la U.M. secondaria.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="aid-costo">Costo (€)</Label><Input id="aid-costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-list">Listino fornitore (€)</Label><Input id="aid-list" inputMode="decimal" value={listino} onChange={(e) => setListino(e.target.value)} /></div>
          </div>
          {!soloAnagrafica && <div className="grid gap-2 rounded-md border border-l-4 border-l-primary bg-card p-3">
            <p className="text-sm font-semibold">Prezzo di vendita</p>
            <p className="text-xs text-muted-foreground">Comanda l'ultimo campo che modifichi.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label htmlFor="aid-ric">Ricarico %</Label>
                <Input id="aid-ric" inputMode="decimal" value={ricaricoTxt} className={leva === "ricarico" ? "ring-2 ring-primary" : undefined}
                  onChange={(e) => { setRicaricoTxt(e.target.value); tocca("ricarico"); }} /></div>
              <div className="grid gap-1.5"><Label htmlFor="aid-casc">Sconto dal listino</Label>
                <Input id="aid-casc" placeholder="-45+5" value={cascataTxt} disabled={listino.trim() === "" || listinoNum == null}
                  className={leva === "sconto_listino" ? "ring-2 ring-primary" : undefined}
                  onChange={(e) => { setCascataTxt(e.target.value); tocca("sconto_listino"); }} /></div>
              <div className="grid gap-1.5"><Label htmlFor="aid-prz">Prezzo (€)</Label>
                <Input id="aid-prz" inputMode="decimal" value={prezzoTxt} className={leva === "prezzo_manuale" ? "ring-2 ring-primary" : undefined}
                  onChange={(e) => { setPrezzoTxt(e.target.value); tocca("prezzo_manuale"); }} /></div>
            </div>
            {listino.trim() === "" && <p className="text-xs text-muted-foreground">Lo sconto dal listino si attiva indicando il listino fornitore.</p>}
            {erroreLeva && <p className="text-xs text-destructive">{erroreLeva}</p>}
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-muted px-2 py-0.5">Netto € {fmt4(prezzoNettoRiga(anteprima))}</span>
              <span className={marginePerc < 0 ? "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive" : "rounded-full bg-pv-verde-tenue px-2 py-0.5 text-pv-verde"}>
                Margine € {formatNumeroIt(margineEuro, { minDecimals: 2, maxDecimals: 2 })} · {formatNumeroIt(marginePerc, { minDecimals: 1, maxDecimals: 1 })}%
              </span>
            </div>
          </div>}
          {!numeriValidi && <p className="text-xs text-destructive">Costo e listino devono essere numeri (es. 12,5000)</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button type="button" onClick={salva} disabled={!valido}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
