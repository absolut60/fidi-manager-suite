// Campo "a chip" per Copia (CC) / Copia nascosta (CCN) della finestra unica
// di invio email di recupero (FM48). Elenco colleghi da
// get_destinatari_copia_recupero + indirizzo scritto a mano (isEmailValida).
import { useState } from "react";
import { Plus, X, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { isEmailValida } from "@/lib/email-validazione";

export type DestinatarioCopia = {
  user_id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
  pertinente: boolean;
};

export function etichettaRuolo(r: string): string {
  if (r === "agente") return "Agente";
  if (r === "store_manager") return "Store manager";
  return r;
}

type Props = {
  label: string;
  valori: string[];
  onChange: (v: string[]) => void;
  opzioni: DestinatarioCopia[];
  /** Indirizzi già usati altrove (minuscolo): destinatario, altro campo. */
  usati: Set<string>;
  limiteRaggiunto: boolean;
  disabled?: boolean;
};

export function CampoCopie({ label, valori, onChange, opzioni, usati, limiteRaggiunto, disabled }: Props) {
  const [aperto, setAperto] = useState(false);
  const [manuale, setManuale] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  function aggiungi(email: string): boolean {
    const e = email.trim();
    const k = e.toLowerCase();
    if (!isEmailValida(e)) { setErrore("Indirizzo email non valido"); return false; }
    if (usati.has(k)) { setErrore("Indirizzo già presente tra i destinatari"); return false; }
    if (limiteRaggiunto) { setErrore("Massimo 10 indirizzi in totale"); return false; }
    setErrore(null);
    onChange([...valori, e]);
    return true;
  }

  const ordinate = [...opzioni].sort((a, b) => Number(b.pertinente) - Number(a.pertinente));

  return (
    <div className="space-y-2 min-w-0">
      <Label>{label}</Label>
      {valori.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valori.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1 max-w-full pr-1">
              <span className="break-all">{v}</span>
              <button
                type="button"
                aria-label={`Togli ${v}`}
                className="rounded-sm p-1 hover:bg-background/60"
                onClick={() => onChange(valori.filter((x) => x !== v))}
                disabled={disabled}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <Popover open={aperto} onOpenChange={setAperto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="justify-between min-h-10 sm:w-56 shrink-0" disabled={disabled || limiteRaggiunto}>
              Scegli un collega <ChevronsUpDown className="size-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
            <Command>
              <CommandInput placeholder="Cerca per nome o email…" />
              <CommandList className="max-h-72">
                <CommandEmpty>Nessun collega trovato.</CommandEmpty>
                <CommandGroup>
                  {ordinate.map((o) => {
                    const k = o.email.trim().toLowerCase();
                    const gia = usati.has(k);
                    return (
                      <CommandItem
                        key={`${o.user_id}-${o.ruolo}`}
                        value={`${o.nome} ${o.cognome} ${o.email} ${etichettaRuolo(o.ruolo)}`}
                        disabled={gia}
                        onSelect={() => { if (aggiungi(o.email)) setAperto(false); }}
                        className="flex flex-col items-start gap-0.5 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 w-full min-w-0">
                          <span className="font-medium break-words">{o.nome} {o.cognome}</span>
                          <span className="text-xs text-muted-foreground">· {etichettaRuolo(o.ruolo)}</span>
                          {o.pertinente && <Badge className="h-5 px-1.5 text-[10px]">del cliente</Badge>}
                          {gia && <span className="text-[10px] text-muted-foreground">(già inserito)</span>}
                        </div>
                        <span className="text-xs text-muted-foreground break-all">{o.email}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div className="flex gap-2 flex-1 min-w-0">
          <Input
            type="email"
            value={manuale}
            onChange={(e) => { setManuale(e.target.value); setErrore(null); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (aggiungi(manuale)) setManuale(""); }
            }}
            placeholder="altro@indirizzo.it"
            className="min-w-0"
            disabled={disabled || limiteRaggiunto}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 size-10"
            aria-label={`Aggiungi indirizzo in ${label}`}
            onClick={() => { if (aggiungi(manuale)) setManuale(""); }}
            disabled={disabled || limiteRaggiunto || !manuale.trim()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      {errore && <p className="text-xs text-destructive">{errore}</p>}
    </div>
  );
}
