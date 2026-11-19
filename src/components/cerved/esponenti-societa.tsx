import type { EsponenteCerved, SocietaCollegataCerved } from "@/lib/cerved/cerved.server";
import { nomeEsponenteCerved, raggruppaSocietaCerved, sintesiCollegatiCerved, statoSocietaCerved, stessoSettoreCerved, testoRuoloCerved } from "@/lib/cerved-collegati";
import { dataIsoIt, formattaEuroCompatto } from "@/lib/cerved-presentazione";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function EsponentiSocietaCerved({ esponenti = [], societa = [], persone = [], atecoCliente, pagina = false }: { pagina?: boolean; esponenti?: EsponenteCerved[]; societa?: SocietaCollegataCerved[]; persone?: Record<string, unknown>[]; atecoCliente?: string | null }) {
  if (!esponenti.length && !societa.length) return null;
  const gruppi = raggruppaSocietaCerved(societa, esponenti);
  return <section aria-label="Esponenti e società collegate">
    <Card className="rounded-md border-l-4 border-l-primary"><CardContent className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">Esponenti e società collegate</h3>
      {societa.length > 0 && <p className="text-sm leading-relaxed">{sintesiCollegatiCerved(esponenti,societa,persone)}</p>}
      {esponenti.length > 0 && <div><h4 className="mb-2 text-sm font-semibold">Esponenti</h4><ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">{esponenti.map((e,i)=><li key={`${e.id_persona}-${i}`} className="min-w-0 space-y-1 text-sm"><p className="break-words font-semibold">{nomeEsponenteCerved(e) || "Nome non indicato"}</p>{e.codice_fiscale && <p className="break-words text-xs text-muted-foreground">{e.codice_fiscale}</p>}{e.data_nascita && <p className="text-xs text-muted-foreground">Nato il {dataIsoIt(e.data_nascita)}{e.luogo_nascita ? ` a ${e.luogo_nascita}` : ""}</p>}{e.ruoli.map((r,j)=>{const v=testoRuoloCerved(r);return <p key={j} className="break-words">{v.testo} · <span className={v.inCorso ? "font-semibold text-success" : "text-muted-foreground"}>{v.stato}</span></p>;})}</li>)}</ul></div>}
      {gruppi.length > 0 && <div><h4 className="mb-2 text-sm font-semibold">Società collegate</h4><ul className={pagina ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" : "divide-y divide-border"}>
        {gruppi.map((g,i)=>{
          const s=g.societa, stato=statoSocietaCerved(s);
          const forma=s.forma_codice === "DI" ? "Impresa individuale" : s.forma_descrizione ?? s.forma_giuridica;
          const bilancio=(tag:"fatturato"|"utile")=>{const v=s[tag];if(v?.valore==null)return null;const importo=v.valuta === "EURO" ? formattaEuroCompatto(Math.abs(v.valore)) : `${Math.abs(v.valore).toLocaleString("it-IT")} ${v.valuta ?? ""}`.trim();return `${tag === "fatturato" ? "Fatturato" : v.valore < 0 ? "Perdita" : "Utile"}${v.data ? ` ${v.data.slice(0,4)}` : ""}: ${importo}`;};
          const filetto=stato.tono === "rosso" || s.eventi_negativi === true ? "bg-destructive" : stato.tono === "verde" ? "bg-success" : "bg-border";
          return <li key={`${s.id_societa ?? "senza-id"}-${i}`} className={pagina ? "flex min-w-0 gap-3 rounded-sm border p-3" : "flex gap-3 py-3 first:pt-0 last:pb-0"}>
            <span aria-hidden="true" className={`w-1 shrink-0 self-stretch rounded-full ${filetto}`} />
            <div className={pagina ? "grid min-w-0 flex-1 grid-cols-1 content-start gap-2" : "grid min-w-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4"}>
              <div className="min-w-0 space-y-2">
                <div className="min-w-0"><h5 className="break-words text-sm font-semibold">{s.nome ?? "Società senza nome"}</h5>{forma && <p className="text-xs text-muted-foreground">{forma}</p>}{s.codice_fiscale && <p className="mt-1 break-words text-xs text-muted-foreground">CF {s.codice_fiscale}</p>}</div>
                <div className="flex flex-wrap gap-2"><Badge variant="outline" className={`h-auto whitespace-normal text-xs ${stato.tono === "verde" ? "text-success" : stato.tono === "rosso" ? "text-destructive" : "text-muted-foreground"}`}>{stato.testo}</Badge>{stessoSettoreCerved(atecoCliente,s.ateco_codice) && <Badge variant="outline" className="text-xs">Stesso settore</Badge>}</div>
              </div>
              <div className="min-w-0 space-y-2">
                <div className="space-y-2 text-sm">{g.legami.map((l,j)=>{const v=testoRuoloCerved(l.ruolo,s);return <p key={j} className="break-words leading-relaxed">{l.esponente ? `Tramite ${nomeEsponenteCerved(l.esponente)}: ` : l.id_esponente ? `Tramite esponente ${l.id_esponente}: ` : ""}{v.testo}<span className={`block text-xs ${v.inCorso ? "font-semibold text-success" : "text-muted-foreground"}`}>{v.stato}</span></p>;})}</div>
                {s.ateco_descrizione && <p className="break-words text-sm text-muted-foreground">{s.ateco_descrizione}</p>}
                {(bilancio("fatturato") || bilancio("utile")) && <p className="text-sm">{[bilancio("fatturato"),bilancio("utile")].filter(Boolean).join(" · ")}</p>}
                {s.eventi_negativi != null && <p className={`text-xs ${s.eventi_negativi ? "font-semibold text-destructive" : "text-muted-foreground"}`}>Eventi negativi: {s.eventi_negativi ? "Presenti" : "Nessuno"}</p>}
                {s.gruppo && <p className="break-words text-xs text-muted-foreground">Gruppo: {s.gruppo}</p>}
              </div>
            </div>
          </li>;
        })}
      </ul></div>}
    </CardContent></Card>
  </section>;
}
