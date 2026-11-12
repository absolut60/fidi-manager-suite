// Ordinamento di lista condiviso (FM62 fornitori, FM63 articoli): intestazione cliccabile
// con freccia di direzione da PC e menu "Ordina per" su telefono. L'ordine lo applica il server.
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Direzione = "asc" | "desc";
export type StatoOrdinamento<C extends string> = { ordina: C; direzione: Direzione; imposta: (col: C, direzione: Direzione) => void };

export function IntestazioneOrdinabile<C extends string>({ col, ordinamento: o, children, className, allinea = "left" }: { col: C; ordinamento?: StatoOrdinamento<C>; children: ReactNode; className?: string; allinea?: "left" | "right" }) {
  const attiva = o?.ordina === col;
  return <th scope="col" aria-sort={attiva ? (o!.direzione === "asc" ? "ascending" : "descending") : "none"} className={cn("px-2 py-3 font-medium", allinea === "right" ? "text-right" : "text-left", className)}>
    {o ? <button type="button" onClick={() => o.imposta(col, attiva && o.direzione === "asc" ? "desc" : "asc")} className={cn("inline-flex items-center gap-1 text-left transition-colors hover:text-primary", allinea === "right" && "flex-row-reverse text-right")}>
      <span className="break-words">{children}</span>
      {attiva ? (o.direzione === "asc" ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />) : <ChevronsUpDown className="size-4 shrink-0 opacity-60" />}
    </button> : children}
  </th>;
}

export function MenuOrdinamento<C extends string>({ ordinamento: o, colonne, etichetta, className }: { ordinamento: StatoOrdinamento<C>; colonne: { col: C; label: string }[]; etichetta: string; className?: string }) {
  return <div className={cn("flex items-center gap-2", className)}>
    <span className="shrink-0 text-xs text-muted-foreground">Ordina per</span>
    <Select value={`${o.ordina}:${o.direzione}`} onValueChange={v => { const [c, d] = v.split(":"); o.imposta(c as C, d === "desc" ? "desc" : "asc"); }}>
      <SelectTrigger aria-label={etichetta} className="min-h-10 min-w-0 flex-1"><SelectValue /></SelectTrigger>
      <SelectContent>{colonne.flatMap(c => [<SelectItem key={`${c.col}:asc`} value={`${c.col}:asc`}>{c.label} ↑</SelectItem>, <SelectItem key={`${c.col}:desc`} value={`${c.col}:desc`}>{c.label} ↓</SelectItem>])}</SelectContent>
    </Select>
  </div>;
}
