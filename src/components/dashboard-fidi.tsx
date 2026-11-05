import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Wallet,
  Calculator,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  PauseCircle,
  CircleAlert,
  Clock,
  Eye,
} from "lucide-react";
import {
  CATEGORIE_DASHBOARD, CATEGORIE_OLTRE, PREFISSO_PRESET, codificaFiltroDashboard, etichettaRiga,
  normalizzaGruppi, riga, sommaRighe, type RigaGruppo,
} from "@/lib/dashboard-fidi-gruppi";
import type { LucideIcon } from "lucide-react";

type DashboardFidi = {
  fido_concesso_eur: number;
  fido_concesso_clienti: number;
  fido_concesso_piccoli_n: number;
  fido_concesso_piccoli_eur: number;
  fido_proposto_eur: number;
  fido_proposto_clienti: number;
  fido_proposto_piccoli_n: number;
  fido_proposto_piccoli_eur: number;
  da_verificare_n: number;
  oltre_fido_n: number;
  oltre_fido_eur: number;
  insoluti_n: number;
  insoluti_eur: number;
  insoluti_non_bloccati_n: number;
  fermi_n: number;
  fermi_scaduto_eur: number;
  scaduto_eur: number;
  scaduto_over60_eur: number;
  aggiornato_al: string | null;
};

function euro(n: number, decimali = 0) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(n);
}

function numero(n: number) {
  return new Intl.NumberFormat("it-IT").format(n);
}

function dataOra(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DashboardFidi() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-fidi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_fidi");
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) ?? null;
      if (!r) return null;
      const num = (x: unknown) => Number(x ?? 0);
      return {
        ...r,
        fido_concesso_eur: num(r.fido_concesso_eur),
        fido_concesso_clienti: num(r.fido_concesso_clienti),
        fido_concesso_piccoli_n: num(r.fido_concesso_piccoli_n),
        fido_concesso_piccoli_eur: num(r.fido_concesso_piccoli_eur),
        fido_proposto_eur: num(r.fido_proposto_eur),
        fido_proposto_clienti: num(r.fido_proposto_clienti),
        fido_proposto_piccoli_n: num(r.fido_proposto_piccoli_n),
        fido_proposto_piccoli_eur: num(r.fido_proposto_piccoli_eur),
        da_verificare_n: num(r.da_verificare_n),
        oltre_fido_n: num(r.oltre_fido_n),
        oltre_fido_eur: num(r.oltre_fido_eur),
        insoluti_n: num(r.insoluti_n),
        insoluti_eur: num(r.insoluti_eur),
        insoluti_non_bloccati_n: num(r.insoluti_non_bloccati_n),
        fermi_n: num(r.fermi_n),
        fermi_scaduto_eur: num(r.fermi_scaduto_eur),
        scaduto_eur: num(r.scaduto_eur),
        scaduto_over60_eur: num(r.scaduto_over60_eur),
      } as DashboardFidi;
    },
  });

  const { data: gruppi } = useQuery({
    queryKey: ["dashboard-fidi-gruppi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_fidi_gruppi");
      if (error) throw error;
      return normalizzaGruppi(data);
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-8 w-40" />
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Impossibile caricare i totali dei fidi.</p>
      </Card>
    );
  }

  const delta = data.fido_proposto_eur - data.fido_concesso_eur;
  const deltaPerc = data.fido_concesso_eur > 0 ? (delta / data.fido_concesso_eur) * 100 : 0;
  const positivo = delta >= 0;

  const G = gruppi ?? [];
  const pronto = !!gruppi;
  const oltreTot = sommaRighe(G, "oltre", CATEGORIE_OLTRE);
  const fermiTot = sommaRighe(G, "fermi", ["imprese", "privati"]);
  const occhioTot = riga(G, "occhio", "totale");
  const rigaCat = (card: string, gruppo: string, valore: (r: RigaGruppo) => string, extra?: Partial<RigaCardProps>): RigaCardProps => {
    const r = riga(G, card, gruppo);
    return { card, gruppo, etichetta: etichettaRiga(card, gruppo), valore: pronto ? valore(r) : "…", ...extra };
  };
  const nEuro = (r: RigaGruppo) => `${numero(r.n_clienti)} clienti · ${euro(r.importo)}`;
  const segno = (v: number) => `${v >= 0 ? "+" : "−"}${euro(Math.abs(v))}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CardRighe
          titolo="Fido concesso"
          valore={euro(data.fido_concesso_eur)}
          sottotitolo={`${numero(data.fido_concesso_clienti)} clienti con fido attivo`}
          icona={Wallet}
          tono="primary"
          righe={CATEGORIE_DASHBOARD.map((g) => rigaCat("concesso", g, nEuro))}
          righeSotto={[rigaCat("concesso", "fermi", (r) => `${numero(r.n_clienti)} · ${euro(r.importo)}`, { etichetta: "di cui clienti fermi" })]}
        />
        <CardRighe
          titolo="Fido proposto"
          valore={euro(data.fido_proposto_eur)}
          sottotitolo={`Calcolo teorico aggiornato al ${dataOra(data.aggiornato_al)}`}
          icona={Calculator}
          tono="info"
          righe={CATEGORIE_DASHBOARD.map((g) => rigaCat("proposto", g, nEuro))}
        />
        <CardRighe
          titolo="Variazione"
          valore={`${positivo ? "+" : "−"}${euro(Math.abs(delta))}`}
          sottotitolo={`${positivo ? "+" : "−"}${Math.abs(deltaPerc).toFixed(1)}% rispetto al concesso`}
          icona={positivo ? TrendingUp : TrendingDown}
          tono={positivo ? "success" : "warning"}
          righe={CATEGORIE_DASHBOARD.map((g) => rigaCat("variazione", g, (r) => segno(r.importo), {
            dettaglio: pronto ? `↑${numero(riga(G, "variazione", g).n_aumenti)} · ↓${numero(riga(G, "variazione", g).n_riduzioni)}` : undefined,
          }))}
          link={{ testo: `${numero(data.da_verificare_n)} posizioni da verificare`, to: "/clienti", search: { preset: "da_verificare" } }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <CardRighe
          titolo="Esposizione oltre il fido"
          valore={pronto ? euro(oltreTot.importo) : "…"}
          sottotitolo={pronto ? `${numero(oltreTot.n_clienti)} clienti oltre il fido concesso` : undefined}
          icona={AlertTriangle}
          tono="warning"
          righe={CATEGORIE_OLTRE.map((g) => rigaCat("oltre", g, nEuro))}
          righeSotto={[rigaCat("oltre", "contanti_pos", nEuro, { attenuata: true })]}
        />
        <Riquadro
          compatto
          titolo="Insoluti in corso"
          valore={euro(data.insoluti_eur)}
          sottotitolo={`${numero(data.insoluti_n)} clienti · ${numero(data.insoluti_non_bloccati_n)} non bloccati (sotto trattativa)`}
          icona={CircleAlert}
          tono="danger"
          cardLink={{ to: "/clienti", search: { preset: "insoluti" } }}
          nota="Vedi i clienti con insoluti"
        />
        <CardRighe
          titolo="Clienti fermi"
          valore={pronto ? numero(fermiTot.n_clienti) : "…"}
          sottotitolo="Comprano nel 2026, nessun acquisto negli ultimi 3 mesi"
          icona={PauseCircle}
          tono="info"
          righe={(["imprese", "privati"] as const).map((g) => rigaCat("fermi", g, (r) => `${numero(r.n_clienti)} · fido non usato ${euro(r.importo)}`))}
        />
        <Riquadro
          compatto
          titolo="Scaduto totale"
          valore={euro(data.scaduto_eur)}
          sottotitolo={`di cui oltre 60 giorni: ${euro(data.scaduto_over60_eur)}`}
          icona={Clock}
          tono="warning"
          cardLink={{ to: "/scadenziario" }}
          nota="Vedi lo scadenzario"
          notaExtra="Coerente con lo scadenziario (esclude BOS e gestione legale)"
        />
        <CardRighe
          titolo="Fidi da tenere d'occhio"
          valore={pronto ? `${numero(occhioTot.n_clienti)} clienti` : "…"}
          sottotitolo={pronto ? `fido concesso ${euro(occhioTot.importo)}` : undefined}
          valoreLink={{ card: "occhio", gruppo: "totale" }}
          icona={Eye}
          tono="warning"
          righe={(["vicini", "piu", "ordini"] as const).map((g) => rigaCat("occhio", g, (r) => `${numero(r.n_clienti)} · ${euro(r.importo)}`))}
          nota="Un cliente può comparire in più righe."
          link={{ testo: "Vai agli Alert fidi", to: "/alert-fidi" }}
        />
      </div>
    </div>
  );
}

type RigaCardProps = {
  card: string;
  gruppo: string;
  etichetta: string;
  valore: string;
  dettaglio?: string;
  attenuata?: boolean;
};

function linkLista(card: string, gruppo: string) {
  return { preset: `${PREFISSO_PRESET}${codificaFiltroDashboard(card, gruppo)}` };
}

function RigaCard({ card, gruppo, etichetta, valore, dettaglio, attenuata }: RigaCardProps) {
  return (
    <Link
      to="/clienti"
      search={linkLista(card, gruppo) as any}
      aria-label={`Apri la lista: ${etichetta}`}
      className={`flex min-h-10 sm:min-h-8 items-center justify-between gap-3 rounded-md px-2 -mx-2 text-sm cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${attenuata ? "text-muted-foreground" : "text-foreground"}`}
    >
      <span className="min-w-0 break-words">{etichetta}</span>
      <span className="shrink-0 text-right tabular-nums">
        {valore}
        {dettaglio && <span className="ml-2 text-xs text-muted-foreground">{dettaglio}</span>}
      </span>
    </Link>
  );
}

function CardRighe({
  titolo, valore, sottotitolo, icona: Icon, tono, righe, righeSotto, link, nota, valoreLink,
}: {
  titolo: string;
  valore: string;
  sottotitolo?: string;
  icona: LucideIcon;
  tono: "primary" | "success" | "warning" | "info" | "danger";
  righe: RigaCardProps[];
  righeSotto?: RigaCardProps[];
  link?: { testo: string; to: string; search?: Record<string, string> };
  nota?: string;
  valoreLink?: { card: string; gruppo: string };
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    danger: "bg-destructive/10 text-destructive",
  }[tono];
  const numeroGrande = <p className="text-2xl font-bold text-foreground tabular-nums break-words">{valore}</p>;
  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{titolo}</p>
          {valoreLink ? (
            <Link to="/clienti" search={linkLista(valoreLink.card, valoreLink.gruppo) as any} className="block cursor-pointer hover:underline">
              {numeroGrande}
            </Link>
          ) : numeroGrande}
          {sottotitolo && <p className="text-xs text-muted-foreground">{sottotitolo}</p>}
        </div>
        <div className={`size-10 shrink-0 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="space-y-0.5">
        {righe.map((r) => <RigaCard key={r.gruppo} {...r} />)}
      </div>
      {righeSotto && righeSotto.length > 0 && (
        <div className="border-t pt-2 space-y-0.5">
          {righeSotto.map((r) => <RigaCard key={r.gruppo} {...r} />)}
        </div>
      )}
      {(nota || link) && (
        <div className="space-y-1">
          {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
          {link && (
            <Link to={link.to as any} search={link.search as any} className="inline-flex min-h-10 sm:min-h-0 items-center text-xs font-medium text-primary hover:underline">
              {link.testo}
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function Riquadro({
  titolo,
  valore,
  sottotitolo,
  icona: Icon,
  tono,
  nota,
  notaLink,
  notaExtra,
  cardLink,
  compatto,
  righe,
}: {
  titolo: string;
  valore: string;
  sottotitolo?: string;
  icona: LucideIcon;
  tono: "primary" | "success" | "warning" | "info" | "danger";
  nota?: string;
  notaLink?: { to: string; search: Record<string, string> };
  notaExtra?: string;
  cardLink?: { to: string; search?: Record<string, string> };
  compatto?: boolean;
  righe?: string[];
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    info: "bg-info/15 text-info",
    danger: "bg-destructive/10 text-destructive",
  }[tono];

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{titolo}</p>
        <p className={`font-bold text-foreground ${compatto ? "text-xl" : "text-2xl"}`}>{valore}</p>
        {sottotitolo && <p className="text-xs text-muted-foreground">{sottotitolo}</p>}
        {righe?.map((r) => <p key={r} className="text-xs text-muted-foreground">{r}</p>)}
        {nota && (
          cardLink ? (
            <p className="text-xs text-muted-foreground">{nota}</p>
          ) : notaLink ? (
            <Link
              to={notaLink.to as any}
              search={notaLink.search as any}
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              {nota}
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">{nota}</p>
          )
        )}
        {notaExtra && <p className="text-xs text-muted-foreground">{notaExtra}</p>}
      </div>
      <div className={`size-10 shrink-0 rounded-lg flex items-center justify-center ${toneClass}`}>
        <Icon className="size-5" />
      </div>
    </div>
  );

  return (
    <Card className={`${compatto ? "p-4" : "p-5"} ${cardLink ? "hover:shadow-md transition-shadow" : ""}`}>
      {cardLink ? (
        <Link
          to={cardLink.to as any}
          search={cardLink.search as any}
          className="block cursor-pointer"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </Card>
  );
}
