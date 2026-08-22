import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Share, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
  isStandalone,
  detectPlatform,
  getNotificationPermission,
  isThisDeviceSubscribed,
} from "@/lib/push";

export function AttivaNotifiche() {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      const perm = await getNotificationPermission();
      if (perm === "denied") {
        if (!cancelled) setDenied(true);
        if (!cancelled) setSubscribed(false);
        return;
      }
      const active = await isThisDeviceSubscribed();
      if (!cancelled) setSubscribed(active);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const platform = detectPlatform();
  const standalone = isStandalone();

  if (platform === "ios" && !standalone) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-5" /> Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-md bg-muted p-3 text-sm">
            <Share className="size-5 shrink-0 mt-0.5" />
            <p>
              Per ricevere le notifiche su iPhone: tocca il pulsante{" "}
              <strong>Condividi</strong> (icona quadrata con freccia) in basso
              in Safari, poi <strong>Aggiungi a Home</strong>. Apri FidiManager
              dall&apos;icona sulla schermata Home e torna qui.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isPushSupported()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-5" /> Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Le notifiche non sono supportate su questo browser/dispositivo.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (denied) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-5" /> Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <ShieldAlert className="size-5 shrink-0" />
            <p>
              Hai bloccato le notifiche per questo sito. Per riattivarle devi
              sbloccarle dalle impostazioni del browser/dispositivo.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (subscribed === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-5" /> Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Verifica in corso…</p>
        </CardContent>
      </Card>
    );
  }

  async function handleSubscribe() {
    if (!user) return;
    setBusy(true);
    const res = await subscribeToPush(user.id);
    if (res.ok) {
      setSubscribed(true);
      toast.success("Notifiche attivate");
      window.dispatchEvent(new Event("push-subscription-changed"));
    } else {
      const reasonMap: Record<string, string> = {
        denied: "Permesso negato",
        unsupported: "Non supportato",
        "no-sw": "Service worker non disponibile",
      };
      toast.error(reasonMap[res.reason] ?? res.reason);
    }
    setBusy(false);
  }

  async function handleUnsubscribe() {
    setBusy(true);
    const res = await unsubscribeFromPush();
    if (res.ok) {
      setSubscribed(false);
      toast.success("Notifiche disattivate su questo dispositivo");
      window.dispatchEvent(new Event("push-subscription-changed"));
    } else {
      toast.error(`Impossibile disattivare: ${res.reason ?? "errore"}`);
    }
    setBusy(false);
  }

  if (subscribed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="size-5 text-green-600" /> Notifiche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <Bell className="size-4" />
            Notifiche attive su questo dispositivo
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-destructive hover:text-destructive"
            onClick={handleUnsubscribe}
            disabled={busy}
          >
            {busy ? "Disattivazione…" : "Disattiva"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-5" /> Notifiche
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Attiva le notifiche push per ricevere aggiornamenti anche con
          l&apos;app chiusa.
        </p>
        <Button
          onClick={handleSubscribe}
          disabled={busy}
          className="gap-2"
        >
          <Bell className="size-4" />
          {busy ? "Attivazione…" : "Attiva le notifiche"}
        </Button>
      </CardContent>
    </Card>
  );
}
