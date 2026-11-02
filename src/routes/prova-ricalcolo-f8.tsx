import { createFileRoute } from "@tanstack/react-router";
import { RiquadroRicalcoloFido } from "@/components/ricalcolo-fido-barra";
import { barraRicalcolo } from "@/lib/fido-teorico-ricalcolo-lock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/prova-ricalcolo-f8")({ component: P });
function P() {
  const ora = Date.now();
  const v = JSON.stringify({ token: "t", origine: "manuale", avviato_at: new Date(ora - 40_000).toISOString(), fase: "blocchi", blocco: 23, previsti: 65, avviato_da: "Andrea Giani" });
  const attivo = barraRicalcolo({ valore: v, updated_at: new Date(ora - 1000).toISOString() }, ora);
  const interr = barraRicalcolo({ valore: v, updated_at: new Date(ora - 200_000).toISOString() }, ora);
  return <div className="p-4 space-y-4 max-w-3xl">
    <Card className="p-4 sm:p-6 space-y-4"><h2 className="font-semibold">Fido teorico (precalcolo)</h2><RiquadroRicalcoloFido barra={attivo} />
      <div className="flex items-center gap-3 flex-wrap"><Button disabled>Ricalcola fido teorico ora</Button><span className="text-sm text-muted-foreground">Attendi la fine del ricalcolo in corso</span></div></Card>
    <Card className="p-4 sm:p-6 space-y-4"><RiquadroRicalcoloFido barra={interr} /><Button>Ricalcola fido teorico ora</Button></Card>
  </div>;
}
