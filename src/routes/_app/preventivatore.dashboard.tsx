import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Package, AlertCircle, CheckCircle2, ShoppingCart, CircleDashed, CircleDot } from "lucide-react";
import { computeEvasione, type StatoEvasione } from "@/lib/evasione";
import { EvasioneBadge } from "@/components/preventivatore/EvasioneBadge";

export const Route = createFileRoute("/_app/preventivatore/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sistema MADE" },
      { name: "description", content: "Dashboard del preventivatore Sistema MADE." },
    ],
  }),
  component: DashboardPage,
});

interface RigaMini {
  tipo_riga: string;
  quantita: number | null;
  qta_ordinata: number | null;
  importo: number | null;
}
interface BloccoMini { righe: RigaMini[] | null }

interface DocRecente {
  id: string;
  numero: string | null;
  data: string;
  stato: string;
  totale: number | null;
  cliente: string | null;
  evasione?: StatoEvasione;
}

interface DashStats {
  // Preventivi - contatori per evasione
  prevAperti: number;
  prevParziali: number;
  prevEvasi: number;
  valoreOfferteMese: number; // residuo non ordinato dei preventivi del mese
  ultimiPreventivi: DocRecente[];
  // Ordini
  ordBozza: number;
  ordConfermati: number;
  valoreOrdinatoMese: number;
  ultimiOrdini: DocRecente[];
  // Articoli
  articoliAttivi: number;
  articoliPotenziali: number;
}

const RIGHE_SELECT =
  "blocchi:blocchi_preventivo(righe:righe_preventivo(tipo_riga,quantita,qta_ordinata,importo))";

function flatten(blocchi: BloccoMini[] | null | undefined): RigaMini[] {
  return (blocchi ?? []).flatMap((b) => b.righe ?? []);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Valore residuo non ordinato di un preventivo, coerente col totale documento mostrato. */
function residuoPreventivo(righe: RigaMini[], totaleDocumento: number | null | undefined): number {
  const evasione = computeEvasione(righe);
  const totale = Number(totaleDocumento ?? 0);

  if (evasione === "evaso") return 0;
  if (evasione === "aperto") return totale;

  let imponibileTotaleRighe = 0;
  let imponibileResiduoRighe = 0;
  for (const r of righe) {
    if (r.tipo_riga !== "articolo_singolo" && r.tipo_riga !== "da_kit" && r.tipo_riga !== "manuale") continue;
    const q = Number(r.quantita ?? 0);
    if (q <= 0) continue;
    const o = Number(r.qta_ordinata ?? 0);
    const resQ = Math.max(0, Math.min(q, q - o));
    const importoRiga = Number(r.importo ?? 0);

    imponibileTotaleRighe += importoRiga;
    if (resQ > 0) {
      imponibileResiduoRighe += importoRiga * (resQ / q);
    }
  }

  if (Math.abs(imponibileTotaleRighe) <= 0.0001) return totale;
  return Math.max(0, round2(totale * (imponibileResiduoRighe / imponibileTotaleRighe)));
}

async function risolviNomiClienti(
  rows: { cliente_id: string | null }[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((r) => r.cliente_id).filter((v): v is string => !!v)),
  ];
  if (ids.length === 0) return new Map();

  const risolti = await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.rpc("get_cliente_lite" as never, {
        _id: id,
      } as never);
      const row = (
        data as unknown as
          | { id: string; ragione_sociale: string | null }[]
          | null
      )?.[0];
      return row ? ([id, row.ragione_sociale ?? "—"] as const) : null;
    })
  );

  const m = new Map<string, string>();
  for (const r of risolti) if (r) m.set(r[0], r[1]);
  return m;
}

async function fetchDashboardStats(): Promise<DashStats> {

  const now = new Date();
  const inizioMese = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [
    { count: articoliAttivi },
    { count: articoliPotenziali },
    { data: tuttiPrev },
    { data: ordMese },
    { data: ultimiPrev },
    { data: ultimiOrd },
  ] = await Promise.all([
    supabase.from("articoli").select("id", { count: "exact", head: true }).eq("stato", "attivo"),
    supabase.from("articoli").select("id", { count: "exact", head: true }).eq("stato", "potenziale"),
    supabase
      .from("preventivi")
      .select(`id, data, totale, ${RIGHE_SELECT}`)
      .eq("tipo", "preventivo"),
    supabase.from("preventivi").select("totale, data").eq("tipo", "ordine").gte("data", inizioMese),
    supabase
      .from("preventivi")
      .select(`id, numero, data, stato, totale, clienti(ragione_sociale), ${RIGHE_SELECT}`)
      .eq("tipo", "preventivo")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("preventivi")
      .select("id, numero, data, stato, totale, clienti(ragione_sociale)")
      .eq("tipo", "ordine")
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  // Contatori evasione su TUTTI i preventivi
  let prevAperti = 0, prevParziali = 0, prevEvasi = 0;
  let valoreOfferteMese = 0;
  for (const p of (tuttiPrev ?? []) as any[]) {
    const righe = flatten(p.blocchi);
    const stato = computeEvasione(righe);
    if (stato === "aperto") prevAperti++;
    else if (stato === "parziale") prevParziali++;
    else prevEvasi++;
    if (p.data >= inizioMese) {
      valoreOfferteMese += residuoPreventivo(righe, p.totale);
    }
  }

  const sumTotale = (rows: any[] | null) =>
    (rows ?? []).reduce((s, p: any) => s + Number(p.totale ?? 0), 0);

  const mapPrev = (rows: any[] | null): DocRecente[] =>
    (rows ?? []).map((p: any) => ({
      id: p.id,
      numero: p.numero,
      data: p.data,
      stato: p.stato,
      totale: p.totale,
      cliente: p.clienti?.ragione_sociale ?? null,
      evasione: computeEvasione(flatten(p.blocchi)),
    }));

  const mapOrd = (rows: any[] | null): DocRecente[] =>
    (rows ?? []).map((p: any) => ({
      id: p.id,
      numero: p.numero,
      data: p.data,
      stato: p.stato,
      totale: p.totale,
      cliente: p.clienti?.ragione_sociale ?? null,
    }));

  const ordBozza = ((ultimiOrd ?? []) as any[]); // placeholder
  void ordBozza;

  // Contatori ordini separati
  const [{ count: ordBozzaCount }, { count: ordConfermatiCount }] = await Promise.all([
    supabase.from("preventivi").select("id", { count: "exact", head: true }).eq("tipo", "ordine").eq("stato", "bozza"),
    supabase.from("preventivi").select("id", { count: "exact", head: true }).eq("tipo", "ordine").eq("stato", "confermato"),
  ]);

  return {
    prevAperti,
    prevParziali,
    prevEvasi,
    valoreOfferteMese,
    ultimiPreventivi: mapPrev(ultimiPrev),
    ordBozza: ordBozzaCount ?? 0,
    ordConfermati: ordConfermatiCount ?? 0,
    valoreOrdinatoMese: sumTotale(ordMese),
    ultimiOrdini: mapOrd(ultimiOrd),
    articoliAttivi: articoliAttivi ?? 0,
    articoliPotenziali: articoliPotenziali ?? 0,
  };
}

function formatEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
  });

  const today = mounted
    ? new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

  return (
    <div className="p-3 md:p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap gap-2 items-baseline justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard Sistema MADE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Panoramica preventivi, ordini, articoli e attività recenti.
          </p>
        </div>
        <div className="font-mono text-xs text-muted-foreground" suppressHydrationWarning>
          {today}
        </div>
      </div>

      {/* ARTICOLI */}
      <SectionTitle>Articoli</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <StatCard label="Articoli attivi" value={data?.articoliAttivi} icon={Package} />
        <StatCard
          label="Articoli potenziali"
          value={data?.articoliPotenziali}
          icon={AlertCircle}
          highlight={(data?.articoliPotenziali ?? 0) > 0}
          footer={
            (data?.articoliPotenziali ?? 0) > 0 ? (
              <Link to="/articoli" className="text-xs text-primary underline mt-2 inline-block">
                Esporta per GAMMA →
              </Link>
            ) : null
          }
        />
      </div>

      {/* PREVENTIVI */}
      <SectionTitle>Preventivi</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
        <StatCard label="Aperti" value={data?.prevAperti} icon={CircleDashed} />
        <StatCard label="Parz. evasi" value={data?.prevParziali} icon={CircleDot} />
        <StatCard label="Evasi" value={data?.prevEvasi} icon={CheckCircle2} />
        <StatCard
          label="Valore offerte mese (residuo)"
          value={data ? formatEur(data.valoreOfferteMese) : undefined}
          icon={FileText}
        />
      </div>
      <RecentDocsTable
        title="Ultimi preventivi"
        linkLabel="Vedi tutti →"
        linkTo="/preventivatore"
        docLinkTo="/preventivatore/$id"
        rows={data?.ultimiPreventivi}
        isLoading={isLoading}
        emptyLabel="Nessun preventivo recente."
        showEvasione
      />

      {/* ORDINI */}
      <SectionTitle>Ordini</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
        <StatCard label="Bozze" value={data?.ordBozza} icon={ShoppingCart} />
        <StatCard label="Confermati" value={data?.ordConfermati} icon={CheckCircle2} />
        <StatCard
          label="Valore ordinato mese"
          value={data ? formatEur(data.valoreOrdinatoMese) : undefined}
          icon={ShoppingCart}
        />
      </div>
      <RecentDocsTable
        title="Ultimi ordini"
        linkLabel="Vedi tutti →"
        linkTo="/ordini"
        docLinkTo="/preventivatore/$id"
        rows={data?.ultimiOrdini}
        isLoading={isLoading}
        emptyLabel="Nessun ordine recente."
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-foreground mt-8 pb-2 border-b border-border">
      {children}
    </h2>
  );
}

function RecentDocsTable({
  title,
  linkLabel,
  linkTo,
  docLinkTo,
  rows,
  isLoading,
  emptyLabel,
  showEvasione,
}: {
  title: string;
  linkLabel: string;
  linkTo: string;
  docLinkTo: "/preventivatore/$id";
  rows: DocRecente[] | undefined;
  isLoading: boolean;
  emptyLabel: string;
  showEvasione?: boolean;
}) {
  return (
    <div className="mt-4 bg-card border border-border rounded-md">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Link to={linkTo as any} className="text-xs text-primary hover:underline">
          {linkLabel}
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-5 py-2">Numero</th>
            <th className="text-left font-medium px-5 py-2">Cliente</th>
            <th className="text-left font-medium px-5 py-2">Data</th>
            <th className="text-left font-medium px-5 py-2">Stato</th>
            <th className="text-right font-medium px-5 py-2">Totale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && (
            <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">Caricamento…</td></tr>
          )}
          {!isLoading && (rows?.length ?? 0) === 0 && (
            <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">{emptyLabel}</td></tr>
          )}
          {rows?.map((p) => (
            <tr key={p.id} className="hover:bg-muted/30">
              <td className="px-5 py-2 font-mono">
                <Link to={docLinkTo} params={{ id: p.id }} className="hover:underline">
                  {p.numero ?? "—"}
                </Link>
              </td>
              <td className="px-5 py-2 text-foreground">{p.cliente ?? "—"}</td>
              <td className="px-5 py-2 font-mono text-muted-foreground">
                {new Date(p.data).toLocaleDateString("it-IT")}
              </td>
              <td className="px-5 py-2">
                {showEvasione && p.evasione ? (
                  <EvasioneBadge stato={p.evasione} />
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-foreground">{p.stato}</span>
                )}
              </td>
              <td className="px-5 py-2 font-mono text-right">
                {p.totale != null ? formatEur(Number(p.totale)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
  footer,
}: {
  label: string;
  value: number | string | undefined;
  icon: typeof FileText;
  highlight?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`bg-card border rounded-md p-4 flex items-start justify-between ${
        highlight ? "border-primary/40" : "border-border"
      }`}
    >
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-2xl font-semibold text-foreground mt-2">
          {value ?? "—"}
        </div>
        {footer}
      </div>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
