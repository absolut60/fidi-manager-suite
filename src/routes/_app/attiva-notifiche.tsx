import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, BellRing, Share, CheckCircle2, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InstallaApp } from "@/components/installa-app";
import {
  isPushSupported,
  isStandalone,
  detectPlatform,
  getNotificationPermission,
  isThisDeviceSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

export const Route = createFileRoute("/_app/attiva-notifiche")({
  head: () => ({
    meta: [
      { title: "Attiva le notifiche · FidiManager" },
      {
        name: "description",
        content:
          "Procedura guidata per attivare le notifiche push di FidiManager su questo dispositivo.",
      },
      { property: "og:title", content: "Attiva le notifiche · FidiManager" },
      {
        property: "og:description",
        content:
          "Procedura guidata per attivare le notifiche push di FidiManager su questo dispositivo.",
      },
    ],
  }),
  component: AttivaNotifichePage,
});

function Passo({
  numero,
  titolo,
  children,
  stato = "attivo",
}: {
  numero: number;
  titolo: string;
  children?: ReactNode;
  stato?: "attivo" | "disabilitato" | "fatto";
}) {
  const disabilitato = stato === "disabilitato";
  return (
    <Card className={disabilitato ? "opacity-60" : undefined}>
      <CardContent className="flex gap-4 p-5">
        <div
          className={
            "flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold " +
            (stato === "fatto"
              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
              : disabilitato
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground")
          }
        >
          {stato === "fatto" ? <CheckCircle2 className="size-5" /> : numero}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-base font-semibold">{titolo}</h2>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function AttivaNotifichePage() {
  const { user } = useAuth();
  const [pronto, setPronto] = useState(false);
  const [platform, setPlatform] = useState<
    "ios" | "android" | "desktop" | null
  >(null);
  const [standalone, setStandalone] = useState(false);
  const [supportato, setSupportato] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [thisDeviceOn, setThisDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function ricarica() {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
    setSupportato(isPushSupported());
    setPermission(await getNotificationPermission());
    setThisDeviceOn(await isThisDeviceSubscribed());
    setPronto(true);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const [perm, sub] = await Promise.all([
        getNotificationPermission(),
        isThisDeviceSubscribed(),
      ]);
      if (cancelled) return;
      setPlatform(detectPlatform());
      setStandalone(isStandalone());
      setSupportato(isPushSupported());
      setPermission(perm);
      setThisDeviceOn(sub);
      setPronto(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAttiva() {
    if (!user) return;
    setBusy(true);
    const res = await subscribeToPush(user.id);
    if (res.ok) {
      setDone(true);
      setThisDeviceOn(true);
      setPermission("granted");
      toast.success("Notifiche attivate!");
    } else {
      toast.error(
        res.reason === "denied"
          ? "Hai negato il permesso. Sbloccalo dalle impostazioni del dispositivo"
          : res.reason,
      );
    }
    setBusy(false);
  }

  async function handleDisattiva() {
    setBusy(true);
    await unsubscribeFromPush();
    setDone(false);
    await ricarica();
    setBusy(false);
  }

  const iosNonInstallato = platform === "ios" && !standalone;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 py-4">
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Attiva le notifiche
        </h1>
        <p className="text-muted-foreground">
          Bastano pochi secondi. Ti guido io.
        </p>
      </header>

      {!pronto ? null : thisDeviceOn ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            <BellRing className="size-7 shrink-0" />
            <p className="text-base font-medium">
              Le notifiche sono già attive su questo dispositivo ✓
            </p>
          </div>
          <Button variant="outline" onClick={handleDisattiva} disabled={busy}>
            Disattiva su questo dispositivo
          </Button>
        </div>
      ) : iosNonInstallato ? (
        <div className="space-y-4">
          <Passo numero={1} titolo="Installa l'app sul telefono">
            <div className="flex items-start gap-3 rounded-md bg-muted p-3 text-sm">
              <Share className="mt-0.5 size-5 shrink-0" />
              <p>
                Tocca <strong>Condividi</strong> in basso in Safari, poi{" "}
                <strong>Aggiungi a Home</strong>. Apri FidiManager
                dall&apos;icona e torna qui.
              </p>
            </div>
          </Passo>
          <Passo numero={2} titolo="Attiva le notifiche" stato="disabilitato">
            <p className="text-sm text-muted-foreground">
              Prima completa il passo 1.
            </p>
          </Passo>
        </div>
      ) : !supportato ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Questo dispositivo/browser non supporta le notifiche.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {standalone ? (
            <Passo numero={1} titolo="App installata" stato="fatto">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4" />
                FidiManager è installato come app su questo dispositivo.
              </p>
            </Passo>
          ) : platform === "android" || platform === "desktop" ? (
            <Passo numero={1} titolo="Installa l'app">
              <InstallaApp />
            </Passo>
          ) : (
            <Passo numero={1} titolo="App pronta" stato="fatto">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Smartphone className="size-4" />
                Questo dispositivo è pronto per ricevere le notifiche.
              </p>
            </Passo>
          )}

          <Passo
            numero={2}
            titolo="Attiva le notifiche"
            stato={standalone ? "attivo" : "disabilitato"}
          >
            {standalone ? (
              permission === "denied" ? (
                <p className="text-sm text-destructive">
                  Hai negato il permesso. Sbloccalo dalle impostazioni del
                  dispositivo, poi torna qui.
                </p>
              ) : (
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={handleAttiva}
                  disabled={busy}
                >
                  <Bell className="size-5" />
                  {busy ? "Attivazione..." : "Attiva ora"}
                </Button>
              )
            ) : (
              <p className="text-sm text-muted-foreground">
                Prima completa il passo 1.
              </p>
            )}
          </Passo>

          {done && (
            <Passo numero={3} titolo="Fatto!" stato="fatto">
              <p className="text-sm text-green-700 dark:text-green-400">
                Sei attivo. Riceverai le notifiche anche con l&apos;app chiusa.
              </p>
            </Passo>
          )}
        </div>
      )}

      <div className="text-center">
        <Link
          to="/dashboard"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Torna alla dashboard
        </Link>
      </div>
    </div>
  );
}
