import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export type Profilo = {
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  store_id: string | null;
  codice_agente?: string | null;
  attivo: boolean;
  deve_cambiare_password?: boolean;
  password_cambiata_il?: string | null;
};

/**
 * Fonte unica (FM44): un utente con profilo esplicitamente non attivo non può usare l'app.
 * Profilo assente/in caricamento → non blocca (evita lampeggi; il blocco vero è il ban lato accesso).
 */
export function utenteAttivo(profilo: Pick<Profilo, "attivo"> | null | undefined): boolean {
  return profilo?.attivo !== false;
}

const ORDINE_RUOLI: AppRole[] = ["amministratore", "approvatore_liv3", "approvatore_liv2", "approvatore_liv1", "direzione", "responsabile_agenti", "store_manager", "marketing", "agente", "preventivi_manage", "preventivi_write", "preventivi_read", "approvatore_richieste_liv2", "approvatore_richieste_liv1", "gestore_richieste", "esecutore_richieste", "richiedente", "recupero_crediti"];

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profilo: Profilo | null;
  role: AppRole | null;
  roles: AppRole[];
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (...rs: AppRole[]) => boolean;
  loading: boolean;
  /**
   * Rilegge profilo e ruoli dell'utente corrente. Se `patch` è passato, lo applica subito
   * (aggiornamento ottimistico). Questa rilettura vince sempre su quelle avviate prima
   * (es. quella scatenata da USER_UPDATED dopo updateUser).
   */
  aggiornaProfilo: (patch?: Partial<Profilo>) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  // Contatore delle letture: si applica solo l'ultima avviata (evita che una lettura
  // vecchia, es. quella da USER_UPDATED, sovrascriva un profilo più recente).
  const seqRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const loadRef = useRef<((userId: string) => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    async function loadUserData(userId: string) {
      const seq = ++seqRef.current;
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profili").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (cancelled || seq !== seqRef.current) return;
      setProfilo(p as Profilo | null);
      const ruoliUtente = (r ?? []).map((x) => x.role as AppRole);
      setRoles(ruoliUtente);
      setRole(ORDINE_RUOLI.find((o) => ruoliUtente.includes(o)) ?? null);
    }
    loadRef.current = loadUserData;

    // Listener: filtra eventi — ricarica dati utente SOLO su identity transitions.
    // Ignora TOKEN_REFRESHED (orario + focus tab) e INITIAL_SESSION (su mount) per
    // evitare raffiche di fetch su profili/user_roles.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        userIdRef.current = newSession?.user?.id ?? null;
        if (!newSession?.user) {
          setProfilo(null);
          setRole(null);
          setRoles([]);
          setLoading(false);
        } else {
          // Defer per evitare deadlock con il client Supabase
          setTimeout(() => {
            if (!cancelled) loadUserData(newSession.user.id).finally(() => {
              if (!cancelled) setLoading(false);
            });
          }, 0);
        }
      } else {
        // TOKEN_REFRESHED / INITIAL_SESSION / PASSWORD_RECOVERY / ecc.:
        // aggiorna solo la sessione/user, NON rifare il fetch profili+roles.
        if (newSession !== undefined) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          userIdRef.current = newSession?.user?.id ?? userIdRef.current;
        }
      }
    });

    // Bootstrap: una sola chiamata.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
      userIdRef.current = s?.user?.id ?? null;
      if (s?.user) {
        loadUserData(s.user.id).finally(() => {
          if (!cancelled) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (cancelled) return;
      setSession(null);
      setUser(null);
      setProfilo(null);
      setRole(null);
      setRoles([]);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      loadRef.current = null;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const aggiornaProfilo = useCallback(async (patch?: Partial<Profilo>) => {
    if (patch) {
      // Invalida le letture in corso e applica subito i nuovi valori.
      seqRef.current++;
      setProfilo((prev) => (prev ? { ...prev, ...patch } : prev));
    }
    const uid = userIdRef.current;
    if (uid && loadRef.current) await loadRef.current(uid);
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (...rs: AppRole[]) => rs.some((r) => roles.includes(r));

  const value: AuthContextValue = { session, user, profilo, role, roles, hasRole, hasAnyRole, loading, aggiornaProfilo };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback safe: se per qualche motivo il Provider non è in albero,
    // restituiamo uno stato vuoto invece di crashare. NON deve accadere.
    if (typeof window !== "undefined") {
      console.warn("[useAuth] AuthProvider non montato — restituisco stato vuoto.");
    }
    return {
      session: null,
      user: null,
      profilo: null,
      role: null,
      roles: [] as AppRole[],
      hasRole: () => false,
      hasAnyRole: () => false,
      loading: false,
      aggiornaProfilo: async () => {},
    } satisfies AuthContextValue;
  }
  return ctx;
}

export const RUOLI_LABEL: Record<AppRole, string> = {
  store_manager: "Store Manager",
  approvatore_liv1: "Approvatore Liv. 1",
  approvatore_liv2: "Approvatore Liv. 2",
  approvatore_liv3: "Approvatore Liv. 3",
  amministratore: "Admin",
  amministrazione: "Amministrazione",
  amministrazione_strumenti: "Amministrazione — Strumenti",
  direzione: "Direzione",
  responsabile_agenti: "Responsabile Agenti",
  agente: "Agente",
  marketing: "Marketing",
  richiedente: "Richiedente",
  approvatore_richieste_liv1: "Approvatore Richieste Liv.1",
  approvatore_richieste_liv2: "Approvatore Richieste Liv.2",
  gestore_richieste: "Gestore Richieste",
  esecutore_richieste: "Esecutore Richieste",
  preventivi_read: "Preventivi — Lettura",
  preventivi_write: "Preventivi — Scrittura",
  preventivi_manage: "Preventivi — Gestione",
  marketing_eventi: "Marketing Eventi",
  recupero_crediti: "Recupero crediti",
};

/** Descrizioni brevi opzionali, mostrate sotto l'etichetta nella scelta ruoli. */
export const RUOLI_DESCRIZIONE: Partial<Record<AppRole, string>> = {
  recupero_crediti: "Riceve i promemoria per il passaggio all'agenzia di recupero",
};
