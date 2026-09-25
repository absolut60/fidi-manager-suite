import { useEffect, useId, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificaRiga } from "@/components/notifiche/notifica-riga";
import { contaNonLette, notificheNonLetteQueryKey, type Notifica } from "@/lib/notifiche";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function playNotificationBeep() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 250);
  } catch {
    // Alcuni browser bloccano l'audio senza interazione utente: ignora silenziosamente.
  }
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Il componente può essere montato più volte (sidebar desktop + drawer mobile):
  // ogni istanza deve avere un topic realtime unico, altrimenti supabase-js riusa
  // il channel già sottoscritto e `.on()` lancia un errore che rompe la pagina.
  const instanceId = useId();
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("notifiche")
        .select("id, tipo, titolo, messaggio, link, letta, conteggio, created_at, aggiornata_at")
        .eq("user_id", user.id)
        .order("aggiornata_at", { ascending: false })
        .limit(30);
      if (active && data) setNotifiche(data as Notifica[]);
    };
    load();
    const refreshTimer = window.setInterval(load, 30_000);

    const channel = supabase
      .channel(`notifiche-realtime-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifiche",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const nuova = payload.new as Notifica;
          if (!nuova?.id) return;

          setNotifiche((prev) => {
            if (prev.some((n) => n.id === nuova.id)) return prev;
            return [nuova, ...prev].slice(0, 30);
          });
          if (!nuova.letta) {
            void queryClient.invalidateQueries({ queryKey: notificheNonLetteQueryKey(user.id) });
          }

          toast(nuova.titolo, {
            description: nuova.messaggio ?? undefined,
            duration: 5000,
            action: nuova.link
              ? {
                  label: "Apri",
                  onClick: () => navigate({ to: nuova.link! }),
                }
              : undefined,
          });

          playNotificationBeep();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifiche",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const atualizada = payload.new as Notifica;
          if (!atualizada?.id) return;

          setNotifiche((prev) => {
            const anterior = prev.find((n) => n.id === atualizada.id);
            // Mudou apenas letta (atualizada_at igual): mantém a posição.
            if (anterior && anterior.aggiornata_at === atualizada.aggiornata_at) {
              return prev.map((n) => (n.id === atualizada.id ? atualizada : n));
            }
            // Novo elemento no grupo (ou fora da lista): sobe para o topo.
            return [atualizada, ...prev.filter((n) => n.id !== atualizada.id)].slice(0, 30);
          });
          if (!atualizada.letta) {
            void queryClient.invalidateQueries({ queryKey: notificheNonLetteQueryKey(user.id) });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, instanceId, queryClient]);

  const { data: nonLette = 0 } = useQuery({
    queryKey: notificheNonLetteQueryKey(user?.id),
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
    queryFn: () => contaNonLette(user?.id ?? ""),
  });

  async function segnaLetta(id: string) {
    const eraNonLetta = notifiche.some((n) => n.id === id && !n.letta);
    const { error } = await supabase.from("notifiche").update({ letta: true }).eq("id", id);
    if (error) throw error;
    setNotifiche((prev) => prev.map((n) => (n.id === id ? { ...n, letta: true } : n)));
    if (eraNonLetta && user?.id) {
      queryClient.setQueryData<number>(notificheNonLetteQueryKey(user.id), (corrente = 0) => Math.max(0, corrente - 1));
    }
  }

  async function segnaTutteLette() {
    if (!user?.id) return;
    const { error } = await supabase
      .from("notifiche")
      .update({ letta: true })
      .eq("user_id", user.id)
      .eq("letta", false);
    if (error) throw error;
    setNotifiche((prev) => prev.map((n) => ({ ...n, letta: true })));
    queryClient.setQueryData(notificheNonLetteQueryKey(user.id), 0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {nonLette > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center px-1 text-[10px]"
            >
              {nonLette > 99 ? "99+" : nonLette}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] p-0 sm:w-96">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifiche</div>
          {nonLette > 0 && (
            <Button variant="ghost" size="sm" onClick={segnaTutteLette}>
              <Check className="size-3.5 mr-1" /> Segna tutte lette
            </Button>
          )}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto">
          {notifiche.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nessuna notifica
            </div>
          ) : (
            <ul className="divide-y">
              {notifiche.map((n) => (
                <li key={n.id}>
                  <NotificaRiga notifica={n} onSegnaLetta={segnaLetta} onAttivata={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-4 py-2 text-center">
          <Button asChild variant="ghost" size="sm" className="min-h-10">
            <Link to="/notifiche" onClick={() => setOpen(false)}>Vedi tutte</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
