import { createFileRoute } from "@tanstack/react-router";
import { InviaEmailFornitoreDialog } from "@/components/fornitori/InviaEmailFornitoreDialog";
export const Route = createFileRoute("/prova-editor-tmp")({ component: () => <InviaEmailFornitoreDialog fornitore={{ id: "00000000-0000-4000-8000-000000000001", ragione_sociale: "Fornitore Esempio S.r.l.", email: "ordini@esempio.it", pec: null }} open onOpenChange={() => {}} onInviata={() => {}} /> });
