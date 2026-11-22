import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Data sempre italiana, senza la lingua del controllo nativo del browser. */
export function DataExportFiltro({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const visualizza = (v: string) => v ? v.split('-').reverse().join('/') : '';
  const [testo, setTesto] = useState(() => visualizza(value));
  const [errore, setErrore] = useState(false);
  useEffect(() => { setTesto(visualizza(value)); setErrore(false); }, [value]);
  const salva = (v: string) => {
    if (!v) { onChange(''); setErrore(false); return; }
    const parti = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
    if (!parti) { setErrore(true); return; }
    const iso = `${parti[3]}-${parti[2]}-${parti[1]}`;
    const data = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso) { setErrore(true); return; }
    setErrore(false); onChange(iso);
  };
  return <Label className="grid min-w-0 gap-1 text-xs">{label}<Input aria-label={label} placeholder="gg/mm/aaaa" inputMode="numeric" maxLength={10} className="min-h-11" value={testo} aria-invalid={errore} onChange={e => { setTesto(e.target.value); if (!e.target.value || /^\d{2}\/\d{2}\/\d{4}$/.test(e.target.value)) salva(e.target.value); }} onBlur={() => salva(testo)} />{errore && <span className="text-destructive">Data non valida: gg/mm/aaaa.</span>}</Label>;
}

