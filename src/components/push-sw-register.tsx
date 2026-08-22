import { useEffect } from "react";
import {
  isPushSupported,
  registerServiceWorker,
} from "@/lib/push";

export function PushSwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPushSupported()) return;

    (async () => {
      try {
        await registerServiceWorker();
      } catch (e) {
        console.error("[push-sw-register] registrazione service worker fallita", e);
      }
    })();
  }, []);

  return null;
}
