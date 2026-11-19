import type { EsponenteCerved, SocietaCollegataCerved } from "@/lib/cerved/cerved.server";
import { nomeEsponenteCerved, ordinaSocietaCerved, sintesiCollegatiCerved, statoSocietaCerved, stessoSettoreCerved, testoRuoloCerved } from "@/lib/cerved-collegati";
import { dataIsoIt, formattaEuroCompatto } from "@/lib/cerved-presentazione";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function EsponentiSocietaCerved({ esponenti = [], societa = [], persone = [], atecoCliente }: { esponenti?: EsponenteCerved[]; societa?: SocietaCollegataCerved[]; persone?: Record<string, unknown>[]; atecoCliente?: string | null }) {
  if (!esponenti.length && !societa.length) return null;
  return <section className="space-y-3" aria-label="Esponenti e società collegate">
    <Card className="rounded-md border-l-4 border-l-primary"><CardContent className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">Esponenti e società collegate</h3>
      {societa.length > 0 && <p className="text-sm leading-relaxed">{sintesiCollegatiCerved(esponenti,societa,persone)}</p>}
      {esponenti.length > 0 && <div><h4 className="mb-2 text-sm font-semibold">Esponenti</h4><ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">{esponenti.map((e,i)=><li key={`${e.id_persona}-${i}`} className="min-w-0 space-y-1 text-sm"><p className="break-words font-semibold">{nomeEsponenteCerved(e) || "Nome non indicato"}</p>{e.codice_fiscale && <p className="break-words text-xs text-muted-foreground">{e.codice_fiscale}</p>}{e.data_nascita && <p className="text-xs text-muted-foreground">Nato il {dataIsoIt(e.data_nascita)}{e.luogo_nascita ? ` a ${e.luogo_nascita}` : ""}</p>}{e.ruoli.map((r,j)=>{const v=testoRuoloCerved(r);return <p key={j} className="break-words">{v.testo} · <span className={v.inCorso ? "font-semibold text-success" : "text-muted-foreground"}>{v.stato}</span></p>;})}</li>)}</ul></div>}
    </CardContent></Card>
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {ordinaSocietaCerved(societa).map((s,i)=>{
        const stato=statoSocietaCerved(s), e=esponenti.find(e=>e.id_persona===s.id_esponente);
        const forma=s.forma_codice === "DI" ? "Impresa individuale" : s.forma_descrizione ?? s.forma_giuridica;
        const bilancio=(tag:"fatturato"|"utile")=>{const v=s[tag];if(v?.valore==null)return null;const importo=v.valuta === "EURO" ? formattaEuroCompatto(Math.abs(v.valore)) : `${Math.abs(v.valore).toLocaleString("it-IT")} ${v.valuta ?? ""}`.trim();return `${tag === "fatturato" ? "Fatturato" : v.valore < 0 ? "Perdita" : "Utile"}${v.data ? ` ${v.data.slice(0,4)}` : ""}: ${importo}`;};
        return <Card key={`${s.id_societa}-${s.id_esponente}-${i}`} className={`min-w-0 rounded-md border-l-4 ${stato.tono === "rosso" || s.eventi_negativi === true ? "border-l-destructive" : stato.tono === "verde" ? "border-l-success" : "border-l-border"}`}><CardContent className="space-y-3 p-4">
          <div className="min-w-0"><h4 className="break-words text-sm font-semibold">{s.nome ?? "Società senza nome"}</h4>{forma && <p className="text-xs text-muted-foreground">{forma}</p>}{s.codice_fiscale && <p className="mt-1 break-words text-xs text-muted-foreground">CF {s.codice_fiscale}</p>}</div>
          <div className="flex flex-wrap gap-2"><Badge variant="outline" className={`h-auto whitespace-normal text-xs ${stato.tono === "verde" ? "text-success" : stato.tono === "rosso" ? "text-destructive" : "text-muted-foreground"}`}>{stato.testo}</Badge>{stessoSettoreCerved(atecoCliente,s.ateco_codice) && <Badge variant="outline" className="text-xs">Stesso settore</Badge>}</div>
          <div className="space-y-2 text-sm">{s.ruoli.map((r,j)=>{const v=testoRuoloCerved(r,s);return <p key={j} className="break-words leading-relaxed">{e ? `Tramite ${nomeEsponenteCerved(e)}: ` : s.id_esponente ? `Tramite esponente ${s.id_esponente}: ` : ""}{v.testo}<span className={`block text-xs ${v.inCorso ? "font-semibold text-success" : "text-muted-foreground"}`}>{v.stato}</span></p>;})}</div>
          {s.ateco_descrizione && <p className="break-words text-sm text-muted-foreground">{s.ateco_descrizione}</p>}
          {(bilancio("fatturato") || bilancio("utile")) && <p className="text-sm">{[bilancio("fatturato"),bilancio("utile")].filter(Boolean).join(" · ")}</p>}
          {s.eventi_negativi != null && <p className={`text-xs ${s.eventi_negativi ? "font-semibold text-destructive" : "text-muted-foreground"}`}>Eventi negativi: {s.eventi_negativi ? "Presenti" : "Nessuno"}</p>}
          {s.gruppo && <p className="break-words text-xs text-muted-foreground">Gruppo: {s.gruppo}</p>}
        </CardContent></Card>;
      })}
    </div>
  </section>;
}