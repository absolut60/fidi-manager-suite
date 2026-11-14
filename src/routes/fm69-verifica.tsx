import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CantiereTestata } from "@/components/preventivatore/CantiereTestata";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
export const Route = createFileRoute("/fm69-verifica")({ component: Verifica });
function Verifica() {
const [id, setId] = useState("11111111-1111-4111-8111-111111111111");
const prev = {id:"verifica",cliente_id:"22222222-2222-4222-8222-222222222222",cantiere_id:id,cantiere:{id,nome:id.startsWith("333")?"Cantiere scelto":"Cantiere con nome lungo per la verifica dei prezzi dedicati",indirizzo:"Via Roma 10",cap:"20010",citta:"Casorezzo",provincia:"MI"},cliente:{ragione_sociale:"Cliente prova"}} as unknown as PreventivoConDettagli;
return <div className="p-3 lg:max-w-xl"><CantiereTestata prev={prev} modificabile onCantiere={async id=>{setId(id);}}/></div>;
}
