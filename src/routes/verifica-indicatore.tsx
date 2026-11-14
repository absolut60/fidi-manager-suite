import { createFileRoute } from "@tanstack/react-router";
import { FasciaPreventivo } from "@/components/preventivatore/FasciaPreventivo";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import type { PreventivoConDettagli, DatiClientePreventivo } from "@/lib/preventivi-api";

export const Route = createFileRoute("/verifica-indicatore")({ component: Verifica });
function Verifica() {
  const prev = { id:"00000000-0000-0000-0000-000000000001", cliente_id:"6b9329ec-9e52-4db9-9100-c250287e8832", titolo:"Ristrutturazione appartamento", numero:"PRV-PROVA", data:"2026-11-14", tipo_doc:"PREVENTIVO", tipo:"preventivo", stato:"bozza", blocchi:[], cliente:{ragione_sociale:"Impresa dimostrativa con nome esteso"}, iva_perc:22 } as unknown as PreventivoConDettagli;
  const cliente = {ragione_sociale:prev.cliente?.ragione_sociale,tipo_soggetto:"azienda",partita_iva:"00000000000",codice_fiscale:"00000000000"} as DatiClientePreventivo;
  return <main className="p-3"><FasciaPreventivo clienteId={prev.cliente_id} titolo={prev.titolo} onCliente={()=>{}} dati={{cliente:"Impresa dimostrativa con nome esteso",cantiere:"Da definire",listino:"L10",categoria:"Impresa",pagamento:"—",validita:"21/11/2026",imponibile:0,marginePerc:0,margineEuro:0}}/><TestataPreventivo prev={prev} cliente={cliente} modificabile={false} statoEditabile={false} agenti={[]} principali={[]} haAlternative={false} listino="L10" categoria="Impresa" sede="Sede dimostrativa" onSave={()=>{}} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}}/></main>;
}