import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseNumeroIt } from "@/lib/numero-it";

/**
 * Input numerico in formato italiano (accetta virgola decimale).
 * Wrapper di <Input> con type="text" + inputMode="decimal".
 *
 * - `value` è il numero JS (o null/""); l'utente può digitare "0,42" o "0.42".
 * - `onChange(num)` viene chiamato col numero parsato (null se vuoto/non valido).
 * - Filtra in tempo reale i caratteri non consentiti.
 */
export interface NumberInputItProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number | string | null | undefined;
  onChange: (value: number | null) => void;
  allowNegative?: boolean;
}

export const NumberInputIt = React.forwardRef<HTMLInputElement, NumberInputItProps>(
  ({ value, onChange, className, allowNegative = false, onBlur, ...rest }, ref) => {
    const externalString = React.useMemo(() => {
      if (value === null || value === undefined || value === "") return "";
      const s = String(value);
      // Mostra con la virgola se è un numero JS con punto
      return s.replace(".", ",");
    }, [value]);

    const [local, setLocal] = React.useState<string>(externalString);
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) setLocal(externalString);
    }, [externalString, focused]);

    const allowedRe = allowNegative ? /[^0-9.,\-]/g : /[^0-9.,]/g;

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={local}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onDragStart={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onBlur={(e) => {
          setFocused(false);
          const parsed = parseNumeroIt(local);
          // Conferma se si sta azzerando/svuotando un valore precedente > 0
          const prev = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value);
          const sta_azzerando = (parsed === null || parsed === 0) && Number.isFinite(prev) && prev !== 0;
          if (sta_azzerando) {
            const ok = window.confirm(
              `Vuoi davvero azzerare questo valore? (era ${String(prev).replace(".", ",")})`,
            );
            if (!ok) {
              setLocal(externalString);
              onBlur?.(e);
              return;
            }
          }
          onChange(parsed);
          setLocal(parsed === null ? "" : String(parsed).replace(".", ","));
          onBlur?.(e);
        }}
        onChange={(e) => {
          const cleaned = e.target.value.replace(allowedRe, "");
          setLocal(cleaned);
          const parsed = parseNumeroIt(cleaned);
          onChange(parsed);
        }}
        className={cn(className)}
        {...rest}
      />
    );
  },
);
NumberInputIt.displayName = "NumberInputIt";
