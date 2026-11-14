import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { vistaIncorporata } from "@/lib/vista-incorporata";
import { formatDate } from "@/lib/fidi";
import { STATO_LABEL, type StatoOpportunita } from "@/lib/opportunita";
import type { StatoPreventivo } from "@/lib/preventivi-api";
import { BadgeStato } from "@/components/preventivatore/BadgeTestata";
import { RiquadroAnagrafica } from "@/components/ui/riquadro-anagrafica";
import { Button } from "@/components/ui/button";

export function CollegamentiCantiere({ cantiereId, onChiudi }: { cantiereId: string; onChiudi: () => void }) {
  const navigate = useNavigate();
  const router = useRouter();
  const incorporata = vistaIncorporata(useSearch({ strict: false }));
  const preventivi = useQuery({
    queryKey: ["cantiere-preventivi", cantiereId],
    queryFn: async () => {
      const righe = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase.from("preventivi")
          .select("id, numero, titolo, stato, data").eq("cantiere_id", cantiereId)
          .order("data", { ascending: false }).order("id").range(da, da + 999);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 1000) return righe;
      }
    },
  });
  const opportunita = useQuery({
    queryKey: ["cantiere-opportunita", cantiereId],
    queryFn: async () => {
      const righe = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase.from("opportunita")
          .select("id, titolo, stato, created_at").eq("cantiere_id", cantiereId)
          .order("created_at", { ascending: false }).order("id").range(da, da + 999);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 1000) return righe;
      }
    },
  });

  function apri(tipo: "preventivo" | "opportunita", id: string) {
    const destinazione = tipo === "preventivo"
      ? { to: "/preventivatore/$id" as const, params: { id } }
      : { to: "/opportunita/$opportunitaId" as const, params: { opportunitaId: id } };
    if (incorporata) {
      window.open(router.buildLocation(destinazione).href, "_blank", "noopener,noreferrer");
      onChiudi();
    } else {
      onChiudi();
      void navigate(destinazione);
    }
  }

  return (
    <RiquadroAnagrafica tono="azzurro" className="p-3 sm:p-3 space-y-3">
      <h3 className="text-sm font-semibold">Collegato a</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section className="min-w-0 space-y-1">
          <h4 className="text-xs font-semibold">Preventivi</h4>
          {preventivi.isPending ? <p className="text-xs text-muted-foreground">Caricamento…</p>
            : preventivi.isError ? <p className="text-xs text-destructive">Preventivi non disponibili</p>
            : !preventivi.data?.length ? <p className="text-xs text-muted-foreground">Nessun preventivo</p>
            : preventivi.data.map((p) => (
              <Button key={p.id} type="button" variant="ghost" onClick={() => apri("preventivo", p.id)}
                className="h-auto min-h-10 w-full min-w-0 justify-start px-2 py-2 text-left text-xs font-normal">
                <span className="min-w-0 w-full space-y-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-mono">{p.numero ?? "—"}</span><BadgeStato stato={p.stato as StatoPreventivo} /></span>
                  <span className="block break-words whitespace-normal">{p.titolo || "Senza titolo"}</span>
                  <span className="block text-muted-foreground">{formatDate(p.data)}</span>
                </span>
              </Button>
            ))}
        </section>
        <section className="min-w-0 space-y-1">
          <h4 className="text-xs font-semibold">Opportunità</h4>
          {opportunita.isPending ? <p className="text-xs text-muted-foreground">Caricamento…</p>
            : opportunita.isError ? <p className="text-xs text-destructive">Opportunità non disponibili</p>
            : !opportunita.data?.length ? <p className="text-xs text-muted-foreground">Nessuna opportunità</p>
            : opportunita.data.map((o) => (
              <Button key={o.id} type="button" variant="ghost" onClick={() => apri("opportunita", o.id)}
                className="h-auto min-h-10 w-full min-w-0 justify-start px-2 py-2 text-left text-xs font-normal">
                <span className="min-w-0 w-full space-y-1">
                  <span className="block break-words whitespace-normal">{o.titolo}</span>
                  <span className="block text-muted-foreground">{STATO_LABEL[o.stato as StatoOpportunita] ?? o.stato} · {formatDate(o.created_at)}</span>
                </span>
              </Button>
            ))}
        </section>
      </div>
    </RiquadroAnagrafica>
  );
}