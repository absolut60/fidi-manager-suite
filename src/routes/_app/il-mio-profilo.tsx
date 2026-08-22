import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { BellRing, HelpCircle, KeyRound, Monitor, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AttivaNotifiche } from "@/components/attiva-notifiche";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isThisDeviceSubscribed } from "@/lib/push";

export const Route = createFileRoute("/_app/il-mio-profilo")({
  component: IlMioProfiloPage,
});

type Dispositivo = {
  id: string;
  platform: string | null;
  user_agent: string | null;
  device_label?: string | null;
  created_at: string;
  last_used_at: string | null;
};

function etichettaDispositivo(d: Dispositivo): string {
  if (d.device_label) return d.device_label;
  const ua = d.user_agent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
  return "Dispositivo";
}

function IconaPiattaforma({ platform }: { platform: string | null }) {
  if (platform === "ios" || platform === "android") return <Smartphone className="size-4" />;
  if (platform === "desktop") return <Monitor className="size-4" />;
  return <HelpCircle className="size-4" />;
}

function IlMioProfiloPage() {
  const { user, profilo } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const { data: dispositivi = [], isLoading } = useQuery({
    queryKey: ["push-subscriptions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, platform, user_agent, device_label, created_at, last_used_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Dispositivo[];
    },
  });

  const rimuovi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("push_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dispositivo rimosso");
      queryClient.invalidateQueries({ queryKey: ["push-subscriptions", userId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [testAvailable, setTestAvailable] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    isThisDeviceSubscribed().then((on) => {
      if (mounted) setTestAvailable(on);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function inviaNotificaDiProva() {
    if (!user?.id) return;
    setTestBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Sessione non valida, rientra");
        return;
      }
      const res = await fetch("/api/public/invia-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          title: "Notifica di prova",
          body: "Se vedi questo messaggio, le notifiche funzionano.",
          url: "/il-mio-profilo",
          tag: "test-notifica",
        }),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.ok) {
        if (out.sent > 0) {
          toast.success(`Notifica inviata a ${out.sent} dispositivo/i. Controlla tra qualche secondo.`);
        } else {
          toast.info("Nessun dispositivo attivo trovato. Riattiva le notifiche.");
        }
      } else {
        toast.error(`Errore invio: ${out?.error ?? res.status}`);
      }
    } finally {
      setTestBusy(false);
    }
  }

  async function cambiaPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) {
      setErrore("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (pwd !== pwd2) {
      setErrore("Le due password non coincidono.");
      return;
    }
    setErrore(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password aggiornata");
    setPwd("");
    setPwd2("");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Il mio profilo</h1>
        <p className="text-sm text-muted-foreground">
          {profilo?.nome} {profilo?.cognome}
        </p>
      </div>

      <AttivaNotifiche />

      {testAvailable && (
        <Button
          variant="outline"
          disabled={testBusy}
          onClick={inviaNotificaDiProva}
          className="w-full sm:w-auto"
        >
          <Send className="size-4" />
          Invia notifica di prova
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dispositivi collegati</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Caricamento…</div>
          ) : dispositivi.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nessun dispositivo collegato. Attiva le notifiche qui sopra.
            </div>
          ) : (
            <ul className="divide-y">
              {dispositivi.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <IconaPiattaforma platform={d.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{etichettaDispositivo(d)}</div>
                    <div className="text-xs text-muted-foreground">
                      Registrato il {format(new Date(d.created_at), "d MMMM yyyy", { locale: it })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Rimuovi dispositivo"
                    disabled={rimuovi.isPending}
                    onClick={() => rimuovi.mutate(d.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambia password</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={cambiaPassword}>
            <div className="space-y-2">
              <Label htmlFor="pwd">Nuova password</Label>
              <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd2">Conferma nuova password</Label>
              <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            </div>
            {errore && <p className="text-sm text-destructive">{errore}</p>}
            <Button type="submit" disabled={busy}>
              <KeyRound className="size-4" />
              Aggiorna password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
