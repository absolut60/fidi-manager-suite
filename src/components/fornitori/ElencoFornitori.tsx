// Elenco fornitori impaginato come /clienti: schede su telefono (ElencoSchede +
// SchedaLista con "seleziona tutti"), tabella fissa da md che sta a 1280 px.
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SchedaLista, ElencoSchede, type SelezioneTutti } from "@/components/lista-responsive/scheda-lista";
import type { FornitoreElenco } from "@/lib/fornitori.functions";
import { BadgeFornitore, BadgeTipoFornitore, BadgeConvenzionato } from "./controlli-fornitori";

export type SelezioneFornitori = { selezionati: Set<string>; cambia: (id: string, v: boolean) => void; tutti: SelezioneTutti };

const num = (n: number) => n.toLocaleString("it-IT", { useGrouping: true });
export function ElencoFornitori({ rows, apri, mostraArticoli = true, selezione, evidenzia }: { rows: FornitoreElenco[]; apri: (id: string) => void; mostraArticoli?: boolean; selezione?: SelezioneFornitori;
  /** FM62 F6: righe da controllare a mano (proposta di classificazione). */
  evidenzia?: (f: FornitoreElenco) => boolean }) {
  const citta = (f: FornitoreElenco) => [f.citta, f.provincia ? `(${f.provincia})` : null].filter(Boolean).join(" ") || "—";
  const articoli = (f: FornitoreElenco) => <span className="tabular-nums">{num(f.n_articoli)}<span className="block text-[11px] text-muted-foreground">{num(f.n_preferenziale)} pref.</span></span>;
  const badgeCliente = (f: FornitoreElenco) => f.anche_cliente ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Anche cliente</Badge> : null;
  const email = (f: FornitoreElenco) => f.email
    ? <span className="inline-flex items-center gap-1 text-success" title={f.email}><Mail className="size-4 shrink-0" aria-hidden /><span className="sr-only">Email presente: {f.email}</span></span>
    : <span className="text-muted-foreground" title="Senza email"><span aria-hidden>—</span><span className="sr-only">Senza email</span></span>;
  if (!rows.length) return <p className="py-10 text-center text-muted-foreground">Nessun fornitore trovato.</p>;
  const s = selezione;
  const colonne = ["Codice", "Ragione sociale", "Città", "P.IVA", "Tipo", "Condizione di pagamento", "Email", ...(mostraArticoli ? ["Articoli"] : []), "Cliente"];
  const larghezze = s
    ? (mostraArticoli ? ["3%", "7%", "22%", "12%", "10%", "10%", "16%", "6%", "7%", "7%"] : ["3%", "7%", "25%", "13%", "11%", "11%", "17%", "6%", "7%"])
    : (mostraArticoli ? ["7%", "24%", "12%", "10%", "10%", "17%", "6%", "7%", "7%"] : ["7%", "27%", "13%", "11%", "11%", "18%", "6%", "7%"]);
  const stato = s?.tutti.tutti ? true : s?.tutti.alcuni ? "indeterminate" : false;
  return <>
    <ElencoSchede selezioneTutti={s?.tutti}>{rows.map(f => <SchedaLista key={f.id} onClick={() => apri(f.id)}
      selezione={s ? { checked: s.selezionati.has(f.id), onChange: v => s.cambia(f.id, v) } : undefined}
      titolo={<><span className="block font-mono text-xs text-muted-foreground">{f.codice_gestionale ?? "Senza codice Gamma"}</span><span className="line-clamp-2">{f.ragione_sociale}</span>{f.convenzionato && <span className="mt-1 block"><BadgeConvenzionato /></span>}{f.alias && <span className="block text-xs text-muted-foreground">{f.alias}</span>}</>}
      campi={[{ etichetta: "Città", valore: citta(f) }, { etichetta: "P.IVA", valore: f.partita_iva || "—" }, { etichetta: "Pagamento", valore: f.condizione_pagamento_desc || "—" }, { etichetta: "Email", valore: f.email ? <span className="break-all">{f.email}</span> : "—" }, ...(mostraArticoli ? [{ etichetta: "Articoli", valore: articoli(f) }] : [])]}
      className={evidenzia?.(f) ? "border-warning/50 bg-warning/10" : undefined}
      footer={<><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="text-xs font-medium text-warning">Da controllare: senza articoli</span>}<BadgeFornitore fornitore={f} />{badgeCliente(f)}</>} />)}</ElencoSchede>
    <div className="hidden md:block">
      <table className="w-full table-fixed text-xs">
        <colgroup>{larghezze.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead className="bg-navy text-navy-foreground"><tr>
          {s && <th scope="col" className="px-2 py-3"><Checkbox aria-label={s.tutti.etichetta ?? "Seleziona tutti"} className="border-navy-foreground" checked={stato} disabled={s.tutti.disabled} onCheckedChange={() => s.tutti.onChange(!s.tutti.tutti)} /></th>}
          {colonne.map(t => <th scope="col" key={t} className="break-words px-2 py-3 text-left font-semibold">{t}</th>)}
        </tr></thead>
        <tbody>{rows.map(f => <tr key={f.id} className={`cursor-pointer border-b hover:bg-muted/50 ${evidenzia?.(f) ? "bg-warning/10" : s?.selezionati.has(f.id) ? "bg-primary/5" : ""}`} onClick={() => apri(f.id)}>
          {s && <td className="px-2 py-3" onClick={e => e.stopPropagation()}><Checkbox aria-label={`Seleziona ${f.ragione_sociale ?? "fornitore"}`} checked={s.selezionati.has(f.id)} onCheckedChange={v => s.cambia(f.id, v === true)} /></td>}
          <td className="break-words px-2 py-3 font-mono">{f.codice_gestionale ?? "—"}</td>
          <td className="break-words px-2 py-3"><Link to="/fornitori/$id" params={{ id: f.id }} className="font-semibold text-primary hover:underline" onClick={e => e.stopPropagation()}>{f.ragione_sociale}</Link>{f.convenzionato && <span className="ml-1.5 inline-block align-middle"><BadgeConvenzionato /></span>}{f.alias && <p className="mt-1 text-muted-foreground">{f.alias}</p>}<BadgeFornitore fornitore={f} /></td>
          <td className="break-words px-2 py-3">{citta(f)}</td>
          <td className="break-words px-2 py-3 tabular-nums">{f.partita_iva || "—"}</td>
          <td className="px-2 py-3"><BadgeTipoFornitore tipo={f.tipo_effettivo} fonte={f.tipo_fonte} />{evidenzia?.(f) && <span className="mt-1 block text-[11px] font-medium text-warning">Da controllare</span>}</td>
          <td className="break-words px-2 py-3">{f.condizione_pagamento_desc || "—"}</td>
          <td className="px-2 py-3">{email(f)}</td>
          {mostraArticoli && <td className="px-2 py-3">{articoli(f)}</td>}
          <td className="px-2 py-3">{f.anche_cliente ? <Badge variant="outline" className="whitespace-normal border-success/30 bg-success/10 px-1.5 text-[11px] text-success">Sì</Badge> : <span className="text-muted-foreground">—</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}
