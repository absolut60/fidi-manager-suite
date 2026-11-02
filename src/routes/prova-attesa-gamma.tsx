import { createFileRoute } from "@tanstack/react-router";
import { riepilogoVisibilita, CATEGORIE_PROPOSTA_DEFAULT } from "@/lib/proposta-fido-visibilita";
export const Route = createFileRoute("/prova-attesa-gamma")({ component: P });
function P() {
  const base = { tipo: "aumento", regola: "calcolo", proponibile: true, fido_attuale: 500, fido_proposto: 5000 };
  const righe = [{ ...base, cliente_id: "a" }, { ...base, cliente_id: "r", tipo: "rinnovo", fido_attuale: 1000, fido_proposto: 1000 },
    { ...base, cliente_id: "c", richiestaInCorso: {} }, { ...base, cliente_id: "g", inAttesaGamma: { importo_approvato: 5000 } }];
  const r = riepilogoVisibilita(righe, { tipi: CATEGORIE_PROPOSTA_DEFAULT }, new Set());
  const v: string[] = [];
  if (r.nascosti.in_corso > 0) v.push(`Non vedi ${r.nascosti.in_corso} clienti che hanno già una richiesta in corso.`);
  if (r.nascosti.in_attesa_gamma > 0) v.push(`Già approvati, in attesa di Gamma (${r.nascosti.in_attesa_gamma})`);
  return (
    <div className="p-3 text-xs text-muted-foreground">
      <details open className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 font-medium text-foreground">▸ Cosa non vedi e perché</summary>
        <ul className="ml-4 list-disc">
          <li>Non vedi {r.nascosti.rinnovo} altri clienti con fido invariato e niente da guardare: non serve mandarli.</li>
          {v.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </details>
    </div>);
}
