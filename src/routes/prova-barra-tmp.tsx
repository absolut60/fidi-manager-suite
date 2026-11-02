import { createFileRoute } from "@tanstack/react-router";
import { RiquadroRicalcoloFido, StrisciaVista } from "@/components/ricalcolo-fido-barra";
import { barraRicalcolo } from "@/lib/fido-teorico-ricalcolo-lock";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/prova-barra-tmp")({ component: P });
function P() {
  const ora = Date.now();
  const v = (o: object, agg = ora) => ({ valore: JSON.stringify({ token: "t", origine: "automatico", avviato_at: new Date(ora - 240000).toISOString(), fase: "blocchi", blocco: 23, previsti: 65, ...o }), updated_at: new Date(agg).toISOString() });
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3">
      <StrisciaVista barra={barraRicalcolo(v({}), ora)} />
      <RiquadroRicalcoloFido barra={barraRicalcolo(v({}), ora)} />
      <div className="flex flex-wrap items-center gap-3"><Button disabled>Ricalcola fido teorico ora</Button><span className="text-sm text-muted-foreground">Attendi la fine del ricalcolo in corso</span></div>
      <RiquadroRicalcoloFido barra={barraRicalcolo(v({ origine: "manuale", avviato_da: "Andrea Giani", fase: "alert" }), ora)} />
      <RiquadroRicalcoloFido barra={barraRicalcolo(v({}, ora - 20 * 60000), ora)} />
      <Button disabled className="w-full sm:w-auto">Attendi la fine del ricalcolo</Button>
    </div>
  );
}
