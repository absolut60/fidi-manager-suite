import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export type StatoConsensi = {
  trattamento_dati: boolean;
  whatsapp: boolean;
  email: boolean;
};

/**
 * Stato canonico dei consensi per un elenco di contatti.
 * Fonte unica: RPC get_stato_consensi (consensi_log + marketing_opt_out).
 */
export function useStatoConsensi(contattoIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(contattoIds.filter((v): v is string => !!v))).sort();
  return useQuery({
    queryKey: ["stato-consensi", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_stato_consensi", { _contatto_ids: ids });
      if (error) throw error;
      const map = new Map<string, StatoConsensi>();
      (data ?? []).forEach((r: any) => {
        map.set(r.contatto_id, {
          trattamento_dati: !!r.trattamento_dati,
          whatsapp: !!r.whatsapp,
          email: !!r.email,
        });
      });
      return map;
    },
  });
}

export const STATO_CONSENSI_VUOTO: StatoConsensi = {
  trattamento_dati: false,
  whatsapp: false,
  email: false,
};

function Uno({ label, ok, compact }: { label: string; ok: boolean; compact?: boolean }) {
  const cls = ok
    ? "bg-success/15 text-success border-success/30 gap-1"
    : "text-muted-foreground gap-1";
  return (
    <Badge variant={ok ? undefined : "outline"} className={cls}>
      {ok ? <Check className="size-3" /> : <X className="size-3" />}
      {compact ? label : label}
    </Badge>
  );
}

/**
 * Badge uniformi dei tre consensi canonici.
 * `compact` = versione stretta con etichette corte, per le liste.
 */
export function BadgeConsensi({
  trattamentoDati,
  whatsapp,
  email,
  compact,
  className,
}: {
  trattamentoDati: boolean;
  whatsapp: boolean;
  email: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      <Uno label={compact ? "Dati" : "Trattamento dati"} ok={trattamentoDati} compact={compact} />
      <Uno label="WhatsApp" ok={whatsapp} compact={compact} />
      <Uno label="Email" ok={email} compact={compact} />
    </div>
  );
}

/** Variante che carica da sola lo stato di un singolo contatto. */
export function BadgeConsensiContatto({
  contattoId,
  compact,
  className,
}: {
  contattoId: string;
  compact?: boolean;
  className?: string;
}) {
  const { data } = useStatoConsensi([contattoId]);
  const s = data?.get(contattoId) ?? STATO_CONSENSI_VUOTO;
  return (
    <BadgeConsensi
      trattamentoDati={s.trattamento_dati}
      whatsapp={s.whatsapp}
      email={s.email}
      compact={compact}
      className={className}
    />
  );
}
