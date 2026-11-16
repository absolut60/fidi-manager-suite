import { createFileRoute } from "@tanstack/react-router";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
export const Route = createFileRoute("/verifica-testata")({ component: P });
const prev = { id:"00000000-0000-0000-0000-000000000001", numero:"PRV-167/26", titolo:"Bagno completo", data:"2026-11-10", validita:"2026-12-10", tipo_doc:"preventivo", tipo:"preventivo", stato:"bozza", linea:"showroom", lead_id:"x", lead:{ragione_sociale:"PIPPO SRL",telefono:"333",email:"a@b.it",sede:{nome:"Lissone"}}, cliente_id:null, iva_perc:22, note:"Nota di prova lunga ".repeat(20) } as any;
function P(){ return <div className="mx-auto max-w-7xl p-4"><TestataPreventivo prev={prev} cliente={null} modificabile statoEditabile agenti={[]} principali={[]} haAlternative={false} listino="L1" categoria="C" sede="Lissone" onSave={()=>{}} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}} caricamentoCataloghi={false} onRiferimento={async()=>{}}/></div>; }
