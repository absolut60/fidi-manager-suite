import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { ClienteFatturato } from "@/components/cliente-fatturato";
import { CONSENSO_LABEL } from "@/lib/consensi-testi";
import { Tag, Gauge, HardHat, ShieldCheck } from "lucide-react";

const DASH = "—";

function Stat({ label, value, tone = "default", hint }: { label: string; value: string; tone?: "default" | "destructive" | "success" | "muted"; hint?: string }) {
  const valCls =
    tone === "destructive" ? "text-destructive"
    : tone === "success" ? "text-success"
    : tone === "muted" ? "text-muted-foreground"
    : "";
  return (
    <Card className="px-3 py-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{label}</p>
      <p className={`text-base font-bold mt-0.5 truncate ${valCls}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </Card>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Tag; children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
      <Icon className="size-3.5" /> {children}
    </h3>
  );
}

type ClienteLike = {
  codice_categoria?: string | null;
  categoria?: string | null;
  codice_macrocategoria?: string | null;
  macrocategoria?: string | null;
  codice_agente?: string | null;
  agente?: string | null;
  store_id?: string | null;
  citta?: string | null;
  provincia?: string | null;
  dilazione_concordata?: number | null;
  dilazione_effettiva?: number | null;
  num_insoluti?: number | null;
  condizione_pagamento_desc?: string | null;
  condizioni_pagamento?: string | null;
};

export function ClienteMarketingTab({ clienteId, cliente }: { clienteId: string; cliente: ClienteLike }) {
  const { data, isLoading } = useQuery({
    queryKey: ["cliente-marketing-profilo", clienteId, cliente.store_id ?? null],
    queryFn: async () => {
      const [cantieri, contatti, store] = await Promise.all([
        supabase.from("cantieri").select("id, attivo").eq("cliente_id", clienteId),
        supabase
          .from("contatti")
          .select("id, consenso_marketing_diretto, consenso_marketing_media, consenso_profilazione")
          .eq("cliente_id", clienteId),
        cliente.store_id
          ? supabase.from("stores").select("nome, codice, citta").eq("id", cliente.store_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      if (cantieri.error) throw cantieri.error;
      if (contatti.error) throw contatti.error;
      return {
        cantieri: cantieri.data ?? [],
        contatti: contatti.data ?? [],
        store: (store as any)?.data ?? null,
      };
    },
  });

  const cantieriTot = data?.cantieri.length ?? 0;
  const cantieriAttivi = (data?.cantieri ?? []).filter((c: any) => c.attivo).length;

  const contatti = data?.contatti ?? [];
  const totContatti = contatti.length;
  const conteggi = {
    marketing_diretto: contatti.filter((c: any) => c.consenso_marketing_diretto).length,
    marketing_media: contatti.filter((c: any) => c.consenso_marketing_media).length,
    profilazione: contatti.filter((c: any) => c.consenso_profilazione).length,
  };

  const dilConc = cliente.dilazione_concordata != null ? Number(cliente.dilazione_concordata) : null;
  const dilEff = cliente.dilazione_effettiva != null ? Number(cliente.dilazione_effettiva) : null;
  const sfora = dilConc != null && dilEff != null && dilEff > dilConc;
  const scarto = dilConc != null && dilEff != null ? dilEff - dilConc : null;

  const storeLabel = data?.store
    ? [data.store.codice, data.store.nome].filter(Boolean).join(" — ")
    : cliente.store_id ? DASH : "Nessun punto vendita";

  const luogo = [cliente.citta, cliente.provincia ? `(${cliente.provincia})` : null].filter(Boolean).join(" ") || DASH;

  const categoria = [cliente.codice_categoria, cliente.categoria].filter(Boolean).join(" — ") || DASH;
  const macro = [cliente.codice_macrocategoria, cliente.macrocategoria].filter(Boolean).join(" — ") || DASH;
  const agente = [cliente.codice_agente, cliente.agente].filter(Boolean).join(" — ") || DASH;
  const condPag = cliente.condizione_pagamento_desc || cliente.condizioni_pagamento || DASH;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <SectionTitle icon={Tag}>Classificazione</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Stat label="Categoria" value={categoria} />
          <Stat label="Macrocategoria" value={macro} />
          <Stat label="Agente" value={agente} />
          {isLoading ? <Skeleton className="h-14" /> : <Stat label="Punto vendita" value={storeLabel} />}
          <Stat label="Città / Provincia" value={luogo} />
        </div>
      </section>

      <ClienteFatturato clienteId={clienteId} />

      <section className="space-y-2">
        <SectionTitle icon={Gauge}>Comportamento</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat label="Dilazione concordata" value={dilConc != null ? `${dilConc} gg` : DASH} />
          <Stat
            label="Dilazione effettiva"
            value={dilEff != null ? `${dilEff} gg` : DASH}
            tone={sfora ? "destructive" : dilEff != null ? "success" : "muted"}
            hint={scarto == null ? undefined : scarto > 0 ? `+${scarto} gg oltre l'accordo` : "Nei termini"}
          />
          <Stat
            label="Insoluti storici"
            value={cliente.num_insoluti != null ? String(cliente.num_insoluti) : DASH}
            tone={Number(cliente.num_insoluti ?? 0) > 0 ? "destructive" : "default"}
          />
          <Stat label="Condizione di pagamento" value={condPag} />
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle icon={HardHat}>Presenza commerciale</SectionTitle>
        {isLoading ? (
          <Skeleton className="h-14" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Stat label="Cantieri totali" value={String(cantieriTot)} />
            <Stat label="Cantieri attivi" value={String(cantieriAttivi)} tone={cantieriAttivi > 0 ? "success" : "muted"} />
            <Stat label="Cantieri chiusi" value={String(Math.max(0, cantieriTot - cantieriAttivi))} tone="muted" />
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle icon={ShieldCheck}>Consensi marketing dei contatti</SectionTitle>
        {isLoading ? (
          <Skeleton className="h-14" />
        ) : totContatti === 0 ? (
          <Card className="px-3 py-4 text-sm text-muted-foreground">Nessun contatto registrato per questo cliente.</Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(["marketing_diretto", "marketing_media", "profilazione"] as const).map((k) => (
              <Card key={k} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">{CONSENSO_LABEL[k]}</p>
                  <p className="text-base font-bold mt-0.5 tabular-nums">
                    {conteggi[k]}/{totContatti} <span className="text-xs font-normal text-muted-foreground">contatti</span>
                  </p>
                </div>
                <Badge variant={conteggi[k] > 0 ? "default" : "secondary"}>
                  {conteggi[k] > 0 ? "Attivo" : "Nessuno"}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
