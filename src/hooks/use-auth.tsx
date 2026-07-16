import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  attivo: boolean;
};

const ORDINE_RUOLI: AppRole[] = ["amministratore", "approvatore_liv3", "approvatore_liv2", "approvatore_liv1", "store_manager", "agente", "approvatore_richieste_liv2", "approvatore_richieste_liv1", "gestore_richieste", "esecutore_richieste", "richiedente"];

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profilo: Profilo | null;
  role: AppRole | null;
  roles: AppRole[];
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (...rs: AppRole[]) => boolean;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    async function loadUserData(userId: string) {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profili").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (cancelled) return;
      setProfilo(p as Profilo | null);
      const ruoliUtente = (r ?? []).map((x) => x.role as AppRole);
      setRoles(ruoliUtente);
      setRole(ORDINE_RUOLI.find((o) => ruoliUtente.includes(o)) ?? null);
    }

    // Listener: filtra eventi — ricarica dati utente SOLO su identity transitions.
    // Ignora TOKEN_REFRESHED (orario + focus tab) e INITIAL_SESSION (su mount) per
    // evitare raffiche di fetch su profili/user_roles.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setSession(newSession);
        setUser(newSession?.user ?? null);
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
        }
      }
    });

    // Bootstrap: una sola chiamata.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setUser(s?.user ?? null);
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
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (...rs: AppRole[]) => rs.some((r) => roles.includes(r));

  const value: AuthContextValue = { session, user, profilo, role, roles, hasRole, hasAnyRole, loading };
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
  direzione: "Direzione",
  agente: "Agente",
  richiedente: "Richiedente",
  approvatore_richieste_liv1: "Approvatore Richieste Liv.1",
  approvatore_richieste_liv2: "Approvatore Richieste Liv.2",
  gestore_richieste: "Gestore Richieste",
  esecutore_richieste: "Esecutore Richieste",
};
