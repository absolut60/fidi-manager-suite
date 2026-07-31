import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Save, Users, Mail, MailX, Trash2, RefreshCw,
  ChevronRight, ChevronDown, Send, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isEmailValida } from "@/lib/email-validazione";
import { CONSENSO_LABEL } from "@/lib/consensi-testi";
import { MACROCATEGORIE, CATEGORIE } from "@/lib/macrocategorie";
import {
  aggiungiDestinatariCampagna,
  type DestinatarioCampagnaInput,
} from "@/lib/campagne-destinatari";

export const Route = createFileRoute("/_app/marketing/segmenti")({
  component: MarketingSegmentiPage,
});

const MARKETING_ROLES = new Set(["amministratore", "amministrazione", "direzione"]);

// Stato filtri — stessi nomi/valori usati nella pagina Clienti (fonte unica),
// serializzabile su segmenti_marketing.filtri (jsonb).
type SemaforoValue = "tutti" | "rosso" | "arancione" | "giallo" | "verde";
type ConsensoFiltro = "tutti" | "marketing_diretto" | "marketing_media" | "profilazione";

const CONSENSO_COLONNA: Record<Exclude<ConsensoFiltro, "tutti">, string> = {
  marketing_diretto: "consenso_marketing_diretto",
  marketing_media: "consenso_marketing_media",
  profilazione: "consenso_profilazione",
};

type Filtri = {
  storeFiltro: string;                 // "tutti" | store_id
  filtroAgente: string;                // "tutti" | "__none__" | codice_agente
  macrocategoria: string;              // "tutti" | codice
  categoria: string;                   // "tutti" | codice
  semaforo: SemaforoValue;
  filtroBlocco: "tutti" | "bloccati" | "non_bloccati";
  filtroTipoSoggetto: "tutti" | "fisica" | "giuridica";
  fatturato: "tutti" | "nessuno" | "0_10k" | "10k_50k" | "50k_100k" | "oltre_100k";
  filtroConsenso: ConsensoFiltro;      // almeno un contatto con quel consenso attivo
  citta: string;
  provincia: string;
};
const TAB_ELENCO = "elenco";
const TAB_SALVATI = "salvati";

const FILTRI_DEFAULT: Filtri = {
  storeFiltro: "tutti",
  filtroAgente: "tutti",
  macrocategoria: "tutti",
  categoria: "tutti",
  semaforo: "tutti",
  filtroBlocco: "tutti",
  filtroTipoSoggetto: "giuridica",
  fatturato: "tutti",
  filtroConsenso: "tutti",
  citta: "",
  provincia: "",
};

type ContattoRiga = {
  id: string;
  cliente_id: string;
  nome: string;
  cognome: string | null;
  email: string | null;
  consenso_marketing_diretto: boolean;
  consenso_marketing_media: boolean;
  consenso_profilazione: boolean;
};

type ListaStatica = { id: string; nome: string; ids: string[] };

const CHUNK = 200;
// Limite oltre il quale la lista di id viene interrogata a blocchi (limiti URL/PostgREST)
const CHUNK_IDS = 400;
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function calcSemaforo(c: {
  fido_residuo?: number | null;
  fido_gestionale?: number | null;
  scaduto?: number | null;
}): "rosso" | "arancione" | "giallo" | "verde" {
  const residuo = c.fido_residuo == null ? null : Number(c.fido_residuo);
  const fidoGest = c.fido_gestionale == null ? null : Number(c.fido_gestionale);
  const scaduto = c.scaduto == null ? null : Number(c.scaduto);
  if (residuo != null && residuo < 0) return "rosso";
  if (residuo != null && fidoGest != null && fidoGest > 0 && residuo < fidoGest * 0.1) return "arancione";
  if (scaduto != null && scaduto > 0) return "giallo";
  return "verde";
}

function MarketingSegmentiPage() {
  const { roles, loading, user } = useAuth();
  const qc = useQueryClient();
  const canSee = useMemo(
    () => (roles as string[]).some((r) => MARKETING_ROLES.has(r)),
    [roles],
  );

  const [filtri, setFiltri] = useState<Filtri>(FILTRI_DEFAULT);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tab, setTab] = useState(TAB_ELENCO);
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [tipoSalvataggio, setTipoSalvataggio] = useState<"dinamico" | "statico">("dinamico");
  const [listaStatica, setListaStatica] = useState<ListaStatica | null>(null);
  // Evita che il reset-selezione legato al cambio filtri cancelli la lista appena caricata
  const skipResetSelezione = useRef(false);

  // === Lookup ===
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

  // === Mappa semaforo per filtro client-side ===
  const { data: classifList } = useQuery({
    queryKey: ["clienti-classificazione-marketing"],
    queryFn: async () => {
      const all: any[] = [];
      let offset = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("clienti")
          .select("id, fido_residuo, fido_gestionale, scaduto")
          .range(offset, offset + size - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < size) break;
        offset += size;
      }
      return all;
    },
    staleTime: 60_000,
    enabled: canSee,
  });

  const semaforoIds = useMemo<string[] | null>(() => {
    if (filtri.semaforo === "tutti" || !classifList) return null;
    return classifList
      .filter((c: any) => calcSemaforo(c) === filtri.semaforo)
      .map((c: any) => c.id);
  }, [classifList, filtri.semaforo]);

  // === Fatturato (fasce) ===
  const annoCorrente = useMemo(() => new Date().getFullYear(), []);
  const { data: fatturatoIds } = useQuery({
    queryKey: ["fatturato-ids-marketing", filtri.fatturato, annoCorrente],
    enabled: canSee && filtri.fatturato !== "tutti",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatturato_clienti")
        .select("cliente_id, fatturato")
        .eq("anno", annoCorrente);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ cliente_id: string | null; fatturato: number | null }>;
      const map = new Map<string, number>();
      for (const r of rows) if (r.cliente_id) map.set(r.cliente_id, Number(r.fatturato) || 0);
      if (filtri.fatturato === "nessuno") {
        // TUTTI gli id NON presenti nella mappa
        const all: string[] = [];
        let off = 0;
        const size = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: cli, error: e2 } = await supabase
            .from("clienti").select("id").range(off, off + size - 1);
          if (e2) throw e2;
          const batch = (cli ?? []) as Array<{ id: string }>;
          for (const c of batch) if (!map.has(c.id)) all.push(c.id);
          if (batch.length < size) break;
          off += size;
        }
        return all;
      }
      const inRange = (v: number) => {
        if (filtri.fatturato === "0_10k") return v > 0 && v <= 10000;
        if (filtri.fatturato === "10k_50k") return v > 10000 && v <= 50000;
        if (filtri.fatturato === "50k_100k") return v > 50000 && v <= 100000;
        if (filtri.fatturato === "oltre_100k") return v > 100000;
        return false;
      };
      const ids: string[] = [];
      for (const [id, v] of map) if (inRange(v)) ids.push(id);
      return ids;
    },
  });

  // === Filtro consenso: clienti con ALMENO UN contatto col consenso attivo ===
  const { data: consensoIds } = useQuery({
    queryKey: ["consenso-ids-marketing", filtri.filtroConsenso],
    enabled: canSee && filtri.filtroConsenso !== "tutti",
    staleTime: 60_000,
    queryFn: async () => {
      const col = CONSENSO_COLONNA[filtri.filtroConsenso as Exclude<ConsensoFiltro, "tutti">];
      const ids = new Set<string>();
      let off = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("contatti")
          .select("cliente_id")
          .eq(col as any, true)
          .range(off, off + size - 1);
        if (error) throw error;
        const batch = (data ?? []) as Array<{ cliente_id: string }>;
        for (const r of batch) if (r.cliente_id) ids.add(r.cliente_id);
        if (batch.length < size) break;
        off += size;
      }
      return Array.from(ids);
    },
  });

  // Intersezione id-filter set (semaforo ∩ fatturato ∩ consenso ∩ lista statica)
  const includeIds = useMemo<string[] | null>(() => {
    const sources: string[][] = [];
    if (semaforoIds) sources.push(semaforoIds);
    if (fatturatoIds) sources.push(fatturatoIds);
    if (consensoIds) sources.push(consensoIds);
    if (listaStatica) sources.push(listaStatica.ids);
    if (sources.length === 0) return null;
    const sets = sources.map((s) => new Set(s));
    return sources[0].filter((id) => sets.every((s) => s.has(id)));
  }, [semaforoIds, fatturatoIds, consensoIds, listaStatica]);

  // === Query builder — allineato a src/routes/_app/clienti.tsx (fonte unica) ===
  function buildQuery(select: string, count: "exact" | undefined, idsSubset?: string[]) {
    let q = supabase.from("clienti").select(select, count ? { count } : undefined);
    // Solo clienti anagraficamente attivi (default coerente con clienti.tsx)
    q = q.eq("attivo", true);
    if (filtri.storeFiltro !== "tutti") q = q.eq("store_id", filtri.storeFiltro);
    if (filtri.filtroAgente === "__none__") q = q.is("codice_agente", null);
    else if (filtri.filtroAgente !== "tutti") q = q.eq("codice_agente", filtri.filtroAgente);
    if (filtri.macrocategoria !== "tutti") q = q.eq("codice_macrocategoria", filtri.macrocategoria);
    if (filtri.categoria !== "tutti") q = q.eq("codice_categoria", filtri.categoria);
    if (filtri.filtroBlocco === "bloccati") q = q.eq("bloccato", true);
    else if (filtri.filtroBlocco === "non_bloccati") q = q.eq("bloccato", false);
    if (filtri.filtroTipoSoggetto === "fisica") q = q.eq("tipo_soggetto", "persona_fisica");
    else if (filtri.filtroTipoSoggetto === "giuridica") q = q.eq("tipo_soggetto", "azienda");
    if (filtri.citta.trim()) q = q.ilike("citta", `%${filtri.citta.trim()}%`);
    if (filtri.provincia.trim()) q = q.ilike("provincia", `%${filtri.provincia.trim()}%`);
    if (includeIds) {
      if (includeIds.length === 0) return { empty: true as const };
      q = q.in("id", idsSubset ?? includeIds);
    }
    q = q.order("ragione_sociale", { ascending: true, nullsFirst: false });
    return { q };
  }

  const classifReady = filtri.semaforo === "tutti" || !!classifList;
  const fatturatoReady = filtri.fatturato === "tutti" || !!fatturatoIds;
  const consensoReady = filtri.filtroConsenso === "tutti" || !!consensoIds;

  // === Conteggio segmento + lista paginata (100 per pagina) ===
  const PAGE_SIZE = 100;
  const [pagina, setPagina] = useState(1);
  const SELECT_LISTA = "id, ragione_sociale, email, citta, provincia, categoria, agente, codice_agente";
  const { data: segmento, isLoading } = useQuery({
    queryKey: ["marketing-segmento", filtri, includeIds?.length ?? null, listaStatica?.id ?? null, pagina],
    enabled: canSee && classifReady && fatturatoReady && consensoReady,
    queryFn: async () => {
      // Liste id molto lunghe: interroga a blocchi e pagina in memoria
      if (includeIds && includeIds.length > CHUNK_IDS) {
        const all: any[] = [];
        for (const part of chunkArray(includeIds, CHUNK_IDS)) {
          const b = buildQuery(SELECT_LISTA, undefined, part);
          if ("empty" in b) continue;
          const { data, error } = await b.q.range(0, 9999);
          if (error) throw error;
          all.push(...((data ?? []) as any[]));
        }
        all.sort((a, b) =>
          String(a.ragione_sociale ?? "").localeCompare(String(b.ragione_sociale ?? ""), "it"),
        );
        return {
          rows: all.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE),
          count: all.length,
        };
      }
      const built = buildQuery(SELECT_LISTA, "exact");
      if ("empty" in built) return { rows: [] as any[], count: 0 };
      const { data, error, count } = await built.q.range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });

  const rows = segmento?.rows ?? [];
  const totale = segmento?.count ?? 0;
  const totalePagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const daRiga = totale === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1;
  const aRiga = Math.min(pagina * PAGE_SIZE, totale);

  // === Contatti dei clienti visibili (righe espandibili + indicatore email) ===
  const rowsKey = rows.map((r) => r.id).sort().join(",");
  const { data: contattiMap } = useQuery({
    queryKey: ["marketing-contatti-map", rowsKey],
    enabled: rows.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const ids = rows.map((r) => r.id);
      const map = new Map<string, ContattoRiga[]>();
      for (const part of chunkArray(ids, CHUNK)) {
        const { data, error } = await supabase
          .from("contatti")
          .select("id, cliente_id, nome, cognome, email, consenso_marketing_diretto, consenso_marketing_media, consenso_profilazione")
          .in("cliente_id", part);
        if (error) throw error;
        for (const c of (data ?? []) as ContattoRiga[]) {
          const arr = map.get(c.cliente_id) ?? [];
          arr.push(c);
          map.set(c.cliente_id, arr);
        }
      }
      return map;
    },
  });

  // === Selezione destinatari ===
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [espansi, setEspansi] = useState<Set<string>>(new Set());
  const [contattiEsclusi, setContattiEsclusi] = useState<Set<string>>(new Set());
  const [aziendaliEsclusi, setAziendaliEsclusi] = useState<Set<string>>(new Set());
  const [caricamentoTutti, setCaricamentoTutti] = useState(false);
  const [campagnaId, setCampagnaId] = useState<string | undefined>(undefined);

  // Reset selezione e pagina quando cambiano i filtri (NON al cambio pagina).
  // Saltato quando il cambio filtri deriva dal caricamento di una lista statica.
  useEffect(() => {
    if (skipResetSelezione.current) {
      skipResetSelezione.current = false;
      return;
    }
    setSelezionati(new Set());
    setContattiEsclusi(new Set());
    setAziendaliEsclusi(new Set());
    setPagina(1);
  }, [filtri]);

  function vaiAPagina(p: number) {
    setPagina(Math.min(Math.max(1, p), totalePagine));
    setEspansi(new Set());
  }

  function toggleCliente(id: string, on: boolean) {
    setSelezionati((p) => {
      const n = new Set(p);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  function toggleEspanso(id: string) {
    setEspansi((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function selezionaTutti() {
    setCaricamentoTutti(true);
    try {
      const ids: string[] = [];
      if (includeIds && includeIds.length > CHUNK_IDS) {
        for (const part of chunkArray(includeIds, CHUNK_IDS)) {
          const b = buildQuery("id", undefined, part);
          if ("empty" in b) continue;
          const { data, error } = await b.q.range(0, 9999);
          if (error) throw error;
          ids.push(...((data ?? []) as unknown as Array<{ id: string }>).map((b2) => b2.id));
        }
      } else {
        let off = 0;
        const size = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const rebuilt = buildQuery("id", undefined);
          if ("empty" in rebuilt) break;
          const { data, error } = await rebuilt.q.range(off, off + size - 1);
          if (error) throw error;
          const batch = (data ?? []) as unknown as Array<{ id: string }>;
          ids.push(...batch.map((b) => b.id));
          if (batch.length < size) break;
          off += size;
        }
      }
      setSelezionati(new Set(ids));
      setContattiEsclusi(new Set());
      setAziendaliEsclusi(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Errore nel caricamento dell'intero segmento");
    } finally {
      setCaricamentoTutti(false);
    }
  }

  // Contatti + email aziendali dei clienti SELEZIONATI (per il conteggio destinatari)
  const selezionatiIds = useMemo(() => Array.from(selezionati).sort(), [selezionati]);
  const { data: destinatariRaw } = useQuery({
    queryKey: ["marketing-destinatari", selezionatiIds.length, selezionatiIds.join(",").slice(0, 2000)],
    enabled: selezionatiIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const aziendali = new Map<string, string | null>();
      const ragioniSociali = new Map<string, string>();
      const contatti: ContattoRiga[] = [];
      for (const part of chunkArray(selezionatiIds, CHUNK)) {
        const [{ data: cli, error: e1 }, { data: cont, error: e2 }] = await Promise.all([
          supabase.from("clienti").select("id, email, ragione_sociale").in("id", part),
          supabase
            .from("contatti")
            .select("id, cliente_id, nome, cognome, email, consenso_marketing_diretto, consenso_marketing_media, consenso_profilazione")
            .in("cliente_id", part),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        for (const c of (cli ?? []) as Array<{ id: string; email: string | null; ragione_sociale: string }>) {
          aziendali.set(c.id, c.email);
          ragioniSociali.set(c.id, c.ragione_sociale);
        }
        contatti.push(...((cont ?? []) as ContattoRiga[]));
      }
      return { aziendali, ragioniSociali, contatti };
    },
  });

  const totaleDestinatari = useMemo(() => {
    if (!destinatariRaw) return 0;
    let n = 0;
    for (const [id, email] of destinatariRaw.aziendali) {
      if (!aziendaliEsclusi.has(id) && isEmailValida(email)) n += 1;
    }
    for (const c of destinatariRaw.contatti) {
      if (!contattiEsclusi.has(c.id) && isEmailValida(c.email)) n += 1;
    }
    return n;
  }, [destinatariRaw, aziendaliEsclusi, contattiEsclusi]);

  // === Aggiunta destinatari alla campagna (carrello persistente, nessun invio) ===
  const aggiungiDestinatari = useMutation({
    mutationFn: async () => {
      if (!campagnaId) throw new Error("Scegli prima una campagna");
      if (!destinatariRaw) throw new Error("Destinatari non ancora caricati");

      const lista: DestinatarioCampagnaInput[] = [];
      for (const [id, email] of destinatariRaw.aziendali) {
        if (aziendaliEsclusi.has(id) || !isEmailValida(email)) continue;
        lista.push({
          cliente_id: id,
          contatto_id: null,
          tipo_destinatario: "aziendale",
          email: email as string,
          nome_riferimento: destinatariRaw.ragioniSociali.get(id) ?? null,
        });
      }
      for (const c of destinatariRaw.contatti) {
        if (contattiEsclusi.has(c.id) || !isEmailValida(c.email)) continue;
        lista.push({
          cliente_id: c.cliente_id,
          contatto_id: c.id,
          tipo_destinatario: "contatto",
          email: c.email as string,
          nome_riferimento: [c.nome, c.cognome].filter(Boolean).join(" ") || null,
        });
      }
      if (lista.length === 0) throw new Error("Nessun destinatario valido selezionato");
      return aggiungiDestinatariCampagna(campagnaId, lista, user?.id ?? null);
    },
    onSuccess: (r) => {
      toast.success(
        `Aggiunti ${r.aggiunti} nuovi destinatari, ${r.saltati} già presenti saltati` +
          (r.scartati ? `, ${r.scartati} scartati (email non valida)` : ""),
      );
      setSelezionati(new Set());
      setContattiEsclusi(new Set());
      setAziendaliEsclusi(new Set());
      setCampagnaId(undefined);
      qc.invalidateQueries({ queryKey: ["campagne-email-destinatari"] });

    },
    onError: (e: any) => {
      // eslint-disable-next-line no-console
      console.error("[segmenti] errore aggiunta destinatari", e);
      const dettagli = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" — ");
      toast.error(dettagli || "Errore aggiunta destinatari", { duration: 10000 });
    },
  });

  // === Campagne disponibili (solo scelta, nessun invio in questo strato) ===
  const campagneQuery = useQuery({
    queryKey: ["campagne-email-marketing", "selector"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .select("id, nome, stato, oggetto")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as Array<{ id: string; nome: string; stato: string; oggetto: string }>;
      const peso = (s: string) => (s === "pronta" ? 0 : s === "bozza" ? 1 : 2);
      return [...list].sort((a, b) => peso(a.stato) - peso(b.stato));
    },
  });
  const campagne = campagneQuery.data;
  // Con una query "pending" (mai risolta / disabilitata) NON si deve mostrare
  // lo stato "nessuna campagna": si distingue caricamento da lista vuota.
  const campagneLoading = campagneQuery.isPending;
  const campagneError = campagneQuery.error;


  // === Segmenti salvati ===
  const { data: segmentiSalvati } = useQuery({
    queryKey: ["segmenti-marketing"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segmenti_marketing")
        .select("id, nome, descrizione, filtri, tipo, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; nome: string; descrizione: string | null;
        filtri: Filtri; tipo: string | null; created_at: string;
      }>;
    },
  });

  // Conteggio clienti congelati per segmento statico (query aggregata unica)
  const { data: conteggiStatici } = useQuery({
    queryKey: ["segmenti-marketing-conteggi"],
    enabled: canSee,
    queryFn: async () => {
      const map = new Map<string, number>();
      let off = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("segmenti_marketing_clienti")
          .select("segmento_id")
          .range(off, off + size - 1);
        if (error) throw error;
        const batch = (data ?? []) as Array<{ segmento_id: string }>;
        for (const r of batch) map.set(r.segmento_id, (map.get(r.segmento_id) ?? 0) + 1);
        if (batch.length < size) break;
        off += size;
      }
      return map;
    },
  });

  const salvaSegmento = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Il nome del segmento è obbligatorio");
      const statico = tipoSalvataggio === "statico";
      if (statico && selezionati.size === 0) {
        throw new Error("Seleziona prima dei clienti nell'elenco");
      }
      const { data, error } = await supabase
        .from("segmenti_marketing")
        .insert({
          nome: nome.trim(),
          descrizione: descrizione.trim() || null,
          filtri: filtri as any,
          tipo: statico ? "statico" : "dinamico",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (statico) {
        const ids = Array.from(selezionati);
        for (const part of chunkArray(ids, 500)) {
          const { error: e2 } = await supabase
            .from("segmenti_marketing_clienti")
            .insert(part.map((cid) => ({ segmento_id: data.id, cliente_id: cid })));
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      toast.success("Segmento salvato");
      setSaveOpen(false);
      setNome("");
      setDescrizione("");
      setTipoSalvataggio("dinamico");
      qc.invalidateQueries({ queryKey: ["segmenti-marketing"] });
      qc.invalidateQueries({ queryKey: ["segmenti-marketing-conteggi"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore nel salvataggio"),
  });

  const eliminaSegmento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segmenti_marketing").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segmento eliminato");
      qc.invalidateQueries({ queryKey: ["segmenti-marketing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore nell'eliminazione"),
  });

  function caricaSegmento(f: Filtri | string | null) {
    // jsonb può arrivare come stringa in alcuni casi: parse difensivo
    let parsed: Partial<Filtri> = {};
    if (typeof f === "string") {
      try {
        parsed = JSON.parse(f) as Partial<Filtri>;
      } catch {
        toast.error("Filtri del segmento non validi");
        return;
      }
    } else if (f && typeof f === "object") {
      parsed = f;
    }
    // Merge con i default per essere robusti a salvataggi vecchi/parziali
    setFiltri({ ...FILTRI_DEFAULT, ...parsed });
    setPagina(1);
    setTab(TAB_ELENCO);
    toast.info("Filtri del segmento caricati");
  }

  useEffect(() => {
    // no-op — reset esplicito solo da bottone
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  }
  if (!canSee) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="size-6 text-[#c94f8f]" />
            Segmenti Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filtra l'anagrafica clienti in gruppi target. I segmenti salvano i
            criteri, non l'elenco: restano sempre aggiornati.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFiltri(FILTRI_DEFAULT)}>
            <RefreshCw className="size-4 mr-2" /> Azzera filtri
          </Button>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button>
                <Save className="size-4 mr-2" /> Salva segmento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Salva segmento</DialogTitle>
                <DialogDescription>
                  Verranno salvati i criteri correnti; il segmento resta aggiornato al variare dell'anagrafica.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Imprese Lombardia con scaduto" />
                </div>
                <div>
                  <Label>Descrizione</Label>
                  <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveOpen(false)}>Annulla</Button>
                <Button onClick={() => salvaSegmento.mutate()} disabled={salvaSegmento.isPending || !nome.trim()}>
                  Salva
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtri */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <Select value={filtri.filtroBlocco} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroBlocco: v as Filtri["filtroBlocco"] }))}>
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
            <Select value={filtri.filtroTipoSoggetto} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroTipoSoggetto: v as Filtri["filtroTipoSoggetto"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="giuridica">Solo imprese</SelectItem>
                <SelectItem value="fisica">Solo privati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fatturato {annoCorrente}</Label>
            <Select value={filtri.fatturato} onValueChange={(v) => setFiltri((p) => ({ ...p, fatturato: v as Filtri["fatturato"] }))}>
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
            <Label className="text-xs">Consenso marketing</Label>
            <Select
              value={filtri.filtroConsenso}
              onValueChange={(v) => setFiltri((p) => ({ ...p, filtroConsenso: v as ConsensoFiltro }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="marketing_diretto">Con {CONSENSO_LABEL.marketing_diretto}</SelectItem>
                <SelectItem value="marketing_media">Con {CONSENSO_LABEL.marketing_media}</SelectItem>
                <SelectItem value="profilazione">Con {CONSENSO_LABEL.profilazione}</SelectItem>
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
        </div>
      </Card>

      {/* Conteggio */}
      <Card className="p-4 flex items-center gap-3 bg-[#c94f8f]/5 border-[#c94f8f]/30">
        <Users className="size-6 text-[#c94f8f]" />
        <div>
          <div className="text-2xl font-semibold">
            {isLoading ? "…" : totale.toLocaleString("it-IT")}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              client{totale === 1 ? "e" : "i"} corrispondono a questi filtri
            </span>
          </div>
          {totale > 0 && (
            <div className="text-xs text-muted-foreground">
              Mostrati {daRiga.toLocaleString("it-IT")}–{aRiga.toLocaleString("it-IT")} di{" "}
              {totale.toLocaleString("it-IT")} · Pagina {pagina} di {totalePagine}
            </div>
          )}
        </div>
      </Card>

      {/* Barra selezione destinatari */}
      {selezionati.size > 0 && (
        <Card className="p-4 flex flex-wrap items-center gap-3 border-[#c94f8f]/40 bg-[#c94f8f]/5">
          <div className="text-sm">
            <span className="font-semibold">{selezionati.size.toLocaleString("it-IT")}</span> client
            {selezionati.size === 1 ? "e" : "i"} selezionat{selezionati.size === 1 ? "o" : "i"} —{" "}
            <span className="font-semibold">{totaleDestinatari.toLocaleString("it-IT")}</span> destinatari totali
            <span className="text-muted-foreground"> (email aziendali + contatti)</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Select value={campagnaId} onValueChange={setCampagnaId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Scegli campagna" />
              </SelectTrigger>
              <SelectContent>
                {campagneLoading ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Caricamento campagne…</div>
                ) : campagneError ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Errore nel caricamento delle campagne
                    {(campagneError as any)?.message ? ` — ${(campagneError as any).message}` : ""}
                  </div>
                ) : !(campagne ?? []).length ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nessuna campagna disponibile — creane una in Campagne email
                  </div>
                ) : (
                  (campagne ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.stato === "pronta" ? "✅ " : "✏️ "}{c.nome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={() => aggiungiDestinatari.mutate()}
              disabled={!campagnaId || totaleDestinatari === 0 || aggiungiDestinatari.isPending}
              title={!campagnaId ? "Scegli prima una campagna" : "Aggiungi i destinatari selezionati alla campagna"}
            >

              {aggiungiDestinatari.isPending
                ? <Loader2 className="size-4 mr-2 animate-spin" />
                : <Send className="size-4 mr-2" />}
              Aggiungi alla campagna
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelezionati(new Set())}>
              Azzera selezione
            </Button>
          </div>
          {campagneError ? (
            <div className="w-full text-xs text-destructive">
              Impossibile caricare le campagne
              {(campagneError as any)?.message ? `: ${(campagneError as any).message}` : ""}
            </div>
          ) : !campagneLoading && !(campagne ?? []).length ? (
            <div className="w-full text-xs text-destructive">
              Nessuna campagna disponibile: creane una nella pagina «Campagne email».
            </div>
          ) : null}
          <div className="w-full text-xs text-muted-foreground">
            I destinatari vengono salvati nella campagna (senza doppioni) e puoi aggiungerne altri in più tranche.
            Invio: disponibile prossimamente.
          </div>
        </Card>
      )}

      {/* Tabs ben evidenti sopra il blocco dinamico */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto w-auto gap-1 border border-border bg-muted/40 p-1.5 mt-2 mb-4 rounded-lg">
          <TabsTrigger
            value={TAB_ELENCO}
            className="px-5 py-2.5 text-base font-medium text-muted-foreground data-[state=active]:bg-[#c94f8f]/10 data-[state=active]:text-[#c94f8f] data-[state=active]:border-b-2 data-[state=active]:border-[#c94f8f] data-[state=active]:rounded-b-none"
          >
            Elenco clienti
          </TabsTrigger>
          <TabsTrigger
            value={TAB_SALVATI}
            className="px-5 py-2.5 text-base font-medium text-muted-foreground data-[state=active]:bg-[#c94f8f]/10 data-[state=active]:text-[#c94f8f] data-[state=active]:border-b-2 data-[state=active]:border-[#c94f8f] data-[state=active]:rounded-b-none"
          >
            Segmenti salvati ({(segmentiSalvati ?? []).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={TAB_ELENCO} className="space-y-6">
      {/* Lista */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selezionati.size > 0 && selezionati.size >= totale}
                  onCheckedChange={(v) => {
                    if (v) void selezionaTutti();
                    else setSelezionati(new Set());
                  }}
                  aria-label="Seleziona tutto il segmento"
                />
              </TableHead>
              <TableHead className="w-8" />
              <TableHead>Ragione sociale</TableHead>
              <TableHead>Città / Prov.</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-center">Email valida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || caricamentoTutti) && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground text-center py-6">
                {caricamentoTutti ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Selezione dell'intero segmento…</span>
                ) : "Caricamento..."}
              </TableCell></TableRow>
            )}
            {!isLoading && !caricamentoTutti && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground text-center py-6">Nessun cliente corrisponde ai filtri</TableCell></TableRow>
            )}
            {!caricamentoTutti && rows.map((c: any) => {
              const contatti = contattiMap?.get(c.id) ?? [];
              const hasEmail = isEmailValida(c.email) || contatti.some((k) => isEmailValida(k.email));
              const isSel = selezionati.has(c.id);
              const isOpen = espansi.has(c.id);
              return (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={(v) => toggleCliente(c.id, !!v)}
                        aria-label={`Seleziona ${c.ragione_sociale}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleEspanso(c.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? "Comprimi" : "Espandi"}
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium cursor-pointer" onClick={() => toggleEspanso(c.id)}>
                      {c.ragione_sociale}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[c.citta, c.provincia].filter(Boolean).join(" — ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{c.agente || (c.codice_agente ? c.codice_agente : "—")}</TableCell>
                    <TableCell className="text-sm">{c.categoria || "—"}</TableCell>
                    <TableCell className="text-center">
                      {hasEmail ? (
                        <Badge variant="outline" className="border-success text-success gap-1">
                          <Mail className="size-3" /> Sì
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1">
                          <MailX className="size-3" /> No
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow key={`${c.id}-exp`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={6} className="py-3">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={isSel && !aziendaliEsclusi.has(c.id)}
                              disabled={!isSel || !isEmailValida(c.email)}
                              onCheckedChange={(v) =>
                                setAziendaliEsclusi((p) => {
                                  const n = new Set(p);
                                  if (v) n.delete(c.id); else n.add(c.id);
                                  return n;
                                })
                              }
                              aria-label="Email aziendale"
                            />
                            <span className="font-medium">Email aziendale:</span>
                            <span className="text-muted-foreground">{c.email || "—"}</span>
                            {isEmailValida(c.email) ? (
                              <Badge variant="outline" className="border-success text-success">valida</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">non valida</Badge>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase">Contatti</div>
                            {contatti.length === 0 && (
                              <div className="text-sm text-muted-foreground">Nessun contatto registrato</div>
                            )}
                            {contatti.map((k) => (
                              <div key={k.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <Checkbox
                                  checked={isSel && !contattiEsclusi.has(k.id)}
                                  disabled={!isSel || !isEmailValida(k.email)}
                                  onCheckedChange={(v) =>
                                    setContattiEsclusi((p) => {
                                      const n = new Set(p);
                                      if (v) n.delete(k.id); else n.add(k.id);
                                      return n;
                                    })
                                  }
                                  aria-label={`Contatto ${k.nome}`}
                                />
                                <span className="font-medium">{[k.nome, k.cognome].filter(Boolean).join(" ")}</span>
                                <span className="text-muted-foreground">{k.email || "—"}</span>
                                {!isEmailValida(k.email) && (
                                  <Badge variant="outline" className="text-muted-foreground">email non valida</Badge>
                                )}
                                {k.consenso_marketing_diretto && (
                                  <Badge variant="outline" className="border-success text-success">{CONSENSO_LABEL.marketing_diretto}</Badge>
                                )}
                                {k.consenso_marketing_media && (
                                  <Badge variant="outline" className="border-success text-success">{CONSENSO_LABEL.marketing_media}</Badge>
                                )}
                                {k.consenso_profilazione && (
                                  <Badge variant="outline" className="border-success text-success">{CONSENSO_LABEL.profilazione}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {totale > PAGE_SIZE && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <div className="text-xs text-muted-foreground">
              Mostrati {daRiga.toLocaleString("it-IT")}–{aRiga.toLocaleString("it-IT")} di{" "}
              {totale.toLocaleString("it-IT")}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => vaiAPagina(1)}>
                Prima
              </Button>
              <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => vaiAPagina(pagina - 1)}>
                Precedente
              </Button>
              <span className="text-sm">
                Pagina {pagina} di {totalePagine}
              </span>
              <Button variant="outline" size="sm" disabled={pagina >= totalePagine} onClick={() => vaiAPagina(pagina + 1)}>
                Successiva
              </Button>
              <Button variant="outline" size="sm" disabled={pagina >= totalePagine} onClick={() => vaiAPagina(totalePagine)}>
                Ultima
              </Button>
            </div>
          </div>
        )}
      </Card>
        </TabsContent>

        <TabsContent value={TAB_SALVATI} className="space-y-6">
          {(segmentiSalvati ?? []).length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">
              Nessun segmento salvato. Imposta dei filtri e usa «Salva segmento» per crearne uno.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(segmentiSalvati ?? []).map((s) => (
                <Card key={s.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.nome}</div>
                      {s.descrizione && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{s.descrizione}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Eliminare il segmento "${s.nome}"?`)) {
                          eliminaSegmento.mutate(s.id);
                        }
                      }}
                      aria-label="Elimina segmento"
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => caricaSegmento(s.filtri)}>
                    Carica filtri
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
