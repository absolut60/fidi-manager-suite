import { supabase } from "@/integrations/supabase/client";

export type Notifica = {
  id: string;
  tipo: string;
  titolo: string;
  messaggio: string | null;
  link: string | null;
  letta: boolean;
  conteggio: number;
  created_at: string;
  aggiornata_at: string;
};

export const notificheNonLetteQueryKey = (userId: string | undefined) => [
  "notifiche",
  "non-lette",
  userId ?? "anonimo",
] as const;

export async function contaNonLette(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifiche")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("letta", false);

  if (error) throw error;
  return count ?? 0;
}

async function registrazioneSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    // getRegistration() risolve subito (undefined se non c'è), a differenza di
    // .ready che non si risolve mai senza un service worker registrato.
    const attesa = navigator.serviceWorker.getRegistration();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
    return (await Promise.race([attesa, timeout])) ?? null;
  } catch {
    return null;
  }
}

/**
 * Chiude sul dispositivo gli avvisi di sistema delle notifiche indicate
 * (tag 'notifica-<id>', come impostato dall'invio push). Mai bloccante.
 */
export async function chiudiAvvisiNotifiche(ids: string[]): Promise<void> {
  try {
    if (ids.length === 0) return;
    const reg = await registrazioneSw();
    if (!reg) return;
    for (const id of ids) {
      const avvisi = await reg.getNotifications({ tag: `notifica-${id}` });
      avvisi.forEach((a) => a.close());
    }
  } catch {
    // non supportato: si ignora
  }
}

/** Chiude tutti gli avvisi di sistema dell'app e azzera il numero sull'icona. Mai bloccante. */
export async function chiudiTuttiGliAvvisi(): Promise<void> {
  // Prima il badge: non dipende dal service worker, quindi funziona anche dove
  // le push non sono mai state attivate.
  try {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    await nav.clearAppBadge?.();
  } catch {
    // non supportato: si ignora
  }
  try {
    const reg = await registrazioneSw();
    if (reg) {
      const avvisi = await reg.getNotifications();
      avvisi.forEach((a) => a.close());
    }
  } catch {
    // non supportato: si ignora
  }
}
