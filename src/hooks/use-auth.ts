import { useEffect, useState } from "react";
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

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Setup listener PRIMA di getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession?.user) {
        setProfilo(null);
        setRole(null);
      } else {
        // Defer per evitare deadlock
        setTimeout(() => loadUserData(newSession.user.id), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(userId: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profili").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfilo(p as Profilo | null);
    // Prendi il ruolo più alto
    const ordine: AppRole[] = ["amministratore", "approvatore_liv3", "approvatore_liv2", "approvatore_liv1", "store_manager"];
    const ruoli = (r ?? []).map((x) => x.role as AppRole);
    setRole(ordine.find((o) => ruoli.includes(o)) ?? null);
  }

  return { session, user, profilo, role, loading };
}

export const RUOLI_LABEL: Record<AppRole, string> = {
  store_manager: "Store Manager",
  approvatore_liv1: "Approvatore Liv. 1",
  approvatore_liv2: "Approvatore Liv. 2",
  approvatore_liv3: "Approvatore Liv. 3",
  amministratore: "Amministratore",
};
