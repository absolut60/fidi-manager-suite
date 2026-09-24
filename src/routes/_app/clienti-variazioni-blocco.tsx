import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";

export const Route = createFileRoute("/_app/clienti-variazioni-blocco")({
  component: ClientiVariazioniBloccoPage,
});

const PER_PAGE = 50;

type VariazioneRow = {
  id: string;
  cliente_id: string;
  store_id: string | null;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tipo: string | null;
  rilevato_at: string | null;
  stores: { nome: string | null } | null;
};

function fmtDataOra(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(String(v));
    const data = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
    const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    return `${data} ${ora}`;
  } catch {
    return String(v);
  }
}

function BadgeVariazione({ tipo }: { tipo: string | null }) {
  if (tipo === "bloccato") return <Badge variant="destructive">Bloccato</Badge>;
  if (tipo === "sbloccato") return <Badge className="bg-emerald-600/15 text-emerald-700">Sbloccato</Badge>;
  return <Badge variant="outline">{tipo ?? "—"}</Badge>;
}

function ClientiVariazioniBloccoPage() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<"tutte" | "bloccato" | "sbloccato">("tutte");
  const [search, setSearch] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [pagina, setPagina] = useState(0);

  // Ricerca con debounce: aggiorna la query lato server solo dopo una pausa
  useEffect(() => {
    const t = setTimeout(() => {
      setQApplied(search.trim());
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const attiviCount = [
    tipo !== "tutte",
    qApplied !== "",
    storeId !== "all",
  ].filter(Boolean).length;

  // Negozi presenti nei dati visibili (scoped dalle RLS): il filtro Negozio
  // compare solo se compaiono più negozi (per uno store manager non serve).
  const { data: negozi } = useQuery({
    queryKey: ["clienti-variazioni-blocco-negozi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clienti_blocco_variazioni")
        .select("store_id, stores(nome)");
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        if (r.store_id && r.stores?.nome) m.set(r.store_id, r.stores.nome);
      });
      return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    },
  });
  const showStoreFilter = (negozi?.length ?? 0) > 1;

  const { data, isLoading } = useQuery({
    queryKey: ["clienti-variazioni-blocco", tipo, qApplied, storeId, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("clienti_blocco_variazioni")
        .select("id, cliente_id, store_id, codice_gestionale, ragione_sociale, tipo, rilevato_at, stores(nome)", { count: "exact" })
        .order("rilevato_at", { ascending: false })
        .range(pagina * PER_PAGE, pagina * PER_PAGE + PER_PAGE - 1);
      if (tipo !== "tutte") q = q.eq("tipo", tipo);
      if (storeId !== "all") q = q.eq("store_id", storeId);
      if (qApplied) {
        q = q.or(`codice_gestionale.ilike.%${qApplied}%,ragione_sociale.ilike.%${qApplied}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { righe: (data ?? []) as VariazioneRow[], totale: count ?? 0 };
    },
  });

  const righe = data?.righe ?? [];
  const totale = data?.totale ?? 0;
  const totalePagine = Math.max(1, Math.ceil(totale / PER_PAGE));

  const vaiACliente = (clienteId: string) =>
    navigate({ to: "/clienti/$clienteId", params: { clienteId } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="size-7 text-primary" /> Variazioni blocco clienti
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clienti che dopo l'ultimo import dal gestionale sono passati a bloccato o sono stati sbloccati.
        </p>
      </div>

      <Card className="p-4">
        <FiltriCollassabili attivi={attiviCount}>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] sm:flex-none sm:w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca codice o ragione sociale..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full sm:w-44">
              <Select value={tipo} onValueChange={(v) => { setTipo(v as typeof tipo); setPagina(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutte">Tutte le variazioni</SelectItem>
                  <SelectItem value="bloccato">Bloccati</SelectItem>
                  <SelectItem value="sbloccato">Sbloccati</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showStoreFilter && (
              <div className="w-full sm:w-52">
                <Select value={storeId} onValueChange={(v) => { setStoreId(v); setPagina(0); }}>
                  <SelectTrigger><SelectValue placeholder="Negozio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i negozi</SelectItem>
                    {(negozi ?? []).map(([id, nome]) => (
                      <SelectItem key={id} value={id}>{nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </FiltriCollassabili>
        <p className="text-sm text-muted-foreground mt-2">
          {totale === 1 ? "1 variazione" : `${totale} variazioni`}
        </p>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : righe.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nessuna variazione registrata. Le variazioni vengono rilevate a ogni import dei blocchi dal gestionale.
          </div>
        ) : (
          <>
            {/* Mobile: schede al posto della tabella */}
            <div className="md:hidden p-3">
              <ElencoSchede>
                {righe.map((r) => (
                  <SchedaLista
                    key={r.id}
                    onClick={() => vaiACliente(r.cliente_id)}
                    colonneCampi={1}
                    titolo={r.ragione_sociale ?? "—"}
                    campi={[
                      { etichetta: "Codice", valore: r.codice_gestionale ?? "—" },
                      { etichetta: "Negozio", valore: r.stores?.nome ?? "—" },
                      { etichetta: "Data rilevamento", valore: fmtDataOra(r.rilevato_at) },
                    ]}
                    footer={<BadgeVariazione tipo={r.tipo} />}
                  />
                ))}
              </ElencoSchede>
            </div>

            {/* Desktop: tabella */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data rilevamento</TableHead>
                    <TableHead>Negozio</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Ragione sociale</TableHead>
                    <TableHead>Variazione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righe.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => vaiACliente(r.cliente_id)}
                    >
                      <TableCell className="whitespace-nowrap">{fmtDataOra(r.rilevato_at)}</TableCell>
                      <TableCell>{r.stores?.nome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.codice_gestionale ?? "—"}</TableCell>
                      <TableCell className="font-medium min-w-0 break-words">{r.ragione_sociale ?? "—"}</TableCell>
                      <TableCell><BadgeVariazione tipo={r.tipo} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totale > PER_PAGE && (
              <div className="flex items-center justify-between gap-2 p-3 border-t">
                <Button
                  variant="outline" size="sm" className="min-h-10"
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                >
                  Precedente
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {pagina + 1} di {totalePagine}
                </span>
                <Button
                  variant="outline" size="sm" className="min-h-10"
                  disabled={(pagina + 1) * PER_PAGE >= totale}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Successiva
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
