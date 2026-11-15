import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LeadCondizioniCommerciali } from "@/components/lead/lead-condizioni-commerciali";
import { campiCondizioniCommercialiLead } from "@/lib/lead-condizioni-commerciali";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
const iniziale={condizione_pagamento_cod:"RB60",listino_rif:10,macrocategoria_rif:"01",categoria_rif:"02"};
function Verifica(){const [valori,setValori]=useState(iniziale);const [edit,setEdit]=useState(false);const [attivo,setAttivo]=useState(true);const [errore,setErrore]=useState("");
  const roles=new URLSearchParams(window.location.search).has("nascosto")?["marketing"]:["preventivi_manage"];
  async function salva(){try{const patch=campiCondizioniCommercialiLead(roles,attivo,valori);await supabase.from("lead").update(patch).eq("id","test");setEdit(false);setErrore("")}catch(e){setErrore((e as Error).message)}}
  return <main className="p-4"><h1>Condizioni commerciali</h1>{roles.includes("preventivi_manage") && <LeadCondizioniCommerciali key={String(edit)} valori={valori} modifica={edit} onValori={v=>setValori(p=>({...p,...v}) as typeof iniziale)} onAttivo={setAttivo}/>}<Button onClick={()=>setEdit(true)}>Modifica</Button><Button onClick={salva}>Salva</Button>{errore&&<p role="alert">{errore}</p>}</main>;
}
export const Route=createFileRoute("/fm72-condizioni-verifica")({component:()=> <ClientOnly><Verifica/></ClientOnly>});