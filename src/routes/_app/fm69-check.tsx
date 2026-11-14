import { createFileRoute } from "@tanstack/react-router";
import { ModificaAzioneDialog } from "@/components/modifica-azione-dialog";
export const Route = createFileRoute("/_app/fm69-check")({ component: Check });
function Check() { return <ModificaAzioneDialog open onOpenChange={() => {}} azione={{ id: "11111111-1111-4111-8111-111111111111", cliente_id: "11111111-1111-4111-8111-111111111111", tipo: "nota", esito: "da_fare", data_azione: "2026-11-14T18:15:00Z", data_promessa_pagamento: null, importo_riferimento: null, note: "Azione di prova con allegato", email_oggetto: null, email_corpo_html: null, email_destinatario: null, livello_sollecito: null }} /> }
