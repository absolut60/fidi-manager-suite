// Fonte unica (FM59): l'utente ha visibilità limitata al proprio negozio?
// Gemello lato schermo di public.auth_ha_ruolo_globale_clienti() + public.profilo_store_id_corrente():
// nel database chi non ha un ruolo globale vede i clienti del negozio del proprio profilo.
// Qui decide solo i filtri dell'interfaccia (filtro negozio bloccato/nascosto). Se cambia l'elenco SQL, cambia anche questo.
// Documentata in docs/regole/sicurezza-permessi.md.
import { useAuth } from "@/hooks/use-auth";

/** Ruoli di negozio: vedono solo il proprio punto vendita (in futuro altri ruoli di negozio). */
export const RUOLI_NEGOZIO = ["store_manager", "showroom"] as const;

/** Ruoli che vedono tutti i clienti: stesso elenco di public.auth_ha_ruolo_globale_clienti(). */
export const RUOLI_GLOBALI_CLIENTI = [
  "amministratore",
  "direzione",
  "amministrazione",
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "responsabile_agenti",
] as const;

/** Vero se l'utente ha un ruolo di negozio e nessun ruolo globale. */
export function visibilitaLimitataNegozio(roles: readonly string[] | null | undefined): boolean {
  const r = roles ?? [];
  return RUOLI_NEGOZIO.some((x) => r.includes(x)) && !RUOLI_GLOBALI_CLIENTI.some((x) => r.includes(x));
}

export function useVisibilitaLimitataNegozio(): boolean {
  const { roles } = useAuth();
  return visibilitaLimitataNegozio(roles as string[]);
}
