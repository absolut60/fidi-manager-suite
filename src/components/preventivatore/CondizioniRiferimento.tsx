import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { campiRiferimentoPreventivo, type CataloghiRiferimento, type RiferimentoPreventivo } from "@/lib/condizioni-riferimento";

export function CondizioniRiferimento({ riferimento, cataloghi, errore, caricamento, modificabile, onSave }: {
  riferimento: RiferimentoPreventivo; cataloghi?: CataloghiRiferimento; errore?: string; caricamento: boolean; modificabile: boolean;
  onSave: (patch: RiferimentoPreventivo) => Promise<void>;
}) {
  const [attivo, setAttivo] = useState(riferimento.listino_rif != null);
  const [valori, setValori] = useState(riferimento);
  const [salvando, setSalvando] = useState(false);
  const [erroreSalvataggio, setErroreSalvataggio] = useState(false);
  const salva = async (abilitato: boolean, nuovi: RiferimentoPreventivo) => {
    const patch = campiRiferimentoPreventivo(abilitato, nuovi);
    if (!patch) return;
    setSalvando(true); setErroreSalvataggio(false);
    try { await onSave(patch); } catch { setErroreSalvataggio(true); setAttivo(riferimento.listino_rif != null); setValori(riferimento); }
    finally { setSalvando(false); }
  };
  const cambia = (patch: Partial<RiferimentoPreventivo>) => {
    const nuovi = { ...valori, ...patch };
    setValori(nuovi); void salva(true, nuovi);
  };
  const selettore = (etichetta: string, valore: string, opzioni: { valore: string; label: string }[], obbligatorio = false) => <div className="grid min-w-0 gap-1">
    <Label className="text-xs text-muted-foreground">{etichetta}{obbligatorio ? " *" : ""}</Label>
    <Select value={valore || "__none__"} disabled={!modificabile || salvando || !!errore || caricamento} onValueChange={v => {
      if (etichetta === "Listino di riferimento") cambia({ listino_rif: Number(v) });
      else if (etichetta === "Macrocategoria di riferimento") cambia({ macrocategoria_rif: v });
      else cambia({ categoria_rif: v === "__none__" ? null : v });
    }}><SelectTrigger aria-label={etichetta} className="min-h-10 w-full min-w-0 bg-card px-2 text-xs [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Scegli"/></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">
      {!obbligatorio && <SelectItem value="__none__">—</SelectItem>}
      {opzioni.map(o => <SelectItem key={o.valore} value={o.valore} className="whitespace-normal break-words">{o.label}</SelectItem>)}
    </SelectContent></Select>
  </div>;
  return <div className="col-span-2 min-w-0 space-y-2 border-t pt-2">
    <Label className="flex min-h-10 items-center gap-2 text-xs"><Switch aria-label="Condizioni di riferimento" checked={attivo} disabled={!modificabile || salvando} onCheckedChange={v => {
      setAttivo(v);
      if (!v) { setValori({ listino_rif: null, macrocategoria_rif: null, categoria_rif: null }); void salva(false, valori); }
    }}/><span>Condizioni di riferimento</span></Label>
    {attivo && <>
      {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
      {caricamento && <p className="text-xs text-muted-foreground">Caricamento condizioni…</p>}
      {cataloghi && (!cataloghi.listini.length || !cataloghi.macrocategorie.length) && <p role="alert" className="text-xs text-destructive">Listini o macrocategorie non disponibili per questo utente.</p>}
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        {selettore("Listino di riferimento", valori.listino_rif?.toString() ?? "", cataloghi?.listini.map(c => ({ valore: c.codice.toString(), label: `${c.codice} — ${c.descrizione}` })) ?? [], true)}
        {selettore("Macrocategoria di riferimento", valori.macrocategoria_rif ?? "", cataloghi?.macrocategorie.map(c => ({ valore: c.codice, label: c.label })) ?? [], true)}
        {selettore("Categoria di riferimento", valori.categoria_rif ?? "", cataloghi?.categorie.map(c => ({ valore: c.codice, label: c.label })) ?? [])}
      </div>
      {!campiRiferimentoPreventivo(true, valori) && <p className="text-xs text-muted-foreground">Listino e macrocategoria obbligatori.</p>}
    </>}
    {erroreSalvataggio && <p role="alert" className="text-xs text-destructive">Condizioni non salvate.</p>}
  </div>;
}