import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, CheckCircle2, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isStandalone, detectPlatform } from "@/lib/push";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallaApp() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("App installata!");
      setInstalled(true);
    }
    setDeferredPrompt(null);
  }

  if (platform === "ios") {
    return null;
  }

  if (installed) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="size-5" />
        App installata
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {platform === "android" ? (
              <Smartphone className="size-5" />
            ) : (
              <Monitor className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-base font-semibold">Installa l&apos;app</h3>
            <p className="text-sm text-muted-foreground">
              Aggiungi FidiManager come app sul tuo dispositivo: avrà un&apos;icona
              propria e si aprirà a schermo intero, proprio come un&apos;app.
            </p>
          </div>
        </div>

        {deferredPrompt ? (
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleInstall}
          >
            <Download className="size-5" />
            Installa l&apos;app
          </Button>
        ) : (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Installazione manuale</p>
            <p className="mt-1">
              Nel menu del browser{" "}
              <span className="font-semibold">(⋮)</span> cerca{" "}
              <strong>Installa app</strong> o{" "}
              <strong>Aggiungi a schermata Home</strong>, poi conferma.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
