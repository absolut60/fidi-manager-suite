import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Plus } from "lucide-react";
import { ClientePicker } from "./ClientePicker";
import { CondizioniRiferimento } from "./CondizioniRiferimento";
import { Dialog } from "@/components/ui/dialog";
import { NuovoLeadDialog } from "@/components/lead/nuovo-lead-dialog";
import { cercaLeadPreventivo } from "@/lib/lead-preventivo-api";
import { nomeLeadPreventivo, riferimentoVuoto, type SoggettoPreventivo } from "@/lib/soggetto-preventivo";
import { opzioniCataloghiRiferimento, type RiferimentoPreventivo } from "@/lib/condizioni-riferimento";

/** Stesso selettore e stesse condizioni per creazione e cambio destinatario. */
export function SoggettoPreventivoPicker({ value, onChange, sedeId, riferimento, onRiferimento, consentiLead = true }: {
  value: SoggettoPreventivo | null; onChange: (v: SoggettoPreventivo | null) => void;
  sedeId?: string | null; riferimento: RiferimentoPreventivo; onRiferimento: (v: RiferimentoPreventivo) => void; consentiLead?: boolean;
}) {
  const [tipo, setTipo] = useState<"cliente" | "lead">(value?.tipo ?? "cliente");
  useEffect(() => { if (value) setTipo(value.tipo); }, [value?.tipo]);
  const [open, setOpen] = useState(false); const [testo, setTesto] = useState("");
  const [nuovo, setNuovo] = useState(false);
  const lead = useQuery({ queryKey: ["lead-preventivo-search", testo], queryFn: () => cercaLeadPreventivo(testo), enabled: open });
  const cataloghi = useQuery({ ...opzioniCataloghiRiferimento, enabled: tipo === "lead" });
  const scegliLead = (l: NonNullable<Extract<SoggettoPreventivo, { tipo: "lead" }>["lead"]>) => {
    onRiferimento({ listino_rif: l.listino_rif, macrocategoria_rif: l.macrocategoria_rif, categoria_rif: l.categoria_rif });
    onChange({ tipo: "lead", id: l.id, lead: l }); setOpen(false); setNuovo(false);
  };
  return <div className="grid min-w-0 gap-2">
    {consentiLead && <div role="group" aria-label="Tipo soggetto" className="flex gap-1">
      {(["cliente", "lead"] as const).map(t => <Button key={t} type="button" size="sm" variant={tipo === t ? "default" : "outline"} aria-pressed={tipo === t} onClick={() => { setTipo(t); onChange(null); onRiferimento(riferimentoVuoto); setNuovo(false); }}>{t === "cliente" ? "Cliente" : "Lead"}</Button>)}
    </div>}
    {tipo === "cliente" ? <ClientePicker value={value?.tipo === "cliente" ? value.id : null} onChange={id => onChange({ tipo: "cliente", id })}/> : <>
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="Lead" aria-expanded={open} className="h-auto min-h-10 w-full min-w-0 justify-between"><span className="min-w-0 break-words whitespace-normal text-left">{value?.tipo === "lead" ? nomeLeadPreventivo(value.lead) : "Seleziona lead…"}</span><ChevronsUpDown className="size-4 shrink-0"/></Button></PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-2">
          <Input aria-label="Cerca lead" placeholder="Nome, telefono o email" value={testo} onChange={e => setTesto(e.target.value)}/>
          <div className="max-h-64 overflow-y-auto">{lead.isPending ? <p className="p-2 text-xs">Caricamento…</p> : lead.error ? <p role="alert" className="p-2 text-xs text-destructive">{lead.error.message}</p> : (lead.data ?? []).map(l => <Button type="button" key={l.id} variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left text-xs" onClick={() => scegliLead(l)}><span className="min-w-0 break-words">{nomeLeadPreventivo(l)}<span className="block text-muted-foreground">{[l.telefono,l.email].filter(Boolean).join(" · ")}</span></span></Button>)}{lead.data?.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nessun risultato</p>}</div>
        </PopoverContent></Popover>
      <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => setNuovo(true)}><Plus className="mr-1 size-4"/>Nuovo lead</Button>
      <Dialog open={nuovo} onOpenChange={setNuovo}>
        {nuovo && <NuovoLeadDialog origine="preventivo" sedeIniziale={sedeId ?? null} onClose={() => setNuovo(false)} onCreato={scegliLead}/>}
      </Dialog>
      <CondizioniRiferimento key={value?.id ?? "nuovo"} obbligatorio riferimento={riferimento} cataloghi={cataloghi.data} errore={cataloghi.error?.message} caricamento={cataloghi.isPending} modificabile onValori={onRiferimento} onSave={async () => {}}/>
    </>}
  </div>;
}