// Elenco fornitori impaginato come /clienti: schede su telefono (ElencoSchede +
// SchedaLista con "seleziona tutti"), tabella fissa da md che sta a 1280 px.
// Ordinamento: intestazioni cliccabili come /clienti, applicato lato server (cerca_fornitori).
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, ChevronsUpDown, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchedaLista, ElencoSchede, type SelezioneTutti } from "@/components/lista-responsive/scheda-lista";
import type { FornitoreElenco } from "@/lib/fornitori.functions";
import type { OrdinamentoFornitori } from "@/lib/fornitori";
import { BadgeFornitore, BadgeObsoleto, BadgeTipoFornitore } from "./controlli-fornitori";
import { BandierinaConvenzionato } from "./BandierinaConvenzionato";

export type SelezioneFornitori = { selezionati: Set<string>; cambia: (id: string, v: boolean) => void; tutti: SelezioneTutti };
export type OrdinamentoElenco = { ordina: OrdinamentoFornitori; direzione: "asc" | "desc"; imposta: (col: OrdinamentoFornitori, direzione: "asc" | "desc") => void };

const COLONNE: { col: OrdinamentoFornitori; label: string; w: string }[] = [
  { col: "codice", label: "Codice", w: "7%" }, { col: "ragione_sociale", label: "Ragione sociale", w: "25%" },
  { col: "citta", label: "Città", w: "13%" }, { col: "partita_iva", label: "P.IVA", w: "11%" },
  { col: "tipo", label: "Tipo fornitore", w: "10%" }, { col: "marca", label: "Marca", w: "13%" },
  { col: "sottocategoria", label: "Sottocategoria", w: "14%" }, { col: "email", label: "Email", w: "7%" },
];

export function ElencoFornitori({ rows, apri, selezione, evidenzia, ordinamento }: { rows: FornitoreElenco[]; apri: (id: string) => void; selezione?: SelezioneFornitori;
  /** FM62 F6: righe da controllare a mano (proposta di classificazione). */
  evidenzia?: (f: FornitoreElenco) => boolean; ordinamento?: OrdinamentoElenco }) {
  const citta = (f: FornitoreElenco) => [f.citta, f.provincia ? `(${f.provincia})` : null].filter(Boolean).join(" ") || "—";
  const email = (f: FornitoreElenco) => f.email
    ? <span className="inline-flex items-center gap-1 text-success" title={f.email}><Mail className="size-4 shrink-0" aria-hidden /><span className="sr-only">Email presente: {f.email}</span></span>
    : <span className="text-muted-foreground" title="Senza email"><span aria-hidden>—</span><span className="sr-only">Senza email</span></span>;
  const marca = (f: FornitoreElenco) => f.marca_codice ? <span title={`Codice marca ${f.marca_codice}`} className="break-words">{f.marca_descrizione || f.marca_codice}</span> : <span className="text-muted-foreground">—</span>;
  if (!rows.length) return <p className="py-10 text-center text-muted-foreground">Nessun fornitore trovato.</p>;
  const s = selezione;
  const stato = s?.tutti.tutti ? true : s?.tutti.alcuni ? "indeterminate" : false;
  const o = ordinamento;
  return <>
    {o && <div className="mb-2 flex items-center gap-2 md:hidden">
      <span className="shrink-0 text-xs text-muted-foreground">Ordina per</span>
      <Select value={`${o.ordina}:${o.direzione}`} onValueChange={v => { const [c, d] = v.split(":"); o.imposta(c as OrdinamentoFornitori, d === "desc" ? "desc" : "asc"); }}>
        <SelectTrigger aria-label="Ordina fornitori" className="min-h-10 min-w-0 flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>{COLONNE.flatMap(c => [<SelectItem key={`${c.col}:asc`} value={`${c.col}:asc`}>{c.label} ↑</SelectItem>, <SelectItem key={`${c.col}:desc`} value={`${c.col}:desc`}>{c.label} ↓</SelectItem>])}</SelectContent>
      </Select>
    </div>}
    <ElencoSchede selezioneTutti={s?.tutti}>{rows.map(f => <SchedaLista key={f.id} onClick={() => apri(f.id)}
      selezione={s ? { checked: s.selezionati.has(f.id), onChange: v => s.cambia(f.id, v) } : undefined}
      titolo={<><span className="block font-mono text-xs text-muted-foreground">{f.codice_gestionale ?? "Senza codice Gamma"}</span><span className="line-clamp-2">{f.ragione_sociale}{f.stato_convenzione === "convenzionato" && <BandierinaConvenzionato className="ml-0.5" />}</span></>}
      campi={[{ etichetta: "Città", valore: citta(f) }, { etichetta: "P.IVA", valore: f.partita_iva || "—" }, { etichetta: "Marca", valore: marca(f) }, ...(f.tipo_effettivo === "servizi" ? [{ etichetta: "Sottocategoria", valore: f.sottocategoria_descrizione || "—" }] : []), { etichetta: "Email", valore: f.email ? <span className="break-all">{f.email}</span> : "—" }]}
      className={evidenzia?.(f) ? "border-warning/50 bg-warning/10" : undefined}
      footer={<><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="text-xs font-medium text-warning">Da controllare: senza articoli</span>}<BadgeFornitore fornitore={f} />{f.obsoleto && <BadgeObsoleto />}</>} />)}</ElencoSchede>
    <div className="hidden md:block">
      <table className="w-full table-fixed text-sm">
        <colgroup>{s && <col style={{ width: "44px" }} />}{COLONNE.map(c => <col key={c.col} style={{ width: c.w }} />)}</colgroup>
        <thead className="border-b text-muted-foreground"><tr>
          {s && <th scope="col" className="px-2 py-3"><Checkbox aria-label={s.tutti.etichetta ?? "Seleziona tutti"} checked={stato} disabled={s.tutti.disabled} onCheckedChange={() => s.tutti.onChange(!s.tutti.tutti)} /></th>}
          {COLONNE.map(c => { const attiva = o?.ordina === c.col;
            return <th scope="col" key={c.col} aria-sort={attiva ? (o!.direzione === "asc" ? "ascending" : "descending") : "none"} className="px-2 py-3 text-left font-medium">
              {o ? <button type="button" onClick={() => o.imposta(c.col, attiva && o.direzione === "asc" ? "desc" : "asc")} className="flex items-center gap-1 text-left transition-colors hover:text-primary">
                <span className="break-words">{c.label}</span>
                {attiva ? (o.direzione === "asc" ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />) : <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground/60" />}
              </button> : c.label}</th>; })}
        </tr></thead>
        <tbody>{rows.map(f => <tr key={f.id} className={`cursor-pointer border-b hover:bg-muted/50 ${evidenzia?.(f) ? "bg-warning/10" : s?.selezionati.has(f.id) ? "bg-primary/5" : ""}`} onClick={() => apri(f.id)}>
          {s && <td className="px-2 py-3" onClick={e => e.stopPropagation()}><Checkbox aria-label={`Seleziona ${f.ragione_sociale ?? "fornitore"}`} checked={s.selezionati.has(f.id)} onCheckedChange={v => s.cambia(f.id, v === true)} /></td>}
          <td className="break-words px-2 py-3 font-mono text-xs">{f.codice_gestionale ?? "—"}</td>
          <td className="break-words px-2 py-3"><Link to="/fornitori/$id" params={{ id: f.id }} className="font-semibold text-primary hover:underline" onClick={e => e.stopPropagation()}>{f.ragione_sociale}</Link>{f.stato_convenzione === "convenzionato" && <BandierinaConvenzionato className="ml-0.5" />}<BadgeFornitore fornitore={f} />{f.obsoleto && <BadgeObsoleto />}</td>
          <td className="break-words px-2 py-3">{citta(f)}</td>
          <td className="break-words px-2 py-3 tabular-nums">{f.partita_iva || "—"}</td>
          <td className="px-2 py-3"><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="mt-1 block text-[11px] font-medium text-warning">Da controllare</span>}</td>
          <td className="px-2 py-3">{marca(f)}</td>
          <td className="break-words px-2 py-3">{f.tipo_effettivo === "servizi" ? f.sottocategoria_descrizione || <span className="text-muted-foreground">—</span> : null}</td>
          <td className="px-2 py-3">{email(f)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
