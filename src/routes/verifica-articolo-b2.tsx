import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { SchedaArticoloGamma, type DettaglioGamma } from '@/components/articoli/SchedaArticoloGamma';
import type { TabSchedaArticolo, RigaDisponibilitaArticolo } from '@/lib/scheda-articolo';
import fixture from '../../tmp-articolo-b2.json';
export const Route = createFileRoute('/verifica-articolo-b2')({ validateSearch: (s: Record<string, unknown>) => ({ codice: String(s.codice ?? 'AKINAF01007') }), component: Prova });
function Prova() {
 const qc = useQueryClient();
 const alp = Route.useSearch().codice === 'ALP46142';
 const a = { ...fixture, ...(alp ? { codice:'ALP46142',descrizione:'PELLET ENERGY ALPIN EN PLUS A1 SACCO KG.15 (72)',famiglia:'EDILIZIA',sottofamiglia:'PELLET',marche:{descrizione:'ALPIN PELLET'},fornitore:{ragione_sociale:'ALPIN PELLET SAS'},costo_ultimo:5.67 } : {}),fornitori:[],tecnico:null,utilizzo:null } as DettaglioGamma;
 const riga=(nome:string,disponibilita:number,livello='sede'): RigaDisponibilitaArticolo => ({nome,disponibilita,livello,store_id:nome,deposito_codice:livello==='logistica_comune'?'ZM':nome,conta_disponibilita:livello==='logistica_comune'?'logistica_comune':'si',giacenza:disponibilita,impegnato_clienti:0,ordinato_fornitori:0});
 const rows = alp ? [['Cambiago',198],['Casorezzo',1164],['Ceriano Laghetto',52],['Lissone',156],['Pianezza',519],['Savigliano',462],['Vercelli',125]].map(([n,v])=>riga(String(n),Number(v))).concat([riga('Logistica comune',936,'logistica_comune'),riga('ZM · Moncalieri',936,'deposito')]) : [];
 useEffect(()=> { qc.setQueryData(['catalogo-articolo-disponibilita',a.codice],rows); qc.setQueryDefaults(['catalogo-articolo-disponibilita',a.codice],{staleTime:Infinity}); },[a.codice]);
 const [tab,setTab]=useState<TabSchedaArticolo>('panoramica');
 return <div className="mx-auto max-w-7xl p-3 lg:p-6"><SchedaArticoloGamma articolo={a} tab={tab} onTabChange={(t)=> {setTab(t);history.pushState({},'',`?codice=${a.codice}&tab=${t}`);}} /></div>;
}
