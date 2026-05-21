import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

type Notifica = {
  id: string;
  tipo: string;
  titolo: string;
  messaggio: string | null;
  link: string | null;
  letta: boolean;
  created_at: string;
};

export function NotificationsBell() {
  const { user } = useAuth();
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("notifiche")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (active && data) setNotifiche(data as Notifica[]);
    };
    load();

    const channel = supabase
      .channel(`notifiche-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifiche",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const nonLette = notifiche.filter((n) => !n.letta).length;

  async function segnaLetta(id: string) {
    await supabase.from("notifiche").update({ letta: true }).eq("id", id);
  }

  async function segnaTutteLette() {
    if (!user?.id) return;
    await supabase
      .from("notifiche")
      .update({ letta: true })
      .eq("user_id", user.id)
      .eq("letta", false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {nonLette > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 size-5 p-0 flex items-center justify-center text-[10px]"
            >
              {nonLette > 9 ? "9+" : nonLette}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifiche</div>
          {nonLette > 0 && (
            <Button variant="ghost" size="sm" onClick={segnaTutteLette}>
              <Check className="size-3.5 mr-1" /> Segna tutte lette
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifiche.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nessuna notifica
            </div>
          ) : (
            <ul className="divide-y">
              {notifiche.map((n) => {
                const body = (
                  <div
                    className={`px-4 py-3 hover:bg-muted/50 cursor-pointer ${
                      !n.letta ? "bg-accent/5" : ""
                    }`}
                    onClick={() => {
                      if (!n.letta) segnaLetta(n.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!n.letta && (
                        <div className="size-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{n.titolo}</div>
                        {n.messaggio && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {n.messaggio}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: it,
                          })}
                        </div>
                      </div>
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
      </PopoverContent>
    </Popover>
  );
}
