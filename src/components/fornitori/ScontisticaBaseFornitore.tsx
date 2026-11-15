import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCascata, parseCascata } from "@/lib/leve-prezzo-showroom";

/** FM75 F5b: scontistica di base della scheda fornitore (cascata, proposta sulle righe showroom). */
export function ScontisticaBaseFornitore({ fornitoreId }: { fornitoreId: string }) {
  const qc = useQueryClient();
  const chiave = ["fornitore-sconti-base", fornitoreId];
  const q = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const { data, error } = await supabase.from("fornitori").select("sconti_base").eq("id", fornitoreId).maybeSingle();
      if (error) throw error;
      return data?.sconti_base ?? null;
    },
  });
  const salvato = formatCascata(q.data);
  const [testo, setTesto] = useState("");
  useEffect(() => setTesto(salvato), [salvato]);
  const cascata = parseCascata(testo);
  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("fornitori")
        .update({ sconti_base: cascata && cascata.length ? cascata : null }).eq("id", fornitoreId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Non hai i permessi per modificare la scontistica di questo fornitore");
    },
    onSuccess: async () => { toast.success("Scontistica di base salvata"); await qc.invalidateQueries({ queryKey: chiave }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (cascata && !mutation.isPending) mutation.mutate(); }}>
      <Input aria-label="Scontistica di base" placeholder="-45+5" value={testo} disabled={q.isLoading || mutation.isPending}
        onChange={(e) => setTesto(e.target.value)} />
      <p className={cascata === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {cascata === null ? "Formato non valido: scrivi ad esempio -45+5 (meno = sconto, più = maggiorazione)" : "Meno = sconto, più = maggiorazione. Proposta sulle righe Showroom, sempre ritoccabile."}
      </p>
      <Button type="submit" disabled={cascata === null || mutation.isPending || testo.trim() === salvato} className="min-h-10 w-full sm:w-auto">
        <Save className="mr-2 size-4" />{mutation.isPending ? "Salvataggio…" : "Salva scontistica"}
      </Button>
    </form>
  );
}
