import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarDays, Check, MapPin, Save, Trash2, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AggiungiPartecipanteDialog } from "@/components/eventi/aggiungi-partecipante-dialog";
import { ImportPartecipantiCard } from "@/components/eventi/import-partecipanti-card";
import { RiconciliaImportCard } from "@/components/eventi/riconcilia-import-card";
import { puoAccedereLead } from "@/lib/lead-costanti";
import { useServerFn } from "@tanstack/react-start";
import { inviaRichiestaFirmaPrivacy } from "@/lib/firma-privacy.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X } from "lucide-react";

import {
  EVENTI_PARTECIPANTE_STATO_CLASS,
  EVENTI_PARTECIPANTE_STATO_LABEL, formatDataEvento, nomePartecipante,
  type EventiPartecipanteStato,
} from "@/lib/eventi-costanti";

export const Route = createFileRoute("/_app/eventi/$eventoId")({
  component: EventoDettaglioPage,
  head: () => ({
    meta: [
      { title: "Dettaglio evento — CRM MADE" },
      { name: "description", content: "Scheda evento con elenco e censimento dei partecipanti." },
      { property: "og:title", content: "Dettaglio evento — CRM MADE" },
      { property: "og:description", content: "Scheda evento con elenco e censimento dei partecipanti." },
    ],
  }),
});

type PartecipanteRow = {
  id: string;
  stato: EventiPartecipanteStato;
  lead_id: string | null;
  cliente_id: string | null;
  contatto_id: string | null;
  nome: string | null;
  cognome: string | null;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  lead: {
    id: string; ragione_sociale: string | null; nome: string | null; cognome: string | null;
    email: string | null; telefono: string | null;
  } | null;
  cliente: { id: string; ragione_sociale: string | null; email: string | null; telefono: string | null } | null;
  contatto: {
    id: string; nome: string | null; cognome: string | null;
    email: string | null; telefono: string | null;
    privacy_firmata: boolean | null; data_firma: string | null;
  } | null;
};

type ContattoSoggetto = {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  privacy_firmata: boolean | null;
  data_firma: string | null;
  principale: boolean | null;
  cliente_id: string | null;
  lead_id: string | null;
};

/** Chiave della mappa soggetto → contatti. */
function chiaveSoggetto(p: { cliente_id: string | null; lead_id: string | null }): string | null {
  if (p.cliente_id) return `c:${p.cliente_id}`;
  if (p.lead_id) return `l:${p.lead_id}`;
  return null;
}

type MappaContatti = Map<string, ContattoSoggetto[]>;

/** Contatti del soggetto collegato alla riga (vuoto se nessun soggetto). */
function contattiSoggetto(p: PartecipanteRow, mappa: MappaContatti): ContattoSoggetto[] {
  const k = chiaveSoggetto(p);
  return (k && mappa.get(k)) || [];
}

type StatoPrivacy = { tipo: "firmata" | "non_raccolta" | "assente"; data: string | null };

/**
 * Stato privacy della riga: prima il contatto agganciato, poi i contatti del
 * soggetto collegato (basta uno firmato per considerare la privacy raccolta).
 */
function privacyRiga(p: PartecipanteRow, mappa: MappaContatti): StatoPrivacy {
  if (p.contatto) {
    if (p.contatto.privacy_firmata) return { tipo: "firmata", data: p.contatto.data_firma };
    return { tipo: "non_raccolta", data: null };
  }
  const lista = contattiSoggetto(p, mappa);
  if (lista.length === 0) return { tipo: "assente", data: null };
  const firmato = lista.find((c) => c.privacy_firmata);
  if (firmato) return { tipo: "firmata", data: firmato.data_firma };
  return { tipo: "non_raccolta", data: null };
}

/** Email/telefono con precedenza: contatto → soggetto collegato → dati grezzi. */
function recapitiRiga(p: PartecipanteRow, mappa: MappaContatti): { email: string | null; telefono: string | null } {
  const lista = contattiSoggetto(p, mappa);
  const principale = lista.find((c) => c.principale) ?? lista[0] ?? null;
  const email =
    p.contatto?.email ?? principale?.email ?? p.cliente?.email ?? p.lead?.email ?? p.email ?? null;
  const telefono =
    p.contatto?.telefono ?? principale?.telefono ?? p.cliente?.telefono ?? p.lead?.telefono ?? p.telefono ?? null;
  return { email: email || null, telefono: telefono || null };
}

/** Normalizza per la ricerca: minuscolo e senza accenti. */
function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Testo ricercabile: riga, soggetto collegato e TUTTI i contatti del soggetto. */
function testoRicerca(p: PartecipanteRow, mappa: MappaContatti): string {
  const extra = contattiSoggetto(p, mappa).flatMap((c) => [c.nome, c.cognome, c.email]);
  return norm([
    p.nome, p.cognome, p.ragione_sociale, p.email,
    p.lead?.nome, p.lead?.cognome, p.lead?.ragione_sociale,
    p.cliente?.ragione_sociale,
    p.contatto?.nome, p.contatto?.cognome, p.contatto?.email,
    ...extra,
  ].filter(Boolean).join(" "));
}

function formatDataFirma(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString("it-IT");
}





function EventoDettaglioPage() {
  const { eventoId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);

  const [nome, setNome] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [luogo, setLuogo] = useState("");
  const [note, setNote] = useState("");
  const inviaFn = useServerFn(inviaRichiestaFirmaPrivacy);

  // ricerca lato client sulla lista partecipanti (debounce 200ms)
  const [ricerca, setRicerca] = useState("");
  const [ricercaDeb, setRicercaDeb] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setRicercaDeb(ricerca.trim()), 200);
    return () => window.clearTimeout(t);
  }, [ricerca]);

  const [selezionati, setSelezionati] = useState<string[]>([]);
  const [filtroStato, setFiltroStato] = useState<"tutti" | "attesi" | "presenti" | "no_show">("tutti");
  const [invioInCorso, setInvioInCorso] = useState(false);






  const { data: evento, isLoading } = useQuery({
    queryKey: ["evento", eventoId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi")
        .select("id, nome, data_evento, luogo, note")
        .eq("id", eventoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!evento) return;
    setNome(evento.nome ?? "");
    setDataEvento(evento.data_evento ?? "");
    setLuogo(evento.luogo ?? "");
    setNote(evento.note ?? "");
  }, [evento]);

  const { data: partecipanti, isLoading: loadingPart } = useQuery({
    queryKey: ["evento-partecipanti", eventoId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi_partecipanti")
        .select(
          "id, stato, lead_id, cliente_id, contatto_id, nome, cognome, ragione_sociale, partita_iva, codice_fiscale, email, telefono, note, lead:lead_id(id, ragione_sociale, nome, cognome, email, telefono), cliente:cliente_id(id, ragione_sociale, email, telefono), contatto:contatto_id(id, nome, cognome, email, telefono, privacy_firmata, data_firma)",
        )
        .eq("evento_id", eventoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PartecipanteRow[];
    },
  });

  // Contatti di TUTTI i soggetti collegati: serve a privacy, recapiti e ricerca.
  const clienteIds = useMemo(
    () => [...new Set((partecipanti ?? []).map((p) => p.cliente_id).filter(Boolean) as string[])],
    [partecipanti],
  );
  const leadIds = useMemo(
    () => [...new Set((partecipanti ?? []).map((p) => p.lead_id).filter(Boolean) as string[])],
    [partecipanti],
  );

  const { data: contattiSoggetti } = useQuery({
    queryKey: ["evento-contatti-soggetti", eventoId, clienteIds.length, leadIds.length],
    enabled: canSee && (clienteIds.length > 0 || leadIds.length > 0),
    queryFn: async () => {
      const COLS =
        "id, nome, cognome, email, telefono, privacy_firmata, data_firma, principale, cliente_id, lead_id";
      const out: ContattoSoggetto[] = [];

      const caricaPer = async (campo: "cliente_id" | "lead_id", ids: string[]) => {
        for (let i = 0; i < ids.length; i += 500) {
          const blocco = ids.slice(i, i + 500);
          // PostgREST tronca a 1000 righe: pagina finché il blocco è pieno.
          let from = 0;
          for (;;) {
            const { data, error } = await supabase
              .from("contatti")
              .select(COLS)
              .in(campo, blocco)
              .order("id", { ascending: true })
              .range(from, from + 999);
            if (error) throw error;
            const righe = (data ?? []) as unknown as ContattoSoggetto[];
            out.push(...righe);
            if (righe.length < 1000) break;
            from += 1000;
          }
        }
      };

      if (clienteIds.length) await caricaPer("cliente_id", clienteIds);
      if (leadIds.length) await caricaPer("lead_id", leadIds);
      return out;
    },
  });

  const mappaContatti = useMemo<MappaContatti>(() => {
    const m: MappaContatti = new Map();
    for (const c of contattiSoggetti ?? []) {
      const k = c.cliente_id ? `c:${c.cliente_id}` : c.lead_id ? `l:${c.lead_id}` : null;
      if (!k) continue;
      const arr = m.get(k);
      if (arr) arr.push(c);
      else m.set(k, [c]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Number(!!b.principale) - Number(!!a.principale));
    }
    return m;
  }, [contattiSoggetti]);


  const salvaEvento = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("eventi")
        .update({
          nome: nome.trim(),
          data_evento: dataEvento || null,
          luogo: luogo.trim() || null,
          note: note.trim() || null,
        })
        .eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Evento aggiornato");
    },
    onError: (e: Error) => toast.error("Errore nel salvataggio", { description: e.message }),
  });

  const eliminaEvento = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eventi").delete().eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Evento eliminato");
      navigate({ to: "/eventi" });
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });

  const cambiaStato = useMutation({

    mutationFn: async ({ id, stato }: { id: string; stato: EventiPartecipanteStato }) => {
      const { error } = await supabase.from("eventi_partecipanti").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
    },
    onError: (e: Error) => toast.error("Errore nel cambio stato", { description: e.message }),
  });

  const eliminaPartecipante = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eventi_partecipanti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Partecipante eliminato");
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });

  // ——— riepilogo, filtro stato, ricerca, selezione multipla ———
  const riepilogo = useMemo(() => {
    const lista = partecipanti ?? [];
    const attesi = lista.filter((p) => p.stato === "atteso" || p.stato === "confermato").length;
    const presenti = lista.filter((p) => p.stato === "presentato").length;
    const noShow = lista.filter((p) => p.stato === "no_show").length;
    const privacyOk = lista.filter((p) => privacyRiga(p, mappaContatti).tipo === "firmata").length;
    const base = presenti + noShow;
    return {
      totale: lista.length,
      attesi,
      presenti,
      noShow,
      privacyOk,
      tasso: base > 0 ? Math.round((presenti / base) * 100) : null,
    };
  }, [partecipanti, mappaContatti]);

  const filtrati = useMemo(() => {
    let lista = partecipanti ?? [];
    if (filtroStato === "attesi") {
      lista = lista.filter((p) => p.stato === "atteso" || p.stato === "confermato");
    } else if (filtroStato === "presenti") {
      lista = lista.filter((p) => p.stato === "presentato");
    } else if (filtroStato === "no_show") {
      lista = lista.filter((p) => p.stato === "no_show");
    }
    const q = norm(ricercaDeb);
    if (!q) return lista;
    return lista.filter((p) => testoRicerca(p, mappaContatti).includes(q));
  }, [partecipanti, ricercaDeb, filtroStato, mappaContatti]);


  const idsFiltrati = useMemo(() => filtrati.map((p) => p.id), [filtrati]);
  const selezionatiValidi = useMemo(
    () => selezionati.filter((id) => idsFiltrati.includes(id)),
    [selezionati, idsFiltrati],
  );
  const tuttiSelezionati = idsFiltrati.length > 0 && selezionatiValidi.length === idsFiltrati.length;

  const toggleRiga = (id: string, on: boolean) =>
    setSelezionati((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  const cambiaStatoMassivo = useMutation({
    mutationFn: async (stato: EventiPartecipanteStato) => {
      const { error } = await supabase
        .from("eventi_partecipanti")
        .update({ stato })
        .in("id", selezionatiValidi);
      if (error) throw error;
      return selezionatiValidi.length;
    },
    onSuccess: (n) => {
      setSelezionati([]);
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success(`${n} partecipanti aggiornati`);
    },
    onError: (e: Error) => toast.error("Errore nell'aggiornamento", { description: e.message }),
  });

  const eliminaMassivo = useMutation({
    mutationFn: async () => {
      // Elimina SOLO le righe partecipante: lead, contatti e clienti restano intatti.
      const { error } = await supabase
        .from("eventi_partecipanti")
        .delete()
        .in("id", selezionatiValidi);
      if (error) throw error;
      return selezionatiValidi.length;
    },
    onSuccess: (n) => {
      setSelezionati([]);
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success(`${n} partecipanti eliminati dall'evento`);
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });

  /** Invio massivo dei link privacy: sequenziale, con piccolo ritardo fra le chiamate. */
  const inviaLinkMassivo = async () => {
    const righe = filtrati.filter((p) => selezionatiValidi.includes(p.id));
    let inviate = 0;
    let soloLink = 0;
    let giaFirmate = 0;
    let saltate = 0;
    let errori = 0;

    setInvioInCorso(true);
    try {
      for (const p of righe) {
        if (p.contatto?.privacy_firmata) { giaFirmate++; continue; }
        const email = p.contatto?.email ?? p.email;
        if (!p.contatto_id || !email) { saltate++; continue; }
        try {
          const res = await inviaFn({
            data: { contattoId: p.contatto_id, origin: window.location.origin },
          });
          if (res.emailInviata) inviate++;
          else soloLink++;
        } catch {
          errori++;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setInvioInCorso(false);
    }

    const parti = [`${inviate} inviati`];
    if (soloLink) parti.push(`${soloLink} con link generato ma email non partita`);
    if (giaFirmate) parti.push(`${giaFirmate} saltati: privacy già firmata`);
    if (saltate) parti.push(`${saltate} saltati: senza contatto o email`);
    if (errori) parti.push(`${errori} in errore`);
    toast.success("Invio link privacy completato", { description: parti.join(" · ") });
    setSelezionati([]);
    queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
  };




  if (authLoading || isLoading) return <Skeleton className="h-40 w-full" />;

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

  if (!evento) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Evento non trovato</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate({ to: "/eventi" })}>
          Torna agli eventi
        </Button>
      </Card>
    );
  }

  const totale = partecipanti?.length ?? 0;
  const presentati = partecipanti?.filter((p) => p.stato === "presentato").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate({ to: "/eventi" })}>
          <ArrowLeft className="size-4" /> Eventi
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1.5">
              <Trash2 className="size-4" /> Elimina evento
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare l'evento?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno eliminati anche tutti i partecipanti censiti. L'operazione non è reversibile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => eliminaEvento.mutate()}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{evento.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />{formatDataEvento(evento.data_evento)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />{evento.luogo || "—"}
            </span>
            <span>{totale} partecipanti · {presentati} presentati</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-nome">Nome</Label>
            <Input id="ed-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-data">Data</Label>
            <Input id="ed-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-luogo">Luogo</Label>
            <Input id="ed-luogo" value={luogo} onChange={(e) => setLuogo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-note">Note</Label>
          <Textarea id="ed-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button
            className="gap-1.5"
            disabled={!nome.trim() || salvaEvento.isPending}
            onClick={() => salvaEvento.mutate()}
          >
            <Save className="size-4" /> Salva modifiche
          </Button>
        </div>
      </Card>

      <ImportPartecipantiCard eventoId={eventoId} nomeEvento={nome} />

      <RiconciliaImportCard eventoId={eventoId} />


      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Partecipanti</h2>
            <p className="text-sm text-muted-foreground">
              Prima dell'evento la lista degli attesi, durante e dopo il censimento di chi si presenta.
            </p>
          </div>
          <AggiungiPartecipanteDialog eventoId={eventoId} nomeEvento={evento.nome} />

        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { k: "tutti", label: "Totale", val: riepilogo.totale },
              { k: "attesi", label: "Attesi", val: riepilogo.attesi },
              { k: "presenti", label: "Presenti", val: riepilogo.presenti },
              { k: "no_show", label: "No show", val: riepilogo.noShow },
            ] as const).map((c) => {
              const attivo = filtroStato === c.k;
              return (
                <button
                  key={c.k}
                  type="button"
                  onClick={() =>
                    setFiltroStato((s) => (c.k === "tutti" || s === c.k ? "tutti" : c.k))
                  }
                  className={`rounded-md border p-2 text-left transition-colors ${
                    attivo ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-xl font-semibold">{c.val}</div>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {riepilogo.tasso !== null && (
              <span>Tasso di presenza <span className="font-medium text-foreground">{riepilogo.tasso}%</span></span>
            )}
            <span>Privacy raccolta: <span className="font-medium text-foreground">{riepilogo.privacyOk}</span> di {riepilogo.totale}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">

          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cerca per nome, cognome, ragione sociale o email…"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
            />
          </div>
          {(ricercaDeb || filtroStato !== "tutti") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filtrati.length} di {totale} partecipanti</span>
              <Button
                size="sm" variant="ghost" className="gap-1.5"
                onClick={() => { setRicerca(""); setFiltroStato("tutti"); }}
              >
                <X className="size-4" /> Azzera
              </Button>
            </div>
          )}

        </div>

        {selezionatiValidi.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-sm font-medium px-1">{selezionatiValidi.length} selezionati</span>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              disabled={cambiaStatoMassivo.isPending}
              onClick={() => cambiaStatoMassivo.mutate("presentato")}
            >
              <Check className="size-4" /> Segna come presente
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              disabled={cambiaStatoMassivo.isPending}
              onClick={() => cambiaStatoMassivo.mutate("no_show")}
            >
              <UserX className="size-4" /> Segna come non venuto
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              disabled={invioInCorso}
              onClick={() => void inviaLinkMassivo()}
            >
              {invioInCorso ? "Invio in corso…" : "Invia link privacy"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1.5 ml-auto">
                  <Trash2 className="size-4" /> Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Eliminare {selezionatiValidi.length} partecipanti dall'evento?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Vengono rimosse solo le righe di partecipazione: lead, contatti e clienti collegati
                    restano invariati.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={() => eliminaMassivo.mutate()}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Seleziona tutti"
                  checked={tuttiSelezionati}
                  onCheckedChange={(v) => setSelezionati(v === true ? idsFiltrati : [])}
                />
              </TableHead>
              <TableHead>Identità</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPart && (
              <TableRow><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            )}
            {!loadingPart && filtrati.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  {totale === 0 ? "Nessun partecipante censito." : "Nessun partecipante corrisponde alla ricerca."}
                </TableCell>
              </TableRow>
            )}
            {filtrati.map((p) => (
              <TableRow key={p.id} data-state={selezionatiValidi.includes(p.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label="Seleziona partecipante"
                    checked={selezionatiValidi.includes(p.id)}
                    onCheckedChange={(v) => toggleRiga(p.id, v === true)}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {p.lead ? (
                      <Link
                        to="/lead/$leadId"
                        params={{ leadId: p.lead.id }}
                        className="text-primary hover:underline"
                      >
                        {nomePartecipante(p.lead)}
                      </Link>
                    ) : p.cliente ? (
                      <Link
                        to="/clienti/$clienteId"
                        params={{ clienteId: p.cliente.id }}
                        className="text-primary hover:underline"
                      >
                        {p.cliente.ragione_sociale ?? "Cliente"}
                      </Link>
                    ) : p.contatto ? (
                      <span>{`${p.contatto.nome ?? ""} ${p.contatto.cognome ?? ""}`.trim() || "Contatto"}</span>
                    ) : (
                      nomePartecipante(p)
                    )}
                  </div>
                  {(p.partita_iva || p.codice_fiscale) && (
                    <div className="text-xs text-muted-foreground">
                      {[p.partita_iva, p.codice_fiscale].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`${EVENTI_PARTECIPANTE_STATO_CLASS[p.stato]} hover:opacity-100`} variant="secondary">
                    {EVENTI_PARTECIPANTE_STATO_LABEL[p.stato]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{p.email || "—"}</div>
                  <div className="text-muted-foreground">{p.telefono || "—"}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {(p.stato === "atteso" || p.stato === "confermato") && (
                      <>
                        <Button
                          size="sm" variant="outline" className="gap-1.5"
                          disabled={cambiaStato.isPending}
                          onClick={() => cambiaStato.mutate({ id: p.id, stato: "presentato" })}
                        >
                          <Check className="size-4" /> Presente
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="gap-1.5"
                          disabled={cambiaStato.isPending}
                          onClick={() => cambiaStato.mutate({ id: p.id, stato: "no_show" })}
                        >
                          <UserX className="size-4" /> No show
                        </Button>
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare il partecipante?</AlertDialogTitle>
                          <AlertDialogDescription>L'operazione non è reversibile.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => eliminaPartecipante.mutate(p.id)}>
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
