import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getChiaveMappe } from "@/lib/cantieri.functions";
import { normalizzaIndirizzo, residenzaDaIndirizzo, type ValoreIndirizzo, type LimitiIndirizzo } from "@/lib/blocco-indirizzo";
import { IndirizzoAutocomplete } from "@/components/indirizzo-autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function BloccoIndirizzo({ value, onChange, onCoordinate, onScelto, disabled, etichette, obbligatori, limiti, placeholder, className, descrizione, residenzaUnica = false }: {
  value: ValoreIndirizzo;
  onChange: (parziale: Partial<ValoreIndirizzo>) => void;
  onCoordinate?: (lat: number, lng: number) => void;
  onScelto?: () => void;
  disabled?: boolean;
  etichette?: Partial<Record<keyof ValoreIndirizzo, string>>;
  obbligatori?: Partial<Record<keyof ValoreIndirizzo, boolean>>;
  limiti?: LimitiIndirizzo;
  placeholder?: string;
  className?: string;
  descrizione?: string;
  /** Opt-in per moduli che salvano solo residenza, senza colonne CAP/città/provincia. */
  residenzaUnica?: boolean;
}) {
  const id = useId();
  const chiaveMappe = useServerFn(getChiaveMappe);
  const { data: mapsKey } = useQuery({ queryKey: ["chiave-mappe"], queryFn: async () => (await chiaveMappe()).key, staleTime: Infinity });
  const cambia = (parziale: Partial<ValoreIndirizzo>) => { if (!disabled) onChange(normalizzaIndirizzo(parziale, limiti)); };
  const label = (campo: keyof ValoreIndirizzo, testo: string) => <Label htmlFor={`${id}-${campo}`}>{etichette?.[campo] ?? testo}{obbligatori?.[campo] ? " *" : ""}</Label>;
  return <div className={cn("grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-4", className)}>
    <div className="min-w-0 space-y-1.5 sm:col-span-4">
      {label("indirizzo", "Indirizzo")}
      <IndirizzoAutocomplete id={`${id}-indirizzo`} value={value.indirizzo} apiKey={mapsKey} disabled={disabled} maxLength={limiti?.indirizzo} required={obbligatori?.indirizzo} placeholder={placeholder}
        onChange={(indirizzo) => cambia({ indirizzo })}
        onScelto={(d) => {
          if (disabled) return;
          cambia(residenzaUnica ? { indirizzo: residenzaDaIndirizzo(d) } : { indirizzo: d.indirizzo, ...(d.cap ? { cap: d.cap } : {}), ...(d.citta ? { citta: d.citta } : {}), ...(d.provincia ? { provincia: d.provincia } : {}) });
          if (d.lat != null && d.lng != null) onCoordinate?.(d.lat, d.lng);
          onScelto?.();
        }} />
      {descrizione && <p className="text-xs text-muted-foreground">{descrizione}</p>}
    </div>
    {!residenzaUnica && ([ ["cap", "CAP"], ["citta", "Città"], ["provincia", "Provincia"] ] as const).map(([campo, testo]) => <div key={campo} className={cn("min-w-0 space-y-1.5", campo === "citta" && "sm:col-span-2")}>
      {label(campo, testo)}
      <Input id={`${id}-${campo}`} value={value[campo]} disabled={disabled} required={obbligatori?.[campo]} maxLength={limiti?.[campo]} onChange={(e) => cambia({ [campo]: e.target.value })}/>
    </div>)}
  </div>;
}