import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";

function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/dashboard";
  // Solo path relativi same-origin.
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/login" });
  const target = safeNext(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = target;
    });
  }, [target]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Accesso effettuato");
      // Uso window.location per far girare i loader di rotte con auth-gate
      // (la sessione appena creata è ancora in fase di hydration).
      window.location.href = target;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      const tradotto = msg.includes("Invalid login credentials")
        ? "Credenziali non valide"
        : msg;
      toast.error(tradotto);
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src={`data:image/png;base64,${LOGO_MADE_BASE64}`}
            alt="MADE"
            className="h-12 w-auto mb-3"
          />
          <p className="text-sm text-muted-foreground">FidiManager · Gruppo MADE</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Attendere..." : "Accedi"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          L'accesso è riservato agli utenti invitati da un amministratore.
        </p>


        <p className="text-xs text-muted-foreground text-center mt-6">
          Gestione fidi commerciali per i punti vendita del Gruppo MADE
        </p>
      </Card>
    </div>
  );
}
