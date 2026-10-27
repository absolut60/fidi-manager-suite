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
    <div className="space-y-6">
      <IntestazioneRichieste
        stile={STILE_PAGINA.dashboard}
        titolo="Richieste interne"
        sottotitolo="Dashboard delle richieste MADE"
        azioni={(isRichiedente || isAdmin) ? <NuovaRichiestaDialog /> : undefined}
      />

      {(isRichiedente || isAdmin) && (
        <Sezione titolo="Le mie richieste">
          <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "tutte" } })} tinta="blu" icona={Inbox} label="Totali" value={nMie} />
          <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "attesa" } })} tinta="ambra" icona={Hourglass} label="In attesa" value={nMieAttesa} />
          <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "approvate" } })} tinta="verde" icona={CheckCircle2} label="Approvate" value={nMieApprovate} />
          <StatCard dest={linkOptions({ to: "/richieste-interne/mie", search: { stato: "rifiutate" } })} tinta="rosso" icona={XCircle} label="Rifiutate" value={nMieRifiutate} />
        </Sezione>
      )}

      {(isApp1 || isApp2 || isAdmin) && (
        <Sezione titolo="Approvazioni">
          {(isApp1 || isAdmin) && <StatCard dest={linkOptions({ to: "/richieste-interne/approva", search: { livello: "responsabile" } })} tinta="ambra" icona={ClipboardList} label="Da approvare — Responsabile" value={nApp1} />}
          {(isApp2 || isAdmin) && <StatCard dest={linkOptions({ to: "/richieste-interne/approva", search: { livello: "direzione" } })} tinta="ambra" icona={ClipboardList} label="Da approvare — Direzione" value={nApp2} />}
        </Sezione>
      )}

      {(isGestore || isAdmin) && (
        <Sezione titolo="Gestione">
          <StatCard dest={linkOptions({ to: "/richieste-interne/gestione", search: { filtro: "da_gestire" } })} tinta="rosso" icona={Inbox} label="Da gestire" value={nDaGestire} />
          <StatCard dest={linkOptions({ to: "/richieste-interne/gestione", search: { filtro: "in_gestione" } })} tinta="ambra" icona={Wrench} label="In gestione" value={nInGestione} />
        </Sezione>
      )}

      {isTesoreria && (
        <Sezione titolo="Tesoreria">
          <StatCard dest={linkOptions({ to: "/richieste-interne/tutte", search: { bonifici: "1" } })} tinta="teal" icona={Banknote} label="Bonifici da eseguire" value={nBonifici} />
        </Sezione>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ultime richieste</h2>
          <Link to={vediTutte} className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">Vedi tutte</Link>
        </div>
        {ultime.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Nessuna richiesta</div>
        ) : (
          <ul className="space-y-2">
            {ultime.map((r) => (
              <li key={r.id}>
                <Link
                  to="/richieste-interne/$richiestaId"
                  params={{ richiestaId: r.id }}
                  className={cn("flex flex-col gap-2 rounded-lg border border-l-4 bg-card p-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between", stilePrincipale(r).bordo)}
                >
                  <div className="min-w-0">
                    <div className="font-medium break-words line-clamp-2">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtData(r.created_at)} · {stileTipo(r.type).label}{r.amount != null ? ` · ${fmtEuro(r.amount)}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:shrink-0">
                    <BadgeStile stile={stileStatus(r.status)} />
                    {(r.status === "resp_approved" || r.status === "approved") && <BadgeStile stile={stileAdmin(r.admin_status)} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const fmtEuro = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
const fmtData = (v: string | null) => (v ? new Date(v).toLocaleDateString("it-IT") : "—");

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titolo}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">{children}</div>
    </section>
  );
}

function StatCard({ dest, tinta, icona: Icona, label, value }: { dest: LinkOptions; tinta: Tinta; icona: LucideIcon; label: string; value: number }) {
  const t = TINTE[tinta];
  return (
    <Link
      {...dest}
      className={cn(
        "flex min-h-[72px] items-center gap-2 sm:gap-3 rounded-lg border border-l-4 bg-card p-3 sm:p-4 transition hover:bg-muted/40",
        t.bordo,
        value === 0 && "opacity-60",
      )}
    >
      <span className={cn("flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full", t.tinta)}>
        <Icona className="size-4 sm:size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs sm:text-sm font-medium text-muted-foreground break-words">{label}</span>
        <span className="block text-2xl sm:text-3xl font-bold tabular-nums leading-tight">{value}</span>
      </span>
    </Link>
  );
}
