import { createFileRoute } from "@tanstack/react-router";
import { InviaEmailFornitoreDialog } from "@/components/fornitori/InviaEmailFornitoreDialog";
export const Route = createFileRoute("/prova-email-tmp")({ component: () => <InviaEmailFornitoreDialog open onOpenChange={() => {}} onInviata={() => {}} fornitore={{ id: "00000000-0000-0000-0000-000000000001", ragione_sociale: "Fornitore Esempio S.r.l.", email: "ordini@esempio.it", pec: "esempio@pec.it" }} /> });
