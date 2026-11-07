// Pagina temporanea di verifica FM60-bis (da rimuovere dopo gli screenshot).
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ModificaAzioneDialog, type AzioneModificabile } from "@/components/modifica-azione-dialog";
import { Button } from "@/components/ui/button";

const nota: AzioneModificabile = {
  id: "00000000-0000-0000-0000-000000000001",
  cliente_id: "00000000-0000-0000-0000-000000000099",
  tipo: "nota",
  esito: "da_fare",
  data_azione: new Date().toISOString(),
  data_promessa_pagamento: null,
  importo_riferimento: 1250.5,
  note: "Nota di prova per verifica apertura finestra.",
  email_oggetto: null,
  email_corpo_html: null,
  email_destinatario: null,
  livello_sollecito: null,
  operatore_id: null,
  stato_promessa: null,
};

const promessa: AzioneModificabile = {
  ...nota,
  id: "00000000-0000-0000-0000-000000000002",
  tipo: "promessa_pagamento",
  esito: "fatto",
  data_promessa_pagamento: "2026-11-20",
  note: "Promessa di prova.",
  stato_promessa: "in_attesa",
};

export const Route = createFileRoute("/fm60-bis-verifica")({
  component: PaginaVerifica,
});

function PaginaVerifica() {
  const [aperta, setAperta] = useState<"nota" | "promessa" | null>(null);
  return (
    <div className="p-4 space-x-2">
      <Button onClick={() => setAperta("nota")}>Apri nota</Button>
      <Button onClick={() => setAperta("promessa")}>Apri promessa</Button>
      {aperta === "nota" && (
        <ModificaAzioneDialog open azione={nota} onOpenChange={(v) => { if (!v) setAperta(null); }} />
      )}
      {aperta === "promessa" && (
        <ModificaAzioneDialog open azione={promessa} onOpenChange={(v) => { if (!v) setAperta(null); }} />
      )}
    </div>
  );
}
