import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { NuovoPreventivoDialog } from "@/components/preventivatore/NuovoPreventivoDialog";
import { TestataPreventivo } from "@/components/preventivatore/TestataPreventivo";
import { SoggettoPreventivoPicker } from "@/components/preventivatore/SoggettoPreventivoPicker";
import { Button } from "@/components/ui/button";
import { campiSoggettoPreventivo, riferimentoVuoto, type SoggettoPreventivo } from "@/lib/soggetto-preventivo";
import { fetchPreventivo, updatePreventivo, duplicaPreventivo, type PreventivoConDettagli } from "@/lib/preventivi-api";
import { opzioniCataloghiRiferimento } from "@/lib/condizioni-riferimento";
import { useQuery } from "@tanstack/react-query";
import { sedeGiacenzePreventivo } from "@/lib/preventivo-creazione";

export const Route = createFileRoute("/fm71-verifica-temporanea")({ component: Verifica });
function Verifica() {
  const [open,setOpen]=useState(true); const [prev,setPrev]=useState<PreventivoConDettagli|null>(null);
  const [cambio,setCambio]=useState(false); const [s,setS]=useState<SoggettoPreventivo|null>(null); const [rif,setRif]=useState(riferimentoVuoto);
  const cataloghi=useQuery(opzioniCataloghiRiferimento);
  const carica=async()=>setPrev(await fetchPreventivo("11111111-1111-4111-8111-111111111111"));
  return <main className="p-3">
    <NuovoPreventivoDialog open={open} onOpenChange={setOpen}/>
    <Button onClick={()=>setOpen(true)}>Nuovo preventivo</Button><Button onClick={carica}>Rileggi preventivo</Button>
    {prev && <><p>Giacenze: {sedeGiacenzePreventivo(prev,{store_id:prev.lead?.store_id??null,sede_nome:prev.lead?.sede?.nome??null}).sedeNome}</p>
      <TestataPreventivo prev={prev} cliente={null} modificabile statoEditabile agenti={[]} principali={[]} haAlternative={false} listino="—" categoria="—" sede="—" onSave={async p=>{await updatePreventivo(prev.id,p);await carica();}} onCliente={()=>{}} onChangeCliente={()=>{}} onCantiere={()=>{}} cataloghiRiferimento={cataloghi.data} caricamentoCataloghi={false} onRiferimento={async p=>{await updatePreventivo(prev.id,p);await carica();}} onCambiaSoggetto={()=>{setCambio(true);setS(null);setRif(riferimentoVuoto);}}/>
      <Button onClick={async()=>{await duplicaPreventivo(prev.id);await carica();}}>Duplica lead</Button>
    </>}
    {cambio && <><SoggettoPreventivoPicker value={s} onChange={setS} riferimento={rif} onRiferimento={setRif}/><Button onClick={async()=>{if(!s||!prev)return;await updatePreventivo(prev.id,campiSoggettoPreventivo(s,rif));await carica();setCambio(false);}}>Salva soggetto</Button></>}
  </main>;
}