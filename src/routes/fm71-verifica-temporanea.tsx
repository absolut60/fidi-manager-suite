import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PreventiviListView } from "@/components/preventivatore/PreventiviListView";
import { CondizioniRiferimento } from "@/components/preventivatore/CondizioniRiferimento";
import { CondizionePagamentoRichiestaSelect } from "@/components/condizione-pagamento-richiesta-select";
import { LeadPreventivoDialog } from "@/components/preventivatore/LeadPreventivoDialog";
import { Button } from "@/components/ui/button";
import type { LeadPreventivo } from "@/lib/soggetto-preventivo";
export const Route = createFileRoute("/fm71-verifica-temporanea")({ component: Verifica });
const lead: LeadPreventivo = { id: "11111111-1111-4111-8111-111111111111", ragione_sociale: "Impresa Collaudo Lead", nome: null, cognome: null, telefono: null, email: null, store_id: null, agente_codice: null, condizione_pagamento_cod: null, listino_rif: 30, macrocategoria_rif: "01", categoria_rif: null };
function Verifica() {
  const [pagamento, setPagamento] = useState(""); const [open, setOpen] = useState(false); const [salvato, setSalvato] = useState("");
  return <><PreventiviListView tipo="preventivo"/><div className="mx-auto max-w-xl space-y-4 p-3">
    <CondizioniRiferimento obbligatorio riferimento={lead} cataloghi={{ listini: [{codice:30,descrizione:"Vendita"}], macrocategorie:[{codice:"01",label:"Edilizia"}],categorie:[{codice:"01",label:"Impresa"}] }} caricamento={false} modificabile onSave={async p => {setSalvato(p.categoria_rif ?? "");}}/>
    <output aria-label="Categoria salvata">{salvato}</output>
    <CondizionePagamentoRichiestaSelect ariaLabel="Condizione di pagamento" value={pagamento} onChange={setPagamento}/>
    <Button onClick={()=>setOpen(true)}>Apri scheda lead</Button>
    {open && <LeadPreventivoDialog lead={lead} onClose={()=>setOpen(false)}/>}
  </div></>;
}