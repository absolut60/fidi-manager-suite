import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import { supabase } from "@/integrations/supabase/client";
import type { BloccoConRighe } from "@/lib/preventivi-api";

export const Route = createFileRoute("/verifica-fm65")({ component: Campione });
function Campione() {
  const { data = [] } = useQuery({ queryKey: ["preventivo", "campione"], queryFn: async () => {
    const { data, error } = await supabase.from("righe_preventivo").select("*").eq("blocco_id", "campione");
    if (error) throw error;
    return data ?? [];
  } });
  const blocco = { id: "campione", quantita_base: 20, righe: data } as BloccoConRighe;
  return <main className="mx-auto max-w-7xl p-2"><RigheTable blocco={blocco} preventivoId="campione" fascia="A" clienteId={null} /></main>;
}