import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Mail, Phone, Smartphone, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/contatti")({
  component: ContattiPage,
});

function ContattiPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contatti-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("*, clienti(id, ragione_sociale)")
        .order("principale", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.nome?.toLowerCase().includes(q) ||
      c.cognome?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c as any).clienti?.ragione_sociale?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Contatti</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Referenti collegati ai clienti
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, email o cliente..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">Nessun contatto</p>
            <p className="text-xs text-muted-foreground mt-1">
              I contatti vengono creati dalla scheda di ogni cliente.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <Card key={c.id} className="p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold truncate">{c.nome} {c.cognome}</p>
                  {c.principale && (
                    <Star className="size-3.5 fill-accent text-accent shrink-0" />
                  )}
                </div>
                {c.ruolo && <p className="text-xs text-muted-foreground mb-2">{c.ruolo}</p>}
                {(c as any).clienti && (
                  <Link
                    to="/clienti/$clienteId"
                    params={{ clienteId: (c as any).clienti.id }}
                  >
                    <Badge variant="outline" className="mb-3 hover:bg-muted text-xs">
                      {(c as any).clienti.ragione_sociale}
                    </Badge>
                  </Link>
                )}
                <div className="space-y-1 text-xs">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Mail className="size-3" /> <span className="truncate">{c.email}</span>
                    </a>
                  )}
                  {c.telefono && (
                    <a href={`tel:${c.telefono}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Phone className="size-3" /> {c.telefono}
                    </a>
                  )}
                  {c.cellulare && (
                    <a href={`tel:${c.cellulare}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <Smartphone className="size-3" /> {c.cellulare}
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
