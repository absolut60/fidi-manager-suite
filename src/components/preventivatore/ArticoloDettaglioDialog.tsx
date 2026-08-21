import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  fetchArticolo,
  fetchListiniAcquisto,
  fetchListiniVendita,
} from "@/lib/articoli-api";

export function ArticoloDettaglioDialog({
  articoloId,
  open,
  onOpenChange,
}: {
  articoloId: string | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const enabled = !!articoloId && open;

  const { data: articolo, isLoading } = useQuery({
    queryKey: ["articolo", articoloId],
    queryFn: () => fetchArticolo(articoloId!),
    enabled,
  });
  const { data: listiniAcq = [] } = useQuery({
    queryKey: ["listini_acquisto", articoloId],
    queryFn: () => fetchListiniAcquisto(articoloId!),
    enabled,
  });
  const { data: listiniVen = [] } = useQuery({
    queryKey: ["listini_vendita", articoloId],
    queryFn: () => fetchListiniVendita(articoloId!),
    enabled,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-navy">
            {articolo ? (
              <span>
                <span className="font-mono">{articolo.cod_gamma ?? "—"}</span>
                {articolo.descrizione ? ` · ${articolo.descrizione}` : ""}
              </span>
            ) : (
              "Dettaglio articolo"
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !articolo ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Caricamento…</div>
        ) : (
          <div className="space-y-5 text-sm">
            <section className="rounded-md border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy">
                Dati articolo
              </h3>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-2">
                <Info label="Cod. Gamma" value={articolo.cod_gamma} mono />
                <Info label="Cod. Fornitore" value={articolo.cod_fornitore} mono />
                <Info label="Categoria" value={articolo.categoria} />
                <Info label="Tipologia" value={articolo.tipologia} />
                <Info label="U.M." value={articolo.um} />
                <Info
                  label="Peso unit."
                  value={articolo.peso_unit != null ? `${Number(articolo.peso_unit)} kg` : null}
                />
                <Info label="Fornitore" value={articolo.fornitore?.ragione_sociale} />
                <Info
                  label="Stato"
                  value={
                    articolo.stato ? <Badge variant="secondary">{articolo.stato}</Badge> : null
                  }
                />
              </div>
              {articolo.note_acquisto && (
                <div className="mt-3 border-t pt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Note acquisto
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">
                    {articolo.note_acquisto}
                  </div>
                </div>
              )}
              {articolo.note && (
                <div className="mt-2 border-t pt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Note
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground">
                    {articolo.note}
                  </div>
                </div>
              )}
            </section>


            <section className="rounded-md border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy">
                Listini vendita
              </h3>
              {listiniVen.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun listino vendita.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">Fascia</th>
                      <th className="px-2 py-1.5 text-right">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listiniVen.map((l) => (
                      <tr key={l.id} className="border-b">
                        <td className="px-2 py-1.5 font-medium">{l.fascia}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          € {Number(l.prezzo ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-md border bg-card p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy">
                Listini acquisto ({listiniAcq.length})
              </h3>
              {listiniAcq.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun listino acquisto.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5">Validità</th>
                        <th className="px-2 py-1.5 text-right">List. for.</th>
                        <th className="px-2 py-1.5 text-right">Prezzo scont.</th>
                        <th className="px-2 py-1.5 text-right">Costo netto</th>
                        <th className="px-2 py-1.5">Condizioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listiniAcq.map((l) => (
                        <tr key={l.id} className="border-b">
                          <td className="px-2 py-1.5">
                            {l.data_validita
                              ? new Date(l.data_validita).toLocaleDateString("it-IT")
                              : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {l.listino_for ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            {l.prezzo_scontato != null ? `€ ${Number(l.prezzo_scontato).toFixed(4)}` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold">
                            {l.costo_netto != null ? `€ ${Number(l.costo_netto).toFixed(4)}` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {l.condizioni ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {value || value === 0 ? value : "—"}
      </span>
    </div>
  );
}
