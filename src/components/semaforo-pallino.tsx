import { semaforoDaCliente, semaforoUI } from "@/lib/semaforo-ui";

/** Presentazione riutilizzabile del semaforo materializzato, senza calcoli. */
export function SemaforoPallino({ cliente, className = "" }: {
  cliente: Parameters<typeof semaforoDaCliente>[0];
  className?: string;
}) {
  const { stadio, motivo } = semaforoDaCliente(cliente);
  const sem = semaforoUI(stadio, motivo);
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${sem.dotClass} ${className}`}
    title={`Rischio: ${sem.label} — ${sem.motivo}`} aria-label={`Rischio: ${sem.label}`} />;
}