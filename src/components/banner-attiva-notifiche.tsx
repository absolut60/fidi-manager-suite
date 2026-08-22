import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  isPushSupported,
  isThisDeviceSubscribed,
  getNotificationPermission,
} from "@/lib/push";

export function BannerAttivaNotifiche() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function ricontrolla() {
      if (!isPushSupported()) {
        setShow(false);
        return;
      }
      const perm = await getNotificationPermission();
      if (perm === "denied") {
        setShow(false);
        return;
      }
      const subscribed = await isThisDeviceSubscribed();
      if (!cancelled) setShow(!subscribed);
    }

    ricontrolla();

    const handler = () => {
      cancelled = false;
      ricontrolla();
    };
    window.addEventListener("push-subscription-changed", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("push-subscription-changed", handler);
    };
  }, []);

  if (!user) return null;
  if (!show) return null;
  if (pathname === "/attiva-notifiche" || pathname === "/il-mio-profilo") return null;

  return (

    <div className="flex flex-wrap items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground sm:px-6">
      <Bell className="size-4 shrink-0" />
      <p className="flex-1 text-sm">
        Attiva le notifiche per non perderti aggiornamenti importanti
      </p>
      <Button asChild size="sm" variant="secondary">
        <Link to="/attiva-notifiche">Configura</Link>
      </Button>
    </div>
  );
}
