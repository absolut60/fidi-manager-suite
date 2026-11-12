// Elenco fornitori impaginato come /clienti: schede su telefono (ElencoSchede +
// SchedaLista con "seleziona tutti"), tabella fissa da lg che sta a 1280 px.
// Ordinamento: intestazioni cliccabili come /clienti, applicato lato server (cerca_fornitori).
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { IntestazioneOrdinabile, MenuOrdinamento } from "@/components/lista-responsive/ordinamento-colonne";
import { SchedaLista, ElencoSchede, type SelezioneTutti } from "@/components/lista-responsive/scheda-lista";
import type { FornitoreElenco } from "@/lib/fornitori.functions";
import type { OrdinamentoFornitori } from "@/lib/fornitori";
import { BadgeFornitore, BadgeObsoleto, BadgeTipoFornitore } from "./controlli-fornitori";
import { BandierinaConvenzionato } from "./BandierinaConvenzionato";

export type SelezioneFornitori = { selezionati: Set<string>; cambia: (id: string, v: boolean) => void; tutti: SelezioneTutti };
export type OrdinamentoElenco = { ordina: OrdinamentoFornitori; direzione: "asc" | "desc"; imposta: (col: OrdinamentoFornitori, direzione: "asc" | "desc") => void };

/** FM63 F6: righe dei convenzionati in celeste tenue (tabella e schede). */
const CONV = "bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/50";
const conv = (f: FornitoreElenco) => f.stato_convenzione === "convenzionato";

const COLONNE: { col: OrdinamentoFornitori; label: string; w: string }[] = [
  { col: "codice", label: "Codice", w: "7%" }, { col: "ragione_sociale", label: "Ragione sociale", w: "27%" },
  { col: "citta", label: "Città", w: "13%" }, { col: "partita_iva", label: "P.IVA", w: "10.5%" },
  { col: "tipo", label: "Tipo fornitore", w: "10.5%" }, { col: "marca", label: "Marca", w: "13%" },
  { col: "sottocategoria", label: "Sottocategoria", w: "13%" }, { col: "email", label: "Email", w: "6%" },
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
    {o && <MenuOrdinamento ordinamento={o} colonne={COLONNE} etichetta="Ordina fornitori" className="mb-2 lg:hidden" />}
    <ElencoSchede selezioneTutti={s?.tutti} finoA="lg">{rows.map(f => <SchedaLista key={f.id} onClick={() => apri(f.id)}
      selezione={s ? { checked: s.selezionati.has(f.id), onChange: v => s.cambia(f.id, v) } : undefined}
      titolo={<><span className="block font-mono text-xs text-muted-foreground">{f.codice_gestionale ?? "Senza codice Gamma"}</span><span className="flex min-w-0 items-start gap-0.5">{conv(f) && <BandierinaConvenzionato className="-ml-1 shrink-0" />}<span className="line-clamp-2 min-w-0">{f.ragione_sociale}</span></span></>}
      campi={[{ etichetta: "Città", valore: citta(f) }, { etichetta: "P.IVA", valore: f.partita_iva || "—" }, { etichetta: "Marca", valore: marca(f) }, ...(f.tipo_effettivo === "servizi" ? [{ etichetta: "Sottocategoria", valore: f.sottocategoria_descrizione || "—" }] : []), { etichetta: "Email", valore: f.email ? <span className="break-all">{f.email}</span> : "—" }]}
      className={evidenzia?.(f) ? "border-warning/50 bg-warning/10" : conv(f) ? `border-sky-200 dark:border-sky-900 ${CONV}` : undefined}
      footer={<><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="text-xs font-medium text-warning">Da controllare: senza articoli</span>}<BadgeFornitore fornitore={f} />{f.obsoleto && <BadgeObsoleto />}</>} />)}</ElencoSchede>
    <div className="hidden lg:block">
      <table className="w-full table-fixed text-sm">
        <colgroup>{s && <col style={{ width: "44px" }} />}{COLONNE.map(c => <col key={c.col} style={{ width: c.w }} />)}</colgroup>
        <thead className="border-b text-muted-foreground"><tr>
          {s && <th scope="col" className="px-2 py-3"><Checkbox aria-label={s.tutti.etichetta ?? "Seleziona tutti"} checked={stato} disabled={s.tutti.disabled} onCheckedChange={() => s.tutti.onChange(!s.tutti.tutti)} /></th>}
          {COLONNE.map(c => <IntestazioneOrdinabile key={c.col} col={c.col} ordinamento={o} className="xl:whitespace-nowrap">{c.label}</IntestazioneOrdinabile>)}
        </tr></thead>
        <tbody>{rows.map(f => <tr key={f.id} className={`cursor-pointer border-b ${evidenzia?.(f) ? "bg-warning/10 hover:bg-warning/20" : conv(f) ? `${CONV} ${s?.selezionati.has(f.id) ? "shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}` : s?.selezionati.has(f.id) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}`} onClick={() => apri(f.id)}>
          {s && <td className="px-2 py-3" onClick={e => e.stopPropagation()}><Checkbox aria-label={`Seleziona ${f.ragione_sociale ?? "fornitore"}`} checked={s.selezionati.has(f.id)} onCheckedChange={v => s.cambia(f.id, v === true)} /></td>}
          <td className="break-words px-2 py-3 font-mono text-xs">{f.codice_gestionale ?? "—"}</td>
          <td className="break-words px-2 py-3"><span className="flex min-w-0 items-start gap-0.5">{conv(f) && <BandierinaConvenzionato className="-ml-1 shrink-0" />}<Link to="/fornitori/$id" params={{ id: f.id }} className="min-w-0 break-words font-semibold text-primary hover:underline" onClick={e => e.stopPropagation()}>{f.ragione_sociale}</Link></span><BadgeFornitore fornitore={f} />{f.obsoleto && <BadgeObsoleto />}</td>
          <td className="break-words px-2 py-3">{citta(f)}</td>
          <td className="whitespace-nowrap px-2 py-3 tabular-nums">{f.partita_iva || "—"}</td>
          <td className="whitespace-nowrap px-2 py-3"><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="mt-1 block text-[11px] font-medium text-warning">Da controllare</span>}</td>
          <td className="px-2 py-3">{marca(f)}</td>
          <td className="break-words px-2 py-3">{f.tipo_effettivo === "servizi" ? f.sottocategoria_descrizione || <span className="text-muted-foreground">—</span> : null}</td>
          <td className="px-2 py-3">{email(f)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
