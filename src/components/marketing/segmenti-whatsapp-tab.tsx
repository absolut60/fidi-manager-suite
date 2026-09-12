import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MACROCATEGORIE, CATEGORIE } from "@/lib/macrocategorie";
import { MARKETING_ROLES } from "@/lib/ruoli-marketing";
import {
  aggiungiDestinatariWhatsappCampagna,
  type DestinatarioWhatsappInput,
} from "@/lib/campagne-destinatari-whatsapp";

type SemaforoValue = "tutti" | "rosso" | "arancione" | "giallo" | "verde";

/** Sottoinsieme dei filtri email che ha senso per il canale WhatsApp. */
type FiltriWa = {
  storeFiltro: string;
  filtroAgente: string;
  macrocategoria: string;
  categoria: string;
  semaforo: SemaforoValue;
  filtroBlocco: "tutti" | "bloccati" | "non_bloccati";
  filtroTipoSoggetto: "tutti" | "fisica" | "giuridica";
  fatturato: "tutti" | "nessuno" | "0_10k" | "10k_50k" | "50k_100k" | "oltre_100k";
  citta: string;
  provincia: string;
  ricerca: string;
};

const FILTRI_WA_DEFAULT: FiltriWa = {
  storeFiltro: "tutti",
  filtroAgente: "tutti",
  macrocategoria: "tutti",
  categoria: "tutti",
  semaforo: "tutti",
  filtroBlocco: "tutti",
  filtroTipoSoggetto: "giuridica",
  fatturato: "tutti",
  citta: "",
  provincia: "",
  ricerca: "",
};

type PersonaWa = {
  contatto_id: string;
  cliente_id: string | null;
  ragione_sociale: string | null;
  nome: string | null;
  cognome: string | null;
  cellulare: string | null;
  cellulare_valido: boolean;
  consenso_whatsapp: boolean;
  contattabile: boolean;
};

const PAGE_SIZE = 100;

function nomePersona(p: PersonaWa): string {
  return [p.nome, p.cognome].filter(Boolean).join(" ").trim();
}

export function SegmentiWhatsappTab() {
  const { roles, loading, user } = useAuth();
  const qc = useQueryClient();
  const canSee = useMemo(
    () => (roles as string[]).some((r) => MARKETING_ROLES.has(r)),
    [roles],
  );

  const [filtri, setFiltri] = useState<FiltriWa>(FILTRI_WA_DEFAULT);
  const [ricercaInput, setRicercaInput] = useState("");
  const [soloContattabili, setSoloContattabili] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [campagnaWaId, setCampagnaWaId] = useState<string | undefined>(undefined);

  // Debounce ricerca, come nella pagina email
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltri((p) => (p.ricerca === ricercaInput ? p : { ...p, ricerca: ricercaInput }));
    }, 300);
    return () => clearTimeout(t);
  }, [ricercaInput]);

  useEffect(() => {
    setPagina(1);
    setSelezionati(new Set());
  }, [filtri, soloContattabili]);

  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agenti").select("codice, descrizione").order("descrizione");
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });

  // La RPC condivide la logica del pubblico con il canale email: i campi non
  // pertinenti a WhatsApp vanno passati al valore neutro.
  const filtriRpc = useMemo(
    () => ({
      ...filtri,
      filtroConsenso: "tutti",
      filtroEmail: "tutti",
      filtroDisiscritti: "tutti",
    }),
    [filtri],
  );
  const filtriKey = useMemo(() => JSON.stringify(filtriRpc), [filtriRpc]);

  const { data: persone, isLoading } = useQuery({
    queryKey: ["persone-whatsapp-segmento", filtriKey, soloContattabili],
    enabled: canSee,
    staleTime: 30_000,
    queryFn: async () => {
      // Volumi oggi piccolissimi, ma il limite PostgREST è 1000 righe:
      // si pagina a blocchi di 1000 finché il blocco è pieno.
      const all: PersonaWa[] = [];
      let off = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .rpc("elenco_persone_whatsapp_segmento", {
            _filtri: JSON.parse(filtriKey),
            _solo_contattabili: soloContattabili,
          } as never)
          .range(off, off + size - 1);
        if (error) throw error;
        const batch = (data ?? []) as PersonaWa[];
        all.push(...batch);
        if (batch.length < size) break;
        off += size;
      }
      return all;
    },
  });

  const righe = persone ?? [];
  const totale = righe.length;
  const totaleContattabili = useMemo(() => righe.filter((r) => r.contattabile).length, [righe]);
  const totalePagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const paginaCorrente = Math.min(pagina, totalePagine);
  const righePagina = righe.slice((paginaCorrente - 1) * PAGE_SIZE, paginaCorrente * PAGE_SIZE);

  const selezionateRighe = useMemo(
    () => righe.filter((r) => selezionati.has(r.contatto_id)),
    [righe, selezionati],
  );
  const selezionateContattabili = useMemo(
    () => selezionateRighe.filter((r) => r.contattabile),
    [selezionateRighe],
  );
  const nonContattabiliSel = selezionateRighe.length - selezionateContattabili.length;

  const tuttiInPagina = righePagina.length > 0 && righePagina.every((r) => selezionati.has(r.contatto_id));

  function togglePersona(id: string, on: boolean) {
    setSelezionati((p) => {
      const n = new Set(p);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  function toggleTuttiInPagina(on: boolean) {
    setSelezionati((p) => {
      const n = new Set(p);
      for (const r of righePagina) {
        if (on) n.add(r.contatto_id); else n.delete(r.contatto_id);
      }
      return n;
    });
  }

  const campagneWaQuery = useQuery({
    queryKey: ["campagne-whatsapp", "selector"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_whatsapp")
        .select("id, nome, stato")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; stato: string }>;
    },
  });
  const campagneWa = campagneWaQuery.data;

  const aggiungi = useMutation({
    mutationFn: async () => {
      if (!campagnaWaId) throw new Error("Scegli prima una campagna WhatsApp");
      const lista: DestinatarioWhatsappInput[] = selezionateContattabili.map((r) => ({
        contatto_id: r.contatto_id,
        cliente_id: r.cliente_id,
        numero_dest: String(r.cellulare ?? ""),
        nome_riferimento: nomePersona(r) || r.ragione_sociale,
      }));
      if (lista.length === 0) throw new Error("Nessuna persona contattabile tra quelle selezionate");
      return aggiungiDestinatariWhatsappCampagna(campagnaWaId, lista, user?.id ?? null);
    },
    onSuccess: (r) => {
      toast.success(`Aggiunti ${r.aggiunti} destinatari WhatsApp, ${r.saltati} già presenti saltati`);
      setSelezionati(new Set());
      setCampagnaWaId(undefined);
      qc.invalidateQueries({ queryKey: ["messaggi-whatsapp"] });
    },
    onError: (e: any) => {
      const dettagli = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" — ");
      toast.error(dettagli || "Errore aggiunta destinatari WhatsApp", { duration: 10000 });
    },
  });

  if (loading) return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  if (!canSee) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="md:col-span-2 lg:col-span-4">
            <Label className="text-xs">Cerca cliente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cerca per ragione sociale…"
                value={ricercaInput}
                onChange={(e) => setRicercaInput(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Punto vendita</Label>
            <Select value={filtri.storeFiltro} onValueChange={(v) => setFiltri((p) => ({ ...p, storeFiltro: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli store</SelectItem>
                {(stores ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agente</Label>
            <Select value={filtri.filtroAgente} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroAgente: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                <SelectItem value="__none__">Senza agente</SelectItem>
                {(agenti ?? []).map((a) => (
                  <SelectItem key={a.codice} value={a.codice}>{a.descrizione}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Macrocategoria</Label>
            <Select value={filtri.macrocategoria} onValueChange={(v) => setFiltri((p) => ({ ...p, macrocategoria: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte</SelectItem>
                {MACROCATEGORIE.map((m) => (
                  <SelectItem key={m.codice} value={m.codice}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={filtri.categoria} onValueChange={(v) => setFiltri((p) => ({ ...p, categoria: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte</SelectItem>
                {CATEGORIE.map((c) => (
                  <SelectItem key={c.codice} value={c.codice}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Semaforo rischio</Label>
            <Select value={filtri.semaforo} onValueChange={(v) => setFiltri((p) => ({ ...p, semaforo: v as SemaforoValue }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="verde">Verde — regolari</SelectItem>
                <SelectItem value="giallo">Giallo — scaduto</SelectItem>
                <SelectItem value="arancione">Arancione — fido quasi esaurito</SelectItem>
                <SelectItem value="rosso">Rosso — critici</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Stato blocco</Label>
            <Select value={filtri.filtroBlocco} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroBlocco: v as FiltriWa["filtroBlocco"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="bloccati">Bloccati</SelectItem>
                <SelectItem value="non_bloccati">Non bloccati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo soggetto</Label>
            <Select value={filtri.filtroTipoSoggetto} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroTipoSoggetto: v as FiltriWa["filtroTipoSoggetto"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="giuridica">Solo imprese</SelectItem>
                <SelectItem value="fisica">Solo privati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fatturato</Label>
            <Select value={filtri.fatturato} onValueChange={(v) => setFiltri((p) => ({ ...p, fatturato: v as FiltriWa["fatturato"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="nessuno">Nessun fatturato</SelectItem>
                <SelectItem value="0_10k">0 — 10k €</SelectItem>
                <SelectItem value="10k_50k">10k — 50k €</SelectItem>
                <SelectItem value="50k_100k">50k — 100k €</SelectItem>
                <SelectItem value="oltre_100k">Oltre 100k €</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Città</Label>
            <Input value={filtri.citta} onChange={(e) => setFiltri((p) => ({ ...p, citta: e.target.value }))} placeholder="Es. Milano" />
          </div>
          <div>
            <Label className="text-xs">Provincia</Label>
            <Input value={filtri.provincia} onChange={(e) => setFiltri((p) => ({ ...p, provincia: e.target.value }))} placeholder="Es. MI" />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="solo-contattabili-wa"
                checked={soloContattabili}
                onCheckedChange={setSoloContattabili}
              />
              <Label htmlFor="solo-contattabili-wa" className="text-xs">
                Solo contattabili su WhatsApp
              </Label>
            </div>
          </div>
        </div>
      </Card>

      {/* Conteggio */}
      <Card className="p-4 flex items-center gap-3 bg-[#25D366]/5 border-[#25D366]/30">
        <Users className="size-6 text-[#25D366]" />
        <div>
          <div className="text-2xl font-semibold">
            {isLoading ? "…" : totale.toLocaleString("it-IT")}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              person{totale === 1 ? "a corrisponde" : "e corrispondono"} ai filtri
            </span>
          </div>
          {!soloContattabili && (
            <div className="text-xs text-muted-foreground">
              di cui {totaleContattabili.toLocaleString("it-IT")} contattabil
              {totaleContattabili === 1 ? "e" : "i"} su WhatsApp
            </div>
          )}
        </div>
      </Card>

      {/* Barra selezione */}
      {selezionati.size > 0 && (
        <Card className="p-4 flex flex-wrap items-center gap-3 border-[#25D366]/40 bg-[#25D366]/5">
          <div className="text-sm">
            <span className="font-semibold">{selezionateRighe.length.toLocaleString("it-IT")}</span> person
            {selezionateRighe.length === 1 ? "a selezionata" : "e selezionate"} — di cui{" "}
            <span className="font-semibold">{selezionateContattabili.length.toLocaleString("it-IT")}</span>{" "}
            contattabili su WhatsApp
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={campagnaWaId} onValueChange={setCampagnaWaId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Scegli campagna WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                {campagneWaQuery.isPending ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Caricamento campagne…</div>
                ) : !(campagneWa ?? []).length ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nessuna campagna WhatsApp — creane una in Campagne › WhatsApp
                  </div>
                ) : (
                  (campagneWa ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.stato === "pronta" ? "✅ " : "✏️ "}{c.nome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={() => aggiungi.mutate()}
              disabled={!campagnaWaId || selezionateContattabili.length === 0 || aggiungi.isPending}
              title={!campagnaWaId ? "Scegli prima una campagna WhatsApp" : "Aggiungi le persone contattabili alla campagna"}
            >
              {aggiungi.isPending
                ? <Loader2 className="size-4 mr-2 animate-spin" />
                : <Send className="size-4 mr-2" />}
              Aggiungi alla campagna
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelezionati(new Set())}>
              Azzera selezione
            </Button>
          </div>
          {nonContattabiliSel > 0 && (
            <div className="w-full text-xs text-muted-foreground">
              {nonContattabiliSel.toLocaleString("it-IT")} selezionat
              {nonContattabiliSel === 1 ? "o non contattabile sarà ignorato" : "i non contattabili saranno ignorati"}.
            </div>
          )}
        </Card>
      )}

      {/* Elenco persone */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="text-xs text-muted-foreground">
            Una riga per persona: il messaggio WhatsApp arriva al cellulare del contatto.
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={totale === 0}
            onClick={() => setSelezionati(new Set(righe.map((r) => r.contatto_id)))}
          >
            Seleziona tutto il risultato
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={tuttiInPagina}
                  onCheckedChange={(v) => toggleTuttiInPagina(!!v)}
                  aria-label="Seleziona tutte le persone in pagina"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Azienda</TableHead>
              <TableHead>Cellulare</TableHead>
              <TableHead className="text-center">WhatsApp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                Caricamento...
              </TableCell></TableRow>
            )}
            {!isLoading && righePagina.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-center py-6">
                Nessuna persona corrisponde ai filtri
              </TableCell></TableRow>
            )}
            {!isLoading && righePagina.map((p) => (
              <TableRow key={p.contatto_id}>
                <TableCell>
                  <Checkbox
                    checked={selezionati.has(p.contatto_id)}
                    onCheckedChange={(v) => togglePersona(p.contatto_id, !!v)}
                    aria-label={`Seleziona ${nomePersona(p) || p.ragione_sociale || "persona"}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{nomePersona(p) || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.ragione_sociale || "—"}</TableCell>
                <TableCell className="text-sm">{p.cellulare || "—"}</TableCell>
                <TableCell className="text-center">
                  {p.contattabile ? (
                    <Badge variant="outline" className="border-success text-success gap-1">
                      <MessageCircle className="size-3" /> Contattabile
                    </Badge>
                  ) : !p.cellulare_valido ? (
                    <Badge variant="outline" className="text-muted-foreground">No cellulare</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">No consenso</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totale > PAGE_SIZE && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <div className="text-xs text-muted-foreground">
              Pagina {paginaCorrente} di {totalePagine}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={paginaCorrente <= 1} onClick={() => setPagina(1)}>
                Prima
              </Button>
              <Button variant="outline" size="sm" disabled={paginaCorrente <= 1} onClick={() => setPagina(paginaCorrente - 1)}>
                Precedente
              </Button>
              <Button variant="outline" size="sm" disabled={paginaCorrente >= totalePagine} onClick={() => setPagina(paginaCorrente + 1)}>
                Successiva
              </Button>
              <Button variant="outline" size="sm" disabled={paginaCorrente >= totalePagine} onClick={() => setPagina(totalePagine)}>
                Ultima
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
