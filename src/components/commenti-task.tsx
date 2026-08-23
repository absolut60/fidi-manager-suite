import { useEffect, useId, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
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

export function CommentiTask({
  canaleId,
  userId,
  nomeAutore,
}: {
  canaleId: string;
  userId: string | null;
  nomeAutore: Map<string, string>;
}) {
  const instanceId = useId();
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState("");
  const [invio, setInvio] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
        toast.error("Errore nel caricamento dei commenti");
        return;
      }
      if (active) setMessaggi((data ?? []) as Messaggio[]);
    };
    load();

    if (typeof window === "undefined") return;

    const channel = supabase
      .channel(`task-commenti-${canaleId}-${instanceId}`)
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

  async function invia() {
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
      toast.error("Non fai parte della conversazione di questo task");
      return;
    }
    setTesto("");
    const nuovo = data as Messaggio;
    setMessaggi((prev) => (prev.some((m) => m.id === nuovo.id) ? prev : [...prev, nuovo]));
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {messaggi.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nessun commento. Scrivi il primo!
            </div>
          )}
          {messaggi.map((m) => {
            const mio = m.autore_id === userId;
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
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: it })}
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
              invia();
            }
          }}
          placeholder="Scrivi un commento…"
          rows={2}
          className="resize-none"
        />
        <Button onClick={invia} disabled={!testo.trim() || invio} size="icon">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
