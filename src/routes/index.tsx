import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Portale operativo MADE | FidiManager" },
    { name: "description", content: "Accesso al portale operativo MADE Distribuzione." },
    { property: "og:title", content: "Portale operativo MADE | FidiManager" },
    { property: "og:description", content: "Accesso al portale operativo MADE Distribuzione." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      throw redirect({ to: "/login" });
    }
    const { data: { session } } = await supabase.auth.getSession();
    throw redirect({ to: session ? "/dashboard" : "/login" });
  },
  component: () => (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      Caricamento...
    </div>
  ),
});
