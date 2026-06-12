import { useEffect } from "react";
import { Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type TipoAzione = "email" | "telefonata" | "promemoria" | "nota" | "lettera";

export const DEFAULT_GIORNI: Record<TipoAzione, number> = {
  telefonata: 5,
  email: 7,
  promemoria: 7,
  lettera: 10,
  nota: 7,
};

export const DEFAULT_ABILITATO: Record<TipoAzione, boolean> = {
  telefonata: true,
  email: true,
  promemoria: true,
  lettera: true,
  nota: false,
};

export type ReminderState = {
  attivo: boolean;
  giorni: number;
};

export function defaultReminderFor(tipo: TipoAzione): ReminderState {
  return { attivo: DEFAULT_ABILITATO[tipo], giorni: DEFAULT_GIORNI[tipo] };
}

const QUICK = [1, 5, 10];

export function ReminderControls({
  tipo,
  state,
  onChange,
}: {
  tipo: TipoAzione;
  state: ReminderState;
  onChange: (s: ReminderState) => void;
}) {
  // Re-applica i default quando cambia tipo
  useEffect(() => {
    onChange(defaultReminderFor(tipo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={state.attivo}
          onCheckedChange={(v) => onChange({ ...state, attivo: v === true })}
        />
        <Bell className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Ricordamelo dopo</span>
      </label>
      <div className={cn("flex items-center gap-2 flex-wrap", !state.attivo && "opacity-50 pointer-events-none")}>
        {QUICK.map((g) => (
          <Button
            key={g}
            type="button"
            size="sm"
            variant={state.giorni === g ? "default" : "outline"}
            className="h-7"
            onClick={() => onChange({ ...state, attivo: true, giorni: g })}
          >
            {g} gg
          </Button>
        ))}
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Altro:</Label>
          <Input
            type="number"
            min={1}
            max={365}
            value={state.giorni}
            onChange={(e) => onChange({ ...state, attivo: true, giorni: Math.max(1, Number(e.target.value) || 1) })}
            className="h-7 w-20"
          />
          <span className="text-xs text-muted-foreground">giorni</span>
        </div>
      </div>
      {state.attivo && (
        <p className="text-xs text-muted-foreground">
          Verrà creato un promemoria automatico fra {state.giorni} {state.giorni === 1 ? "giorno" : "giorni"}, visibile nel calendario.
        </p>
      )}
    </div>
  );
}

/**
 * Crea una azione di follow-up (tipo='promemoria', esito='da_fare')
 * collegata a un'azione principale già salvata.
 */
export async function creaFollowUp(opts: {
  clienteId: string;
  operatoreId: string | null;
  dataPrincipale: Date;
  giorni: number;
  tipoOriginale: TipoAzione;
  importoRiferimento?: number | null;
  scadenzeIds?: string[];
  descrizioneOriginale?: string;
}): Promise<void> {
  const data = new Date(opts.dataPrincipale);
  data.setDate(data.getDate() + opts.giorni);
  const note = `Follow-up: ${opts.descrizioneOriginale ?? opts.tipoOriginale} del ${opts.dataPrincipale.toLocaleDateString("it-IT")}`;
  const { data: inserita, error } = await supabase
    .from("azioni_recupero")
    .insert({
      cliente_id: opts.clienteId,
      operatore_id: opts.operatoreId,
      tipo: "promemoria",
      esito: "da_fare",
      data_azione: data.toISOString(),
      importo_riferimento: opts.importoRiferimento ?? null,
      note,
    })
    .select("id")
    .single();
  if (error) throw error;
  const ids = opts.scadenzeIds ?? [];
  if (ids.length && inserita?.id) {
    const rows = ids.map((sid) => ({ azione_id: inserita.id, scadenza_id: sid }));
    const { error: e2 } = await supabase.from("azioni_recupero_scadenze").insert(rows);
    if (e2) throw e2;
  }
}
