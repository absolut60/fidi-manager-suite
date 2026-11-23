// FM99 fetta 3: parti visive della pagina Riconciliazione lead → clienti.
// Componenti senza dati propri: permessi, collegamenti e azioni arrivano dalla pagina,
// così le regole di visibilità dei pulsanti sono verificabili nei test.
import type { ReactNode } from "react";
import { Link2, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ElencoSchede, SchedaLista } from "@/components/lista-responsive";
import {
  LEAD_RICONCILIAZIONE_ESITO_CLASS, LEAD_RICONCILIAZIONE_ESITO_LABEL, formatData,
} from "@/lib/lead-costanti";
import {
  candidatiRiga, corrispondenzaRiconciliazione, dataRiga, origineRiconciliazione, rigaAnnullabile,
  type CandidatoRiconciliazione, type RigaRiconciliazione,
} from "@/lib/lead-riconciliazione";

export type LinkEntita = (id: string, testo: ReactNode) => ReactNode;

export function PulsanteControllaOra({ isAdmin, inCorso, onClick }: { isAdmin: boolean; inCorso: boolean; onClick: () => void }) {
  if (!isAdmin) return null;
  return (
    <Button variant="outline" size="sm" className="min-h-10 gap-1.5 w-full sm:w-auto" disabled={inCorso} onClick={onClick}>
      {inCorso ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      Controlla ora
    </Button>
  );
}

const testo = (v: string | null | undefined) => (v && v.trim() ? v : "—");

export function SchedaDaRiconciliare({
  riga, puoCollegare, linkLead, linkCliente, onCollega, inCorso = false,
}: {
  riga: RigaRiconciliazione;
  puoCollegare: boolean;
  linkLead: LinkEntita;
  linkCliente: LinkEntita;
  onCollega: (c: CandidatoRiconciliazione) => void;
  inCorso?: boolean;
}) {
  const candidati = candidatiRiga(riga.candidati);
  return (
    <Card className="min-w-0 border-l-4 border-l-amber-500">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <div className="break-words text-base font-semibold">{linkLead(riga.lead_id, testo(riga.nome_lead))}</div>
            <div className="mt-0.5 text-xs text-muted-foreground break-words">
              P.IVA {testo(riga.lead_partita_iva)} · C.F. {testo(riga.lead_codice_fiscale)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            {formatData(riga.creato_il)} · {origineRiconciliazione(riga)}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Clienti possibili ({candidati.length})</div>
          <ul className="divide-y rounded-md border">
            {candidati.map((c) => (
              <li key={c.id} className="grid grid-cols-1 gap-2 p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="break-words font-medium">{linkCliente(c.id, testo(c.ragione_sociale))}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    Codice Gamma {testo(c.codice_gestionale)} · P.IVA {testo(c.partita_iva)} · C.F. {testo(c.codice_fiscale)}
                  </div>
                </div>
                {puoCollegare && (
                  <Button size="sm" variant="outline" className="min-h-10 gap-1.5 justify-self-start sm:justify-self-end" disabled={inCorso} onClick={() => onCollega(c)}>
                    <Link2 className="size-4" /> Collega
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

const BORDO_ESITO: Record<RigaRiconciliazione["esito"], string> = {
  collegato_auto: "border-l-emerald-500",
  collegato_manuale: "border-l-blue-500",
  da_riconciliare: "border-l-amber-500",
  annullato: "border-l-muted-foreground/40",
};

export function EsitoBadge({ esito }: { esito: RigaRiconciliazione["esito"] }) {
  return <Badge variant="outline" className={`shrink-0 ${LEAD_RICONCILIAZIONE_ESITO_CLASS[esito]}`}>{LEAD_RICONCILIAZIONE_ESITO_LABEL[esito]}</Badge>;
}

function PulsanteAnnulla({ riga, onAnnulla, inCorso }: { riga: RigaRiconciliazione; onAnnulla: (r: RigaRiconciliazione) => void; inCorso: boolean }) {
  const etichetta = `Annulla collegamento di ${riga.nome_lead ?? "lead"}`;
  return (
    <Button size="icon" variant="ghost" className="h-10 w-10" title="Annulla collegamento" aria-label={etichetta} disabled={inCorso} onClick={() => onAnnulla(riga)}>
      <Undo2 className="size-4" />
    </Button>
  );
}

export function ElencoRiconciliati({
  righe, isAdmin, nomeOperatore, linkLead, linkCliente, onAnnulla, inCorso = false, finoA = "lg",
}: {
  righe: RigaRiconciliazione[];
  isAdmin: boolean;
  nomeOperatore: (id: string | null) => string;
  linkLead: LinkEntita;
  linkCliente: LinkEntita;
  onAnnulla: (r: RigaRiconciliazione) => void;
  inCorso?: boolean;
  finoA?: "md" | "lg";
}) {
  const cliente = (r: RigaRiconciliazione) =>
    r.cliente_id ? (
      <span className="min-w-0 break-words">
        {linkCliente(r.cliente_id, testo(r.cliente_ragione_sociale))}
        {r.cliente_codice && <span className="block text-xs text-muted-foreground">{r.cliente_codice}</span>}
      </span>
    ) : (
      <span className="break-words">{testo(r.cliente_ragione_sociale)}{r.cliente_codice ? ` (${r.cliente_codice})` : ""}</span>
    );
  return (
    <>
      <ElencoSchede finoA={finoA}>
        {righe.map((r) => (
          <SchedaLista
            key={r.id}
            className={`border-l-4 ${BORDO_ESITO[r.esito]}`}
            titolo={linkLead(r.lead_id, testo(r.nome_lead))}
            badge={<EsitoBadge esito={r.esito} />}
            campi={[
              { etichetta: "Cliente", valore: cliente(r) },
              { etichetta: "Corrispondenza", valore: corrispondenzaRiconciliazione(r) },
              { etichetta: "Data", valore: formatData(dataRiga(r)) },
              { etichetta: "Origine", valore: origineRiconciliazione(r) },
              { etichetta: "Operatore", valore: nomeOperatore(r.risolto_da ?? r.operatore_id) },
              ...(r.nota ? [{ etichetta: "Nota", valore: <span className="break-words text-xs">{r.nota}</span> }] : []),
            ]}
            footer={isAdmin && rigaAnnullabile(r.esito) ? <PulsanteAnnulla riga={r} onAnnulla={onAnnulla} inCorso={inCorso} /> : undefined}
          />
        ))}
      </ElencoSchede>
      <div className={finoA === "lg" ? "hidden lg:block" : "hidden md:block"}>
        <Table className="table-fixed text-sm [&_td]:align-top">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[88px]">Data</TableHead>
              <TableHead className="w-[150px]">Esito</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[140px]">Corrispondenza</TableHead>
              <TableHead className="w-[120px]">Origine</TableHead>
              <TableHead className="w-[110px]">Operatore</TableHead>
              <TableHead className="w-[52px]"><span className="sr-only">Azioni</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {righe.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-normal">{formatData(dataRiga(r))}</TableCell>
                <TableCell className="whitespace-normal"><EsitoBadge esito={r.esito} /></TableCell>
                <TableCell className="whitespace-normal break-words">
                  {linkLead(r.lead_id, testo(r.nome_lead))}
                  {r.nota && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={r.nota}>{r.nota}</div>}
                </TableCell>
                <TableCell className="whitespace-normal">{cliente(r)}</TableCell>
                <TableCell className="whitespace-normal break-words">{corrispondenzaRiconciliazione(r)}</TableCell>
                <TableCell className="whitespace-normal break-words">{origineRiconciliazione(r)}</TableCell>
                <TableCell className="whitespace-normal break-words">{nomeOperatore(r.risolto_da ?? r.operatore_id)}</TableCell>
                <TableCell className="whitespace-normal">
                  {isAdmin && rigaAnnullabile(r.esito) && <PulsanteAnnulla riga={r} onAnnulla={onAnnulla} inCorso={inCorso} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
