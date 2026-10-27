/**
 * Fonte unica per scegliere file con testi in italiano (FM48).
 * Sostituisce l'input file nativo, che mostra "Choose file / No file chosen"
 * nella lingua del browser. Stessi `accept` e `multiple` dell'input nativo.
 */
import { useId, useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScegliFile({
  id, accept, multiple, disabled, onFiles, nomi, etichetta = "Scegli file", className,
}: {
  id?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** Nomi dei file scelti (vuoto = "Nessun file selezionato"). */
  nomi?: string[];
  etichetta?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;
  const testo = !nomi || nomi.length === 0
    ? "Nessun file selezionato"
    : nomi.length === 1 ? nomi[0] : `${nomi.length} file selezionati`;
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <input
        ref={ref}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          if (list.length) onFiles(list);
        }}
      />
      <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5" disabled={disabled}
        onClick={() => ref.current?.click()}>
        <Paperclip className="size-4" aria-hidden />
        {etichetta}
      </Button>
      <span className="min-w-0 flex-1 break-all line-clamp-2 text-sm text-muted-foreground" aria-live="polite">{testo}</span>
    </div>
  );
}
