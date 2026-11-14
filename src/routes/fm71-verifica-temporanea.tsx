import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import { Button } from "@/components/ui/button";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
export const Route = createFileRoute("/fm71-verifica-temporanea")({component: Verifica});
const prev = {id:"11111111-1111-4111-8111-111111111111",numero:"PRV-167/26",tipo:"preventivo",tipo_doc:"PREVENTIVO",stato:"bozza",data:"2026-11-14",cliente_id:null,lead_id:null,cliente:null,blocchi:[],iva_perc:22} as unknown as PreventivoConDettagli;
function Verifica(){const [open,setOpen]=useState(false);return <div className="p-3"><Button onClick={()=>setOpen(true)}>Nuovo preventivo</Button><NuovoPreventivoDialog open={open} onOpenChange={setOpen}/><TestataPreventivo prev={prev} cliente={null} modificabile statoEditabile agenti={[]} principali={[]} haAlternative={false} listino="—" categoria="—" sede="—" caricamentoCataloghi={false} onSave={()=>{}} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}} onRiferimento={async()=>{}}/></div>;}