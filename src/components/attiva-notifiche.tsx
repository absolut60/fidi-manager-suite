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
} from "@/lib/push";

export function AttivaNotifiche() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [busy, setBusy] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    getNotificationPermission().then((perm) => {
      if (!cancelled) setPermission(perm);
    });

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

  async function handleSubscribe() {
    if (!user) return;
    setBusy(true);
    const res = await subscribeToPush(user.id);
    if (res.ok) {
      setPermission("granted");
      setJustSubscribed(true);
      toast.success("Notifiche attivate");
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
      toast.success("Notifiche disattivate su questo dispositivo");
      const perm = await getNotificationPermission();
      setPermission(perm);
      setJustSubscribed(false);
    } else {
      toast.error(`Impossibile disattivare: ${res.reason ?? "errore"}`);
    }
    setBusy(false);
  }

  if (permission === "granted") {
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
          {justSubscribed && (
            <p className="text-xs text-muted-foreground">
              Riceverai una notifica anche quando l&apos;app è chiusa.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-destructive hover:text-destructive"
            onClick={handleUnsubscribe}
          >
            Disattiva
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (permission === "denied") {
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
          {busy ? "Attivazione..." : "Attiva le notifiche"}
        </Button>
      </CardContent>
    </Card>
  );
}
