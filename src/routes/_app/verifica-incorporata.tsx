import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClientePreventivoDialog } from "@/components/preventivatore/ClientePreventivoDialog";
import { Button } from "@/components/ui/button";
import type { DatiClientePreventivo } from "@/lib/preventivi-api";

export const Route = createFileRoute('/_app/verifica-incorporata')({
  head:()=>({meta:[{title:'Verifica finestra cliente | FidiManager MADE'},{name:'description',content:'Verifica temporanea finestra cliente.'},{property:'og:title',content:'Verifica finestra cliente | FidiManager MADE'},{property:'og:description',content:'Verifica temporanea finestra cliente.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component: Verifica,
});
const cliente={id:'00000000-0000-4000-8000-000000000067',ragione_sociale:'EDILIZIA ROSSI E FIGLI S.R.L.',codice_gestionale:'001234',partita_iva:'01234567890'} as DatiClientePreventivo;
function Verifica(){const [open,setOpen]=useState(false);return <><Button onClick={()=>setOpen(true)}>Scheda cliente</Button>{open&&<ClientePreventivoDialog cliente={cliente} onClose={()=>setOpen(false)}/>}</>;}