import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type Messaggio = {
  id: string;
  canale_id: string;
  autore_id: string;
  testo: string;
  created_at: string;
};

export function CanaleConversazione({ canaleId }: { canaleId: string }) {
  const { user } = useAuth();
  const instanceId = useId();
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: profili } = useQuery({
    queryKey: ["chat", "profili"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profili").select("id, nome, cognome, attivo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nomeAutore = useMemo(() => {
    const map = new Map<string, string>();
    (profili ?? []).forEach((p) => {
      const label = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
      map.set(p.id, label || "—");
    });
    return map;
  }, [profili]);

  useEffect(() => {
    if (!canaleId) {
      setMessaggi([]);
      return;
    }
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("messaggi")
        .select("id, canale_id, autore_id, testo, created_at")
        .eq("canale_id", canaleId)
        .is("eliminato_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        toast.error("Errore nel caricamento dei messaggi");
        return;
      }
      if (active) setMessaggi((data ?? []) as Messaggio[]);
    };
    load();

    if (typeof window === "undefined") return;

    // Topic unico per istanza: altrimenti supabase-js riusa il channel e `.on()` rompe la pagina.
    const channel = supabase
      .channel(`messaggi-${canaleId}-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messaggi",
          filter: `canale_id=eq.${canaleId}`,
        },
        (payload) => {
          const nuovo = payload.new as Messaggio;
          if (!nuovo?.id) return;
          setMessaggi((prev) => (prev.some((m) => m.id === nuovo.id) ? prev : [...prev, nuovo]));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [canaleId, instanceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messaggi.length, canaleId]);

  async function inviaMessaggio() {
    const t = testo.trim();
    if (!t || !canaleId || invio) return;
    setInvio(true);
    const { data, error } = await supabase
      .from("messaggi")
      .insert({ canale_id: canaleId, testo: t })
      .select("id, canale_id, autore_id, testo, created_at")
      .single();
    setInvio(false);
    if (error) {
      toast.error("Impossibile inviare il messaggio");
      return;
    }
    setTesto("");
    const nuovo = data as Messaggio;
    setMessaggi((prev) => (prev.some((m) => m.id === nuovo.id) ? prev : [...prev, nuovo]));
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 max-h-[55vh]">
        <div className="p-4 space-y-3">
          {messaggi.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nessun messaggio. Scrivi il primo!
            </div>
          )}
          {messaggi.map((m) => {
            const mio = m.autore_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    mio ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {!mio && (
                    <div className="text-[11px] font-semibold mb-0.5">
                      {nomeAutore.get(m.autore_id) ?? "—"}
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">{m.testo}</div>
                  <div
                    className={`text-[10px] mt-1 ${
                      mio ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {formatDistanceToNow(new Date(m.created_at), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t p-3 flex items-end gap-2">
        <Textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              inviaMessaggio();
            }
          }}
          placeholder="Scrivi un messaggio…"
          rows={2}
          className="resize-none"
        />
        <Button onClick={inviaMessaggio} disabled={!testo.trim() || invio} size="icon">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
