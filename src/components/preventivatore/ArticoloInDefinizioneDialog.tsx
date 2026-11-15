import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  sconti_gamma?: number[] | null; ricarico?: number | null; leva_prezzo?: LevaPrezzoShowroom | null;
};

const fmt4 = (v: number | null | undefined) => (v == null ? "" : formatNumeroIt(v, { minDecimals: 2, maxDecimals: 4 }));
const vuotoNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** FM75 F4b: finestra della riga manuale showroom ("articolo in definizione"). Salva solo dati via onPatch. */
export function ArticoloInDefinizioneDialog({ open, onOpenChange, row, onPatch, onSceltaGamma }: {
  open: boolean; onOpenChange: (o: boolean) => void; row: RigaManuale; onPatch: (p: Patch) => void;
  /** F4c: percorso esistente di cambio articolo Gamma della riga. */
  onSceltaGamma: (a: ArticoloGammaScelto) => void;
}) {
  const [fornitoreId, setFornitoreId] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");
  const [marca, setMarca] = useState("");
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
    setDescrizione(row.descrizione ?? ""); setUm(row.um ?? "");
    setCosto(fmt4(rigaInUnita(row, null).costo_unit)); setListino(fmt4(row.listino_fornitore));
    setLeva(null); setRicaricoTxt(fmt4(row.ricarico));
    setCascataTxt(row.leva_prezzo === "sconto_listino" ? formatCascata(row.sconti_gamma) : "");
    setPrezzoTxt(row.prezzo_unit == null ? "" : fmt4(prezzoNettoRiga({ prezzo_unit: row.prezzo_unit, sconti_gamma: row.sconti_gamma })));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const scelto = useQuery({
    queryKey: ["fornitore-nome", fornitoreId], enabled: open && !!fornitoreId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fornitori").select("id, ragione_sociale").eq("id", fornitoreId!).maybeSingle();
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
  const patchLeva = leva === null ? null : applicaLeva({
    leva, costoUnit: costo.trim() === "" ? null : costoNum, listinoFornitore: listino.trim() === "" ? null : listinoNum,
    cascata, ricaricoPerc: parseNumeroIt(ricaricoTxt), prezzoManuale: parseNumeroIt(prezzoTxt),
  });
  const erroreLeva = leva === "sconto_listino" && cascata === null ? "Sconto non valido: scrivi ad esempio -45+5"
    : leva !== null && patchLeva === null ? "Dati insufficienti per questa leva (costo, listino o prezzo mancanti)" : null;
  const patchCosto = rigaInUnita(row, null, { costo_unit: costo.trim() === "" ? null : costoNum }).patchUm1;
  const anteprima = { ...row, ...(patchLeva ?? {}), costo: numeriValidi ? patchCosto.costo ?? null : row.costo ?? null };
  const importoAnteprima = importoRiga(anteprima);
  const margineEuro = importoAnteprima - Number(anteprima.costo ?? 0);
  const marginePerc = marginePercRiga(anteprima);
  const valido = descrizione.trim() !== "" && numeriValidi && erroreLeva === null;
  const tocca = (l: LevaPrezzoShowroom) => setLeva(l);

  const salva = () => {
    if (!valido) return;
    onPatch({
      descrizione: descrizione.trim(), um: vuotoNull(um), marca: vuotoNull(marca),
      codice_articolo_fornitore: vuotoNull(codice), fornitore_id: fornitoreId,
      listino_fornitore: listino.trim() === "" ? null : listinoNum,
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
                      : risultati.data!.map((f) => (
                        <button key={f.id} type="button" className="block min-h-10 w-full break-words px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => { setFornitoreId(f.id); setCerca(""); if (cascataTxt.trim() === "" && f.sconti_base?.length) setCascataTxt(formatCascata(f.sconti_base)); }}>
                          {f.ragione_sociale}{f.alias ? <span className="text-muted-foreground"> · {f.alias}</span> : null}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="aid-marca">Marca</Label><Input id="aid-marca" value={marca} onChange={(e) => setMarca(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-cod">Codice articolo fornitore</Label><Input id="aid-cod" value={codice} onChange={(e) => setCodice(e.target.value)} onBlur={() => setCodiceCercato(codice.trim())} /></div>
          </div>
          {(aCatalogo.data ?? []).length > 0 && (
            <div className="grid gap-2 rounded-md border border-l-4 border-l-primary bg-muted/30 p-3">
              <p className="text-sm font-semibold">Articolo già a catalogo</p>
              {aCatalogo.data!.map((a) => (
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
            <textarea id="aid-desc" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {descrizione.trim() === "" && <p className="text-xs text-destructive">La descrizione è obbligatoria</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5"><Label htmlFor="aid-um">U.M.</Label><Input id="aid-um" value={um} onChange={(e) => setUm(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-costo">Costo (€)</Label><Input id="aid-costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aid-list">Listino fornitore (€)</Label><Input id="aid-list" inputMode="decimal" value={listino} onChange={(e) => setListino(e.target.value)} /></div>
          </div>
          <div className="grid gap-2 rounded-md border p-3">
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
          </div>
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
