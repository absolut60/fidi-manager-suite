// Fonte unica: utenti ATTIVI con ruolo recupero_crediti, destinatari delle
// notifiche di recupero (agenzia oltre 60gg, proposte legale da messa in mora ripetuta).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export async function getDestinatariRecuperoCrediti(timeoutMs = 15_000): Promise<string[]> {
  const { data: ruoli, error: eR } = await withTimeout(
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "recupero_crediti" as never),
    timeoutMs,
    "user_roles recupero_crediti",
  );
  if (eR) throw new Error(`user_roles: ${eR.message}`);
  const ids = Array.from(new Set((ruoli ?? []).map((r) => r.user_id).filter(Boolean)));
  if (!ids.length) return [];
  const { data: prof, error: eP } = await withTimeout(
    supabaseAdmin.from("profili").select("id").in("id", ids).eq("attivo", true),
    timeoutMs,
    "profili attivi",
  );
  if (eP) throw new Error(`profili: ${eP.message}`);
  return ((prof ?? []) as Array<{ id: string }>).map((p) => p.id);
}
