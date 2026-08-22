import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Plus, UserPlus, Upload, Bell, Check, CheckCheck, CalendarClock, HandCoins, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

type Notifica = {
  id: string;
  tipo: string;
  titolo: string;
  messaggio: string | null;
  link: string | null;
  letta: boolean;
  created_at: string;
};

const STATI_RICHIESTA_APERTE = [
  "in_approvazione", "in_attesa_liv1", "in_attesa_liv2", "in_attesa_liv3", "integrazioni_richieste",
];

function oggiISO() {
  return new Date().toISOString().slice(0, 10);
}
function traNGiorniISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function DashboardPage() {
  const { profilo, role, user } = useAuth();
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);

  // Contatori operativi (query leggere di solo conteggio)
  const { data: contatori } = useQuery({
    queryKey: ["home-contatori"],
    queryFn: async () => {
      const [richieste, rate, reminders] = await Promise.all([
        supabase.from("richieste_fido").select("id", { count: "exact", head: true })
          .in("stato", STATI_RICHIESTA_APERTE as never),
        supabase.from("piani_rientro_rate").select("id", { count: "exact", head: true })
          .eq("stato", "da_pagare").lte("data_rata", traNGiorniISO(7)),
        supabase.from("reminder").select("id", { count: "exact", head: true })
          .lte("data_reminder", oggiISO()),
      ]);
      return {
        richiesteDaApprovare: richieste.count ?? 0,
        rateInScadenza: rate.count ?? 0,
        promemoriaOggi: reminders.count ?? 0,
      };
    },
  });

  // Notifiche dell'utente
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("notifiche")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active && data) setNotifiche(data as Notifica[]);
    };
    load();
    const t = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(t); };
  }, [user?.id]);

  const nonLette = notifiche.filter((n) => !n.letta).length;

  async function segnaLetta(id: string) {
    await supabase.from("notifiche").update({ letta: true }).eq("id", id);
    setNotifiche((prev) => prev.map((n) => (n.id === id ? { ...n, letta: true } : n)));
  }
  async function segnaTutteLette() {
    if (!user?.id) return;
    await supabase.from("notifiche").update({ letta: true }).eq("user_id", user.id).eq("letta", false);
    setNotifiche((prev) => prev.map((n) => ({ ...n, letta: true })));
  }

  return (
    <div className="space-y-6">
      {/* Header + azioni */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Ciao {profilo?.nome ?? ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role ? RUOLI_LABEL[role] : "—"} · La tua panoramica operativa
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/richieste"><Plus className="size-4" /> Nuova richiesta</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/clienti"><UserPlus className="size-4" /> Nuovo cliente</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/import-export"><Upload className="size-4" /> Importa</Link>
          </Button>
        </div>
      </div>

      {/* Contatori operativi cliccabili */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ContatoreCard
          to="/approvazioni"
          icon={CheckCheck}
          label="Richieste da approvare"
          valore={contatori?.richiesteDaApprovare}
          tone={contatori && contatori.richiesteDaApprovare > 0 ? "attn" : "muted"}
        />
        <ContatoreCard
          to="/piani-rientro"
          icon={HandCoins}
          label="Rate in scadenza (7 gg)"
          valore={contatori?.rateInScadenza}
          tone={contatori && contatori.rateInScadenza > 0 ? "attn" : "muted"}
        />
        <ContatoreCard
          to="/recupero-crediti-promemoria"
          icon={CalendarClock}
          label="Promemoria di oggi"
          valore={contatori?.promemoriaOggi}
          tone={contatori && contatori.promemoriaOggi > 0 ? "attn" : "muted"}
        />
        <ContatoreCard
          to="#feed-notifiche"
          icon={Bell}
          label="Notifiche non lette"
          valore={nonLette}
          tone={nonLette > 0 ? "primary" : "muted"}
          isAnchor
        />
      </div>

      {/* Feed notifiche */}
      <Card className="p-0 overflow-hidden" id="feed-notifiche">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Bell className="size-4" /> Notifiche
          </h2>
          {nonLette > 0 && (
            <Button variant="ghost" size="sm" onClick={segnaTutteLette}>
              <Check className="size-3.5 mr-1" /> Segna tutte lette
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[28rem]">
          {notifiche.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nessuna notifica al momento.
            </div>
          ) : (
            <ul className="divide-y">
              {notifiche.map((n) => {
                const body = (
                  <div
                    className={`px-5 py-3 hover:bg-muted/50 cursor-pointer ${!n.letta ? "bg-accent/5" : ""}`}
                    onClick={() => { if (!n.letta) segnaLetta(n.id); }}
                  >
                    <div className="flex items-start gap-2">
                      {!n.letta && <div className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{n.titolo}</div>
                        {n.messaggio && (
                          <div className="text-xs text-muted-foreground mt-0.5">{n.messaggio}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
                        </div>
                      </div>
                      {n.link && <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? <Link to={n.link}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}

function ContatoreCard({
  to, icon: Icon, label, valore, tone = "muted", isAnchor,
}: {
  to: string;
  icon: typeof Bell;
  label: string;
  valore: number | undefined;
  tone?: "attn" | "primary" | "muted";
  isAnchor?: boolean;
}) {
  const ring =
    tone === "attn" ? "border-amber-400/50" : tone === "primary" ? "border-primary/40" : "border-border";
  const numColor =
    tone === "attn" ? "text-amber-600 dark:text-amber-500" : tone === "primary" ? "text-primary" : "text-foreground";

  const inner = (
    <Card className={`p-4 flex items-start justify-between transition hover:shadow-md ${ring}`}>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-3xl font-bold mt-2 ${numColor}`}>{valore ?? "—"}</div>
      </div>
      <Icon className="size-5 text-muted-foreground" />
    </Card>
  );

  if (isAnchor) return <a href={to} className="block">{inner}</a>;
  return <Link to={to} className="block">{inner}</Link>;
}
