import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { letturaReportCerved } from "../src/lib/cerved-lettura";
import { gradingCervedPresentazione, eventiAziendaAssenti, datiSchedaCerved } from "../src/lib/cerved-presentazione";
const lr = normalizzaLightReportXml(readFileSync(new URL("./fixtures/cerved-light-report-ge-trade.xml",import.meta.url),"utf8"));
for (const [codice,descrizione,esito] of [["C4_1","Assenti","verde"],["C5_1","Assente","verde"],["C5_2","Alcuni segnali di rischio","ambra"],["C5_3","Forti segnali di rischio","rosso"],["C6_1","Assenza di segnali di rischio","verde"]]) {
 test(`decodifica ${codice}`,()=>expect(gradingCervedPresentazione({gradings:{richieste:23,dettagli:{richieste:{descrizione:codice}}}},[],"CNSL")).toMatchObject({descrizione,esito,valore:23}));
}
for(const codice of ["C3_1","C3_2","C3_3","C5_9"]){test(`${codice} neutro`,()=>expect(gradingCervedPresentazione({gradings:{payline:41,dettagli:{payline:{descrizione:codice}}}},[],"PAY")).toMatchObject({descrizione:null,esito:"neutro",valore:41}));}
test("G-E TRADE: MOL ed EBITDA distinti",()=>{expect(lr.bilanci.map(b=>b.mol)).toEqual([751000,254000,161000]);expect(lr.bilanci.map(b=>b.ebitda)).toEqual([745000,359000,165000]);});
test("G-E TRADE: campi XML verificati",()=>expect(lr.bilanci[0]).toMatchObject({debiti_banche_breve:484000,debiti_banche_medio_lungo:1023000,passivo_breve:1379000,immobilizzazioni_materiali:1795000,cash_flow:464000,ebit:593000,current_ratio:137.1,indice_indebitamento:2.200345}));
test("G-E TRADE: nessun evento da flag non decodificati",()=>{expect(eventiAziendaAssenti(lr)).toBe(true);expect(datiSchedaCerved({light_report:lr}).eventi.collegati).toHaveLength(5);});
test("evento vero esclude assenza",()=>expect(eventiAziendaAssenti({...lr,eventi_negativi:{azienda:{protesti:true}}})).toBe(false));
const r=letturaReportCerved(lr,145000,88061.67);
for(const id of ["fatturato","utile","patrimonio","eventi","cebi"]) test(`G-E TRADE forza ${id}`,()=>expect(r.forza.some(s=>s.id===id)).toBe(true));
for(const id of ["consultazioni","fornitori","struttura","banche","liquidita","fido","esposizione","score"]) test(`G-E TRADE attenzione ${id}`,()=>expect(r.attenzione.some(s=>s.id===id)).toBe(true));
test("G-E TRADE: 7 richieste imprese, 63 totali, banche +450%",()=>{expect(r.attenzione.find(s=>s.id==='fornitori')?.testo).toContain('7 richieste');expect(r.attenzione.find(s=>s.id==='consultazioni')?.testo).toContain('63');expect(r.attenzione.find(s=>s.id==='banche')?.testo).toContain('+450%');expect(r.tono).toBe('ambra');});
const report=(a:any,p:any={})=>({bilanci:[{data_chiusura:'2025-12-31',...a},{data_chiusura:'2024-12-31',...p}]});
const ha=(x:any,id:string)=>letturaReportCerved(x).attenzione.some(s=>s.id===id);
test("fatturato crescita oltre 10%",()=>{expect(letturaReportCerved(report({ricavi:111},{ricavi:100})).forza.some(s=>s.id==='fatturato')).toBe(true);expect(letturaReportCerved(report({ricavi:110},{ricavi:100})).forza).toHaveLength(0);});
test("fatturato calo oltre -10%",()=>{expect(ha(report({ricavi:89},{ricavi:100}),'fatturato')).toBe(true);expect(ha(report({ricavi:90},{ricavi:100}),'fatturato')).toBe(false);});
test("perdita esercizio",()=>{expect(ha(report({utile:-1}),'perdita')).toBe(true);expect(ha(report({utile:0}),'perdita')).toBe(false);});
test("patrimonio negativo",()=>{expect(ha(report({patrimonio_netto:-1}),'patrimonio')).toBe(true);expect(ha(report({patrimonio_netto:0}),'patrimonio')).toBe(false);});
test("patrimonio calo oltre -20%",()=>{expect(ha(report({patrimonio_netto:79},{patrimonio_netto:100}),'patrimonio')).toBe(true);expect(ha(report({patrimonio_netto:80},{patrimonio_netto:100}),'patrimonio')).toBe(false);});
test("banche crescita oltre 50%, ripiego totale",()=>{expect(ha(report({debiti_banche:151},{debiti_banche:100}),'banche')).toBe(true);expect(ha(report({debiti_banche:150},{debiti_banche:100}),'banche')).toBe(false);});
test("liquidità sotto 25%",()=>{expect(ha(report({liquidita:24,passivo_breve:100}),'liquidita')).toBe(true);expect(ha(report({liquidita:25,passivo_breve:100}),'liquidita')).toBe(false);});
test("current ratio sotto 100",()=>{expect(ha(report({current_ratio:99}),'current_ratio')).toBe(true);expect(ha(report({current_ratio:100}),'current_ratio')).toBe(false);});
test("current ratio calo oltre 30%",()=>{expect(ha(report({current_ratio:139},{current_ratio:200}),'current_ratio')).toBe(true);expect(ha(report({current_ratio:140},{current_ratio:200}),'current_ratio')).toBe(false);});
test("fido MADE oltre doppio",()=>{expect(letturaReportCerved({fido_certificato:{valore:100}},201).attenzione[0]?.id).toBe('fido');expect(letturaReportCerved({fido_certificato:{valore:100}},200).attenzione).toHaveLength(0);});
test("esposizione oltre certificato",()=>{expect(letturaReportCerved({fido_certificato:{valore:100}},null,101).attenzione[0]?.id).toBe('esposizione');expect(letturaReportCerved({fido_certificato:{valore:100}},null,100).attenzione).toHaveLength(0);});
test("score sotto 40",()=>{expect(ha({score_cgs:{valore:39}},'score')).toBe(true);expect(ha({score_cgs:{valore:40}},'score')).toBe(false);});
test("dati mancanti: regole saltate",()=>{expect(letturaReportCerved({}).attenzione).toEqual([]);expect(letturaReportCerved({}).forza).toEqual([]);expect(letturaReportCerved({}).confronto).toBeNull();});
test("CEBI V2/R1-R4",()=>{for(const codice of ['V2','R1','R2','R3','R4'])expect(ha({gradings:{cebi:{codice}}},'cebi')).toBe(true);expect(ha({gradings:{cebi:{codice:'V1'}}},'cebi')).toBe(false);});
test("struttura: 1–2 addetti, fatturato oltre 1 mln",()=>{for(const dipendenti of [1,2])expect(ha({...report({ricavi:1000001}),anagrafica:{dipendenti}},'struttura')).toBe(true);for(const dipendenti of [0,3])expect(ha({...report({ricavi:1000001}),anagrafica:{dipendenti}},'struttura')).toBe(false);expect(ha({...report({ricavi:1000000}),anagrafica:{dipendenti:1}},'struttura')).toBe(false);});
test("imprese: almeno 5 nei due mesi più recenti",()=>{const dati=(n:number)=>({richieste_12_mesi:{per_mese:[{anno:'2026',mese:'10',aziende:2},{anno:'2026',mese:'11',aziende:n}]}});expect(ha(dati(3),'fornitori')).toBe(true);expect(ha(dati(2),'fornitori')).toBe(false);});
test("sintesi: rosso o almeno due ambra",()=>{expect(letturaReportCerved({score_cgs:{valore:39}}).tono).toBe('neutro');expect(letturaReportCerved({...report({utile:-1})}).tono).toBe('ambra');expect(letturaReportCerved({...report({liquidita:1,passivo_breve:100}),score_cgs:{valore:39}}).tono).toBe('ambra');expect(letturaReportCerved({score_cgs:{valore:50}}).tono).toBe('verde');});
test("campi aggiuntivi assenti restano null",()=>expect(normalizzaLightReportXml('<LightReport><BalanceSheetCebi><BalanceSheetInfo><ProfitAndLoss><Ebitda><Value>10</Value></Ebitda></ProfitAndLoss></BalanceSheetInfo></BalanceSheetCebi></LightReport>').bilanci[0]).toMatchObject({mol:null,ebitda:10000,debiti_banche_breve:null,passivo_breve:null,current_ratio:null,cash_flow:null}));
