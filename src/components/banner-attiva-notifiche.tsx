import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
    if (!user) {
      setShow(false);
      return;
    }

    let cancelled = false;

    async function ricontrolla() {
      if (!isPushSupported()) {
        if (!cancelled) setShow(false);
        return;
      }
      const perm = await getNotificationPermission();
      if (perm === "denied") {
        if (!cancelled) setShow(false);
        return;
      }

      const subscribedThisDevice = await isThisDeviceSubscribed();
      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      const haQualcheDispositivo = (count ?? 0) > 0;

      if (!cancelled) {
        setShow(!subscribedThisDevice && !haQualcheDispositivo);
      }
    }

    ricontrolla();

    const handler = () => {
      cancelled = false;
      ricontrolla();
    };
    window.addEventListener("push-subscription-changed", handler);
    window.addEventListener("focus", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("push-subscription-changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, [user?.id]);

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

