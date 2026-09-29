import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pagina Approvazioni eliminata (FM36 fetta 12): la coda di approvazione vive
 * in Richieste fido, scheda "In approvazione". Il percorso resta come redirect
 * perche' le notifiche raggruppate ("N richieste da approvare") puntano qui.
 */
export const Route = createFileRoute("/_app/approvazioni")({
  beforeLoad: () => {
    throw redirect({ to: "/richieste", search: { tab: "in_approvazione" } });
  },
});
