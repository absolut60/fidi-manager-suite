import { createFileRoute, Link, linkOptions, type LinkOptions } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Inbox, Hourglass, CheckCircle2, XCircle, ClipboardList, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntestazioneRichieste } from "@/components/richieste-interne/intestazione";
import { BadgeStile } from "@/components/richieste-interne/richieste-table";
import { STILE_PAGINA, TINTE, stileAdmin, stilePrincipale, stileStatus, stileTipo, type Tinta } from "@/components/richieste-interne/stili";
import { puoGestireTesoreria } from "@/lib/tesoreria-permessi";
import { Banknote } from "lucide-react";
import { NuovaRichiestaDialog } from "@/components/richieste-interne/nuova-richiesta-dialog";

export const Route = createFileRoute("/_app/richieste-interne/")({
  component: DashboardRichiesteInterne,
});

function DashboardRichiesteInterne() {
  const { user, roles } = useAuth();
  const uid = user?.id ?? "";

  const isRichiedente = roles.includes("richiedente");
  const isApp1 = roles.includes("approvatore_richieste_liv1");
  const isApp2 = roles.includes("approvatore_richieste_liv2");
  const isGestore = roles.includes("gestore_richieste") || roles.includes("esecutore_richieste");
  const isAdmin = roles.includes("amministratore");
  const vediTutte = (["amministratore", "approvatore_richieste_liv1", "approvatore_richieste_liv2", "gestore_richieste", "esecutore_richieste", "tesoreria"] as string[]).some((x) => (roles as string[]).includes(x))
    ? "/richieste-interne/tutte" : "/richieste-interne/mie";
  const isTesoreria = puoGestireTesoreria(roles);

  const { data: counts } = useQuery({
    queryKey: ["richieste-interne", "dashboard", uid],
    enabled: !!uid,
    queryFn: async () => {
      const base = supabase.from("richieste_interne").select("id,status,admin_status,requester_id,archived,acconto_richiesto,acconto_stato,title,created_at,type,amount", { count: "exact", head: false }).eq("archived", false);
      const { data, error } = await base;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = counts ?? [];
  const mie = rows.filter((r) => r.requester_id === uid);
  const nMie = mie.length;
  const nMieAttesa = mie.filter((r) => r.status === "pending" || r.status === "forwarded").length;
  const nMieApprovate = mie.filter((r) => r.status === "resp_approved" || r.status === "approved").length;
  const nMieRifiutate = mie.filter((r) => r.status === "rejected").length;

  const nApp1 = rows.filter((r) => r.status === "pending").length;
  const nApp2 = rows.filter((r) => r.status === "forwarded").length;
  const nDaGestire = rows.filter((r) => r.admin_status === "da_gestire" && (r.status === "resp_approved" || r.status === "approved")).length;
  const nBonifici = rows.filter((r) => r.acconto_richiesto && r.acconto_stato === "da_eseguire" && (r.status === "resp_approved" || r.status === "approved")).length;
  const nInGestione = rows.filter((r) => r.admin_status === "in_gestione").length;

  const ultime = [...rows].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 5);

  return (
    <div className="space-y-4 max-w-6xl">
      <IntestazioneRichieste
        indietroA="/"
        stile={STILE_PAGINA.dashboard}
        titolo="Richieste interne"
        sottotitolo="Dashboard delle richieste MADE"
        azioni={(isRichiedente || isAdmin) ? <NuovaRichiestaDialog /> : undefined}
      />

      {/* Card di sezione affiancate da lg: solo quelle visibili dall'utente. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {(isRichiedente || isAdmin) && (
          <SezioneCard titolo="Le mie richieste" griglia="2xl:grid-cols-4">
            <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "tutte" } })} tinta="blu" icona={Inbox} label="Totali" value={nMie} />
            <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "attesa" } })} tinta="ambra" icona={Hourglass} label="In attesa" value={nMieAttesa} />
            <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "approvate" } })} tinta="verde" icona={CheckCircle2} label="Approvate" value={nMieApprovate} />
            <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "rifiutate" } })} tinta="rosso" icona={XCircle} label="Rifiutate" value={nMieRifiutate} />
          </SezioneCard>
        )}

        {(isApp1 || isApp2 || isAdmin) && (
          <SezioneCard titolo="Da approvare">
            {(isApp1 || isAdmin) && <StatCard dest={linkOptions({ to: "/richieste-interne/approva", search: { livello: "responsabile" } })} tinta="ambra" icona={ClipboardList} label="Responsabile" value={nApp1} />}
            {(isApp2 || isAdmin) && <StatCard dest={linkOptions({ to: "/richieste-interne/approva", search: { livello: "direzione" } })} tinta="ambra" icona={ClipboardList} label="Direzione" value={nApp2} />}
          </SezioneCard>
        )}

        {(isGestore || isAdmin) && (
          <SezioneCard titolo="Gestione">
            <StatCard dest={linkOptions({ to: "/richieste-interne/gestione", search: { filtro: "da_gestire" } })} tinta="rosso" icona={Inbox} label="Da gestire" value={nDaGestire} />
            <StatCard dest={linkOptions({ to: "/richieste-interne/gestione", search: { filtro: "in_gestione" } })} tinta="ambra" icona={Wrench} label="In gestione" value={nInGestione} />
          </SezioneCard>
        )}

        {isTesoreria && (
          <SezioneCard titolo="Tesoreria" griglia="grid-cols-1">
            <StatCard dest={linkOptions({ to: "/richieste-interne/tutte", search: { bonifici: "1" } })} tinta="teal" icona={Banknote} label="Bonifici da eseguire" value={nBonifici} />
          </SezioneCard>
        )}
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ultime richieste</h2>
          <Link to={vediTutte} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Vedi tutte</Link>
        </div>
        {ultime.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nessuna richiesta</div>
        ) : (
          <ul className="divide-y">
            {ultime.map((r) => {
              const meta = `${fmtData(r.created_at)} · ${stileTipo(r.type).label}${r.amount != null ? ` · ${fmtEuro(r.amount)}` : ""}`;
              return (
                <li key={r.id}>
                  <Link
                    to="/richieste-interne/$richiestaId"
                    params={{ richiestaId: r.id }}
                    className={cn("flex flex-col gap-1 border-l-4 px-3 py-2 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between", stilePrincipale(r).bordo)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={r.title}>{r.title}</div>
                      <div className="truncate text-xs text-muted-foreground" title={meta}>{meta}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:shrink-0">
                      <BadgeStile stile={stileStatus(r.status)} />
                      {(r.status === "resp_approved" || r.status === "approved") && <BadgeStile stile={stileAdmin(r.admin_status)} />}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const fmtEuro = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtData = (v: string | null) => (v ? new Date(v).toLocaleDateString("it-IT") : "—");

/** Card di sezione: titolo piccolo maiuscolo + riquadri compatti. */
function SezioneCard({ titolo, griglia = "grid-cols-2", children }: { titolo: string; griglia?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-2.5">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</h2>
      <div className={cn("grid grid-cols-2 gap-2", griglia)}>{children}</div>
    </section>
  );
}

function StatCard({ dest, tinta, icona: Icona, label, value }: { dest: LinkOptions; tinta: Tinta; icona: LucideIcon; label: string; value: number }) {
  const t = TINTE[tinta];
  return (
    <Link
      {...dest}
      title={label}
      className={cn(
        "flex min-h-[56px] items-center gap-2 rounded-lg border border-l-4 bg-card p-2.5 transition hover:bg-muted/40",
        t.bordo,
        value === 0 && "opacity-60",
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", t.tinta)}>
        <Icona className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className="block text-xl font-bold tabular-nums leading-tight">{value}</span>
      </span>
    </Link>
  );
}
