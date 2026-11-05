import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { provaCercaCerved } from "@/lib/cerved/cerved-prova.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const siNo = (v: boolean | null) => (v == null ? null : v ? "Sì" : "No");

/** Data in gg/mm/aaaa; se Cerved la manda in un formato non riconosciuto, la lasciamo com'è. */
function dataIt(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "MAGENTA (MI)"; se manca uno dei due, mostra quello che c'è. */
function comuneProvincia(comune: string | null, provincia: string | null): string | null {
  if (comune && provincia) return `${comune} (${provincia})`;
  return comune || provincia || null;
}

export function ProvaCervedCard() {
  const [piva, setPiva] = useState("");
  const fn = useServerFn(provaCercaCerved);
  const m = useMutation({ mutationFn: (p: string) => fn({ data: { piva: p } }) });
  const valida = /^\d{11}$/.test(piva);
  const r = m.data;
  const a = r?.prima ?? null;

  const stato = a
    ? a.stato_attivita_descrizione
      ? a.stato_attivita_codice
        ? `${a.stato_attivita_descrizione} (${a.stato_attivita_codice})`
        : a.stato_attivita_descrizione
      : a.stato_attivita_codice
    : null;

  const forma = a ? [a.forma_giuridica, a.classe_forma_descrizione].filter(Boolean).join(" · ") || null : null;

  const ateco = a ? [a.ateco_2025_codice, a.ateco_2025_descrizione].filter(Boolean).join(" — ") || null : null;

  const rea = a ? [a.rea, a.data_iscrizione_rea && `iscrizione ${dataIt(a.data_iscrizione_rea)}`].filter(Boolean).join(" · ") || null : null;

  const sede = a?.sede
    ? [a.sede.indirizzo, a.sede.cap, [a.sede.comune, a.sede.provincia].filter(Boolean).join(" (") + (a.sede.provincia ? ")" : "")]
        .filter(Boolean)
        .join(", ") || null
    : null;

  const righe: [string, string | null][] = a
    ? [
        ["ID soggetto", a.id_soggetto],
        ["Denominazione", a.denominazione],
        ["Partita IVA", a.partita_iva],
        ["Stato attività", stato],
        ["Operativa", siNo(a.operativa)],
        ["Forma giuridica", forma],
        ["ATECO 2025", ateco],
        ["REA", rea],
        ["Sede", sede],
        ["Pubblica amministrazione", siNo(a.ente_pa)],
      ]
    : [];

  return (
    <Card className="p-4 sm:p-5 max-w-2xl">
      <h2 className="font-semibold flex items-center gap-2 mb-3"><Search className="size-4" /> Prova Cerved</h2>
      <form
        className="flex flex-col sm:flex-row sm:items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (valida) m.mutate(piva); }}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <Label htmlFor="cerved-piva">Partita IVA</Label>
          <Input id="cerved-piva" inputMode="numeric" maxLength={11} placeholder="11 cifre"
            value={piva} onChange={(e) => setPiva(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button type="submit" disabled={!valida || m.isPending} className="h-10">
          {m.isPending ? "Ricerca in corso…" : "Prova ricerca"}
        </Button>
      </form>
      {m.error && <p className="mt-3 text-sm text-destructive break-words">{m.error.message}</p>}
      {r && (
        <div className="mt-3 rounded-md border p-3 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Esito:</span>{" "}
            <span className={r.esito === "ok" ? "font-medium" : "font-medium text-destructive"}>
              {r.esito === "ok" ? "OK" : "Errore"}
            </span>
            {r.http_status != null && <span className="text-muted-foreground"> · HTTP {r.http_status}</span>}
          </p>
          {r.errore && <p className="text-destructive break-words">{r.errore}</p>}
          {r.esito === "ok" && <p><span className="text-muted-foreground">Aziende trovate:</span> {r.numero_aziende}</p>}
          {r.cliente_trovato && <p className="text-muted-foreground">Cliente presente in anagrafica: collegato al registro.</p>}
          {righe.length > 0 && (
            <dl className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pt-1">
              {righe.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  );
}
