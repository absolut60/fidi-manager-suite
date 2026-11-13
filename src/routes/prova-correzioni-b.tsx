import { createFileRoute } from '@tanstack/react-router';
import { RigheTable } from '@/components/preventivatore/RigheTable';
import type { BloccoConRighe } from '@/lib/preventivi-api';
export const Route = createFileRoute('/prova-correzioni-b')({ component: Prova });
const base = {tipo_riga:'articolo_singolo', articolo_codice:'FASL00H003300A0', descrizione:'LASTRA CARTONGESSO VERDE GYPSOTECH AQUA H2 BA 1200X3000 SP.13 MM DESCRIZIONE MOLTO LUNGA', quantita:40, incidenza:2, prezzo_unit:3.7503, sconti_gamma:[10], maggiorazione_perc:0, sconto_perc:0, costo_unit:3.01, segno:1, um:'MQ', peso_gamma_unit:null, unita_gamma:{um:'MQ',um2:'NR',fattore_conversione:3.6}};
const blocco = {id:'blocco-prova',quantita_base:20,righe:[{...base,id:'r1',ordine:1,um_scelta:'um1'},{...base,id:'r2',ordine:2,um_scelta:'um2'}]} as unknown as BloccoConRighe;
function Prova(){ return <main className="p-2"><fieldset disabled><RigheTable blocco={blocco} preventivoId="prova" fascia="A" readOnly clienteId="cliente-prova" /></fieldset></main>; }
