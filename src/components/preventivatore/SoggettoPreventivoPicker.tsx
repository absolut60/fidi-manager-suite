import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Plus } from "lucide-react";
import { ClientePicker } from "./ClientePicker";
import { CondizioniRiferimento } from "./CondizioniRiferimento";
import { supabase } from "@/integrations/supabase/client";
import { cercaLeadPreventivo, creaLeadPreventivo } from "@/lib/lead-preventivo-api";
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
  const [form, setForm] = useState({ ragione_sociale: "", nome: "", cognome: "", telefono: "", email: "", store_id: sedeId ?? null as string | null });
  const lead = useQuery({ queryKey: ["lead-preventivo-search", testo], queryFn: () => cercaLeadPreventivo(testo), enabled: open });
  const cataloghi = useQuery({ ...opzioniCataloghiRiferimento, enabled: tipo === "lead" });
  const stores = useQuery({ queryKey: ["stores-attivi"], queryFn: async () => {
    const { data, error } = await supabase.from("stores").select("id,codice,nome").eq("attivo", true).order("codice");
    if (error) throw error; return data ?? [];
  } });
  const scegliLead = (l: NonNullable<Extract<SoggettoPreventivo, { tipo: "lead" }>["lead"]>) => {
    onRiferimento({ listino_rif: l.listino_rif, macrocategoria_rif: l.macrocategoria_rif, categoria_rif: l.categoria_rif });
    onChange({ tipo: "lead", id: l.id, lead: l }); setOpen(false); setNuovo(false);
  };
  const crea = useMutation({ mutationFn: () => creaLeadPreventivo(form), onSuccess: scegliLead });
  return <div className="grid min-w-0 gap-2">
    {consentiLead && <div role="group" aria-label="Tipo soggetto" className="flex gap-1">
      {(["cliente", "lead"] as const).map(t => <Button key={t} type="button" size="sm" variant={tipo === t ? "default" : "outline"} aria-pressed={tipo === t} onClick={() => { setTipo(t); onChange(null); onRiferimento(riferimentoVuoto); setNuovo(false); }}>{t === "cliente" ? "Cliente" : "Lead"}</Button>)}
    </div>}
    {tipo === "cliente" ? <ClientePicker value={value?.tipo === "cliente" ? value.id : null} onChange={id => onChange({ tipo: "cliente", id })}/> : <>
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="Lead" aria-expanded={open} className="h-auto min-h-10 w-full min-w-0 justify-between"><span className="min-w-0 break-words text-left">{value?.tipo === "lead" ? nomeLeadPreventivo(value.lead) : "Seleziona lead…"}</span><ChevronsUpDown className="size-4 shrink-0"/></Button></PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-2">
          <Input aria-label="Cerca lead" placeholder="Nome, telefono o email" value={testo} onChange={e => setTesto(e.target.value)}/>
          <div className="max-h-64 overflow-y-auto">{lead.isPending ? <p className="p-2 text-xs">Caricamento…</p> : lead.error ? <p role="alert" className="p-2 text-xs text-destructive">{lead.error.message}</p> : (lead.data ?? []).map(l => <Button type="button" key={l.id} variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left text-xs" onClick={() => scegliLead(l)}><span className="min-w-0 break-words">{nomeLeadPreventivo(l)}<span className="block text-muted-foreground">{[l.telefono,l.email].filter(Boolean).join(" · ")}</span></span></Button>)}{lead.data?.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nessun risultato</p>}</div>
        </PopoverContent></Popover>
      <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => { setNuovo(!nuovo); setForm(f => ({ ...f, store_id: sedeId ?? null })); }}><Plus className="mr-1 size-4"/>Nuovo lead</Button>
      {nuovo && <div className="grid min-w-0 gap-2 border-t pt-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{([['ragione_sociale','Ragione sociale'],['nome','Nome'],['cognome','Cognome'],['telefono','Telefono'],['email','Email']] as const).map(([k,label]) => <div key={k} className="grid min-w-0 gap-1"><Label>{label}</Label><Input aria-label={`Nuovo lead: ${label}`} value={form[k]} onChange={e => setForm(f => ({ ...f,[k]:e.target.value }))}/></div>)}</div>
        <Label>Sede del lead</Label><Select value={form.store_id ?? "__none__"} onValueChange={v => setForm(f => ({ ...f,store_id:v === "__none__" ? null : v }))}><SelectTrigger aria-label="Sede del lead" className="h-auto min-h-10 [&>span]:whitespace-normal"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">— Nessuna —</SelectItem>{stores.data?.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent></Select>
        {crea.error && <p role="alert" className="text-xs text-destructive">{crea.error.message}</p>}
        <Button type="button" className="justify-self-start" disabled={crea.isPending} onClick={() => crea.mutate()}>Crea e seleziona lead</Button>
      </div>}
      <CondizioniRiferimento key={value?.id ?? "nuovo"} obbligatorio riferimento={riferimento} cataloghi={cataloghi.data} errore={cataloghi.error?.message} caricamento={cataloghi.isPending} modificabile onValori={onRiferimento} onSave={async () => {}}/>
    </>}
  </div>;
}