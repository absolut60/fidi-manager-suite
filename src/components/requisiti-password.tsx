import { Check, X } from "lucide-react";
import { LUNGHEZZA_MINIMA_PASSWORD, REQUISITI_PASSWORD } from "@/lib/regole-password";

/**
 * Elenco dei requisiti della password con spunte in tempo reale (FM44).
 * Testo fonte unica: REQUISITI_PASSWORD e LUNGHEZZA_MINIMA_PASSWORD in src/lib/regole-password.ts.
 */
export function RequisitiPassword({ pwd }: { pwd: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        La password deve essere lunga almeno {LUNGHEZZA_MINIMA_PASSWORD} caratteri e contenere una lettera maiuscola,
        una minuscola, un numero e un carattere speciale.
      </p>
      <p className="text-xs text-muted-foreground">
        Esempio di struttura: Cantiere#Lissone26 — non usare questo esempio, inventane una tua. Consiglio: unisci due o
        tre parole che ricordi facilmente, un numero e un simbolo.
      </p>
      <ul className="space-y-1 text-sm" aria-label="Requisiti della password">
        {REQUISITI_PASSWORD.map((r) => {
          const ok = r.verifica(pwd);
          return (
            <li key={r.id} className={`flex items-start gap-2 ${ok ? "text-primary" : "text-muted-foreground"}`}>
              {ok ? <Check className="size-4 shrink-0 mt-0.5" /> : <X className="size-4 shrink-0 mt-0.5" />}
              <span className="min-w-0 break-words">{r.etichetta}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
