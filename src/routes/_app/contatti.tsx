import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Star, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { NuovoContattoWizard } from "@/components/nuovo-contatto-wizard";
import { FiltriCollassabili, SchedaLista, ElencoSchede } from "@/components/lista-responsive";
import { BadgeConsensi, STATO_CONSENSI_VUOTO, useStatoConsensi } from "@/components/badge-consensi";

export const Route = createFileRoute("/_app/contatti")({
  component: ContattiPage,
});


function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}

function ContattiPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role } = useAuth();
  const isStoreManager = role === "store_manager";
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [clienteId, setClienteId] = useState("all");
  const [statoConsenso, setStatoConsenso] = useState("tutti");
  const [wizardOpen, setWizardOpen] = useState(false);

  const attiviCount = [
    search.trim() !== "",
    storeId !== "all",
    clienteId !== "all",
    statoConsenso !== "tutti",
  ].filter(Boolean).length;


  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*, clienti!inner(id, ragione_sociale, store_id, stores(nome))")
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientiOptions = useMemo(() => {
    const m = new Map<string, string>();
    (data ?? []).forEach((c: any) => {
      if (c.clienti) m.set(c.clienti.id, c.clienti.ragione_sociale);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const tuttiIds = useMemo(() => (data ?? []).map((c: any) => c.id), [data]);
  const { data: statoConsensi } = useStatoConsensi(tuttiIds);

  const filtered = useMemo(() => {
    return (data ?? []).filter((c: any) => {
      if (storeId !== "all" && c.clienti?.store_id !== storeId) return false;
      if (clienteId !== "all" && c.clienti?.id !== clienteId) return false;
      const st = statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO;
      if (statoConsenso === "trattamento" && !st.trattamento_dati) return false;
      if (statoConsenso === "whatsapp" && !st.whatsapp) return false;
      if (statoConsenso === "email" && !st.email) return false;
      if (statoConsenso === "nessuno" && (st.trattamento_dati || st.whatsapp || st.email)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${c.nome ?? ""} ${c.cognome ?? ""} ${c.email ?? ""} ${c.clienti?.ragione_sociale ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, storeId, clienteId, statoConsenso, statoConsensi]);


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="size-7 text-primary" /> Contatti
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Referenti collegati ai clienti con stato consensi privacy
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="size-4" /> Nuovo contatto
        </Button>
      </div>

      <Card className="p-4">
        <FiltriCollassabili attivi={attiviCount}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca nome, email o cliente..."
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clientiOptions.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isStoreManager && (
            <div>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Store" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli store</SelectItem>
                  {stores?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Select value={statoConsenso} onValueChange={setStatoConsenso}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i consensi</SelectItem>
                <SelectItem value="trattamento">Trattamento dati OK</SelectItem>
                <SelectItem value="whatsapp">WhatsApp attivo</SelectItem>
                <SelectItem value="email">Email attiva</SelectItem>
                <SelectItem value="nessuno">Nessun consenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        </FiltriCollassabili>
      </Card>


      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nessun contatto trovato</div>
        ) : (
          <>
          {/* Mobile: schede al posto della tabella */}
          <div className="md:hidden p-3">
          <ElencoSchede>
            {filtered.map((c: any) => (
              <SchedaLista
                key={c.id}
                onClick={() => navigate({
                  to: "/clienti/$clienteId",
                  params: { clienteId: c.clienti.id },
                  search: { tab: "contatti" },
                })}
                colonneCampi={1}
                titolo={
                  <span className="flex items-start gap-1.5">
                    {c.principale && <Star className="size-3.5 fill-accent text-accent shrink-0 mt-0.5" />}
                    <span className="min-w-0 break-words">{c.nome} {c.cognome}</span>
                  </span>
                }
                campi={[
                  {
                    etichetta: "Cliente",
                    valore: `${c.clienti?.ragione_sociale ?? "—"}${c.clienti?.stores?.nome ? ` · ${c.clienti.stores.nome}` : ""}`,
                  },
                  ...(c.ruolo ? [{ etichetta: "Ruolo", valore: c.ruolo as string }] : []),
                  { etichetta: "Email", valore: c.email ?? "—" },
                  { etichetta: "Cellulare", valore: c.cellulare ?? "—" },
                  { etichetta: "Data firma", valore: fmtDate(c.data_firma) },
                ]}
                footer={
                  <BadgeConsensi
                    compact
                    trattamentoDati={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).trattamento_dati}
                    whatsapp={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).whatsapp}
                    email={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).email}
                  />
                }
              />
            ))}
          </ElencoSchede>
          </div>


          <div className="hidden md:block">
          <Table>

            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cellulare</TableHead>
                <TableHead>Consensi</TableHead>
                <TableHead>Data firma</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({
                    to: "/clienti/$clienteId",
                    params: { clienteId: c.clienti.id },
                    search: { tab: "contatti" },
                  })}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.principale && <Star className="size-3 fill-accent text-accent" />}
                      {c.nome} {c.cognome}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.clienti?.ragione_sociale}
                    <div className="text-xs text-muted-foreground">{c.clienti?.stores?.nome ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.ruolo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cellulare ?? "—"}</TableCell>
                  <TableCell>
                    <BadgeConsensi
                      compact
                      trattamentoDati={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).trattamento_dati}
                      whatsapp={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).whatsapp}
                      email={(statoConsensi?.get(c.id) ?? STATO_CONSENSI_VUOTO).email}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(c.data_firma)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </Card>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        {wizardOpen && (
          <NuovoContattoWizard
            showClienteStep
            onClose={() => setWizardOpen(false)}
            onSuccess={() => qc.invalidateQueries({ queryKey: ["contatti-all"] })}
          />
        )}
      </Dialog>
    </div>
  );
}
