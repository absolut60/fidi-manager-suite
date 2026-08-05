import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, X, Link2, UserPlus, Trash2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Alternativa = {
  tipo?: string | null;
  etichetta?: string | null;
  criterio?: string | null;
  privacy_firmata?: boolean | null;
};

type RigaImport = {
  id: string;
  riga_numero: number | null;
  nome: string | null;
  cognome: string | null;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  telefono: string | null;
  cellulare: string | null;
  note: string | null;
  match_tipo: string | null;
  match_id: string | null;
  match_contatto_id: string | null;
  match_criterio: string | null;
  match_privacy_firmata: boolean | null;
  match_alternative: Alternativa[] | null;
  stato: string;
};

type Filtro = "tutte" | "con_match" | "senza_match" | "lavorate";

const ETICHETTA_CRITERIO: Record<string, string> = {
  email: "email",
  partita_iva: "P.IVA",
  codice_fiscale: "cod. fiscale",
  nome: "nome",
};

const ETICHETTA_STATO: Record<string, string> = {
  collegato: "Collegato",
  lead_creato: "Lead creato",
  scartato: "Scartato",
};

function descrizione(r: RigaImport): string {
  const persona = [r.nome, r.cognome].filter(Boolean).join(" ").trim();
  return r.ragione_sociale || persona || r.email || "—";
}

function normalizza(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function RiconciliaImportCard({ eventoId }: { eventoId: string }) {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [ricerca, setRicerca] = useState("");
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [confermaScarta, setConfermaScarta] = useState(false);

  const { data: righe = [] } = useQuery({
    queryKey: ["evento-import-righe", eventoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi_import_righe")
        .select("*")
        .eq("evento_id", eventoId)
        .order("riga_numero", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RigaImport[];
    },
  });

  const inSospeso = righe.filter((r) => r.stato === "in_sospeso");

  const filtrate = useMemo(() => {
    const q = normalizza(ricerca.trim());
    return righe.filter((r) => {
      const haMatch = r.match_tipo !== null && r.match_tipo !== "nessuno" && !!r.match_id;
      if (filtro === "lavorate" && r.stato === "in_sospeso") return false;
      if (filtro !== "lavorate" && r.stato !== "in_sospeso") return false;
      if (filtro === "con_match" && !haMatch) return false;
      if (filtro === "senza_match" && haMatch) return false;
      if (!q) return true;
      const testo = normalizza(
        [r.nome, r.cognome, r.ragione_sociale, r.email, r.partita_iva, r.codice_fiscale]
          .filter(Boolean)
          .join(" "),
      );
      return testo.includes(q);
    });
  }, [righe, filtro, ricerca]);

  const selezionabili = filtrate.filter((r) => r.stato === "in_sospeso");
  const selezionate = righe.filter((r) => selezione.has(r.id) && r.stato === "in_sospeso");
  const conMatch = selezionate.filter(
    (r) => r.match_tipo && r.match_tipo !== "nessuno" && r.match_id,
  );

  const dopoAzione = (messaggio: string) => {
    toast.success(messaggio);
    setSelezione(new Set());
    queryClient.invalidateQueries({ queryKey: ["evento-import-righe", eventoId] });
    queryClient.invalidateQueries({ queryKey: ["evento", eventoId] });
    queryClient.invalidateQueries({ queryKey: ["eventi-partecipanti", eventoId] });
    queryClient.invalidateQueries({ queryKey: ["partecipanti", eventoId] });
  };

  const collega = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("collega_righe_import", { _riga_ids: ids });
      if (error) throw error;
      return (data as unknown as Array<{ collegate: number; saltate: number }>)[0];
    },
    onSuccess: (r) =>
      dopoAzione(
        `${r?.collegate ?? 0} collegate · ${r?.saltate ?? 0} saltate perché già presenti o senza corrispondenza`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const creaLead = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("crea_lead_da_righe_import", { _riga_ids: ids });
      if (error) throw error;
      return (data as unknown as Array<{ creati: number; saltate: number }>)[0];
    },
    onSuccess: (r) => dopoAzione(`${r?.creati ?? 0} lead creati · ${r?.saltate ?? 0} saltate`),
    onError: (e: Error) => toast.error(e.message),
  });

  const scarta = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("scarta_righe_import", { _riga_ids: ids });
      if (error) throw error;
      return (data as unknown as Array<{ scartate: number }>)[0];
    },
    onSuccess: (r) => dopoAzione(`${r?.scartate ?? 0} righe scartate`),
    onError: (e: Error) => toast.error(e.message),
  });

  // La sezione compare solo se c'è qualcosa da riconciliare
  if (!inSospeso.length && !righe.length) return null;
  if (!inSospeso.length && filtro !== "lavorate" && !righe.length) return null;
  if (!inSospeso.length && !righe.some((r) => r.stato !== "in_sospeso")) return null;

  const inCorso = collega.isPending || creaLead.isPending || scarta.isPending;

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Righe importate da riconciliare</h2>
        <p className="text-sm text-muted-foreground">
          {inSospeso.length} righe in sospeso: collegale ai soggetti già presenti, creane di nuove
          come lead oppure scartale.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca per nome, azienda, email, P.IVA…"
            className="pl-9"
          />
          {ricerca && (
            <button
              type="button"
              onClick={() => setRicerca("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Azzera ricerca"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["tutte", "Tutte"],
              ["con_match", "Con corrispondenza"],
              ["senza_match", "Senza corrispondenza"],
              ["lavorate", "Già lavorate"],
            ] as Array<[Filtro, string]>
          ).map(([valore, etichetta]) => (
            <Button
              key={valore}
              size="sm"
              variant={filtro === valore ? "default" : "outline"}
              onClick={() => setFiltro(valore)}
            >
              {etichetta}
            </Button>
          ))}
        </div>
      </div>

      {selezionate.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 p-2">
          <span className="text-sm font-medium">{selezionate.length} selezionate</span>
          <Button
            size="sm"
            disabled={conMatch.length === 0 || inCorso}
            onClick={() => collega.mutate(selezionate.map((r) => r.id))}
          >
            <Link2 className="size-4 mr-2" /> Collega ai soggetti trovati
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={inCorso}
            onClick={() => creaLead.mutate(selezionate.map((r) => r.id))}
          >
            <UserPlus className="size-4 mr-2" /> Crea nuovi lead
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={inCorso}
            onClick={() => setConfermaScarta(true)}
          >
            <Trash2 className="size-4 mr-2" /> Scarta
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-10 py-2">
                <Checkbox
                  checked={
                    selezionabili.length > 0 &&
                    selezionabili.every((r) => selezione.has(r.id))
                  }
                  disabled={selezionabili.length === 0}
                  onCheckedChange={(v) => {
                    const next = new Set(selezione);
                    for (const r of selezionabili) {
                      if (v) next.add(r.id);
                      else next.delete(r.id);
                    }
                    setSelezione(next);
                  }}
                  aria-label="Seleziona tutte le righe filtrate"
                />
              </th>
              <th className="py-2 pr-3">Soggetto</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">P.IVA</th>
              <th className="py-2 pr-3">Corrisponde a</th>
              <th className="py-2">Stato</th>
            </tr>
          </thead>
          <tbody>
            {filtrate.map((r) => {
              const haMatch = !!r.match_tipo && r.match_tipo !== "nessuno" && !!r.match_id;
              const alternative = Array.isArray(r.match_alternative) ? r.match_alternative : [];
              return (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="py-2">
                    <Checkbox
                      checked={selezione.has(r.id)}
                      disabled={r.stato !== "in_sospeso"}
                      onCheckedChange={(v) => {
                        const next = new Set(selezione);
                        if (v) next.add(r.id);
                        else next.delete(r.id);
                        setSelezione(next);
                      }}
                      aria-label={`Seleziona ${descrizione(r)}`}
                    />
                  </td>
                  <td className="py-2 pr-3 font-medium">{descrizione(r)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.partita_iva ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {haMatch ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{r.match_tipo === "cliente" ? "Cliente" : r.match_tipo === "lead" ? "Lead" : "Contatto"}</span>
                        {r.match_criterio && (
                          <Badge variant="secondary">
                            {ETICHETTA_CRITERIO[r.match_criterio] ?? r.match_criterio}
                          </Badge>
                        )}
                        {r.match_privacy_firmata && <Badge>privacy già firmata</Badge>}
                        {alternative.length > 0 && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                              >
                                <Info className="size-3" />
                                {alternative.length} alternative
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 text-sm space-y-1">
                              {alternative.map((a, i) => (
                                <div key={i} className="flex items-center justify-between gap-2">
                                  <span className="truncate">{a.etichetta ?? a.tipo ?? "—"}</span>
                                  {a.criterio && (
                                    <Badge variant="outline">
                                      {ETICHETTA_CRITERIO[a.criterio] ?? a.criterio}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">— nessuna corrispondenza</span>
                    )}
                  </td>
                  <td className="py-2">
                    {r.stato === "in_sospeso" ? (
                      <Badge variant="outline">In sospeso</Badge>
                    ) : (
                      <Badge variant="secondary">{ETICHETTA_STATO[r.stato] ?? r.stato}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrate.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nessuna riga con questi filtri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confermaScarta} onOpenChange={setConfermaScarta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scartare {selezionate.length} righe?</AlertDialogTitle>
            <AlertDialogDescription>
              Le righe restano consultabili sotto il filtro "Già lavorate", ma non potranno più
              essere collegate o trasformate in lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => scarta.mutate(selezionate.map((r) => r.id))}>
              Scarta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
