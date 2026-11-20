import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createKit, fetchKitFamiglie, fetchCodiciKit, type Kit, type KitInsert, type KitFamiglia } from '@/lib/kit-api';
import { useAuth } from '@/hooks/use-auth';
import { useLineeUtente } from '@/lib/use-linee-utente';
import { puoGestireAnagrafichePreventivi } from '@/lib/permessi-preventivi';
import { lineeKitAbilitate, proponiCodiceKit, specificheKitDaValori } from '@/lib/kit-config';
import { lineaPreventivo, type ConfigurazioneLineaPreventivo, type LineaPreventivo } from '@/lib/linee-preventivo';
import { SpecificheKitFields } from './SpecificheKitFields';
import { toast } from 'sonner';

export function NuovoKitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v:boolean)=>void }) {
  const { user, roles } = useAuth();
  const profilo = useLineeUtente(user?.id);
  const famiglie = useQuery({ queryKey:['kit-famiglie'], queryFn:fetchKitFamiglie, enabled:open });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const linee = lineeKitAbilitate(profilo.data?.linee_abilitate);
  const gestisce = puoGestireAnagrafichePreventivi(roles);
  const iniziale = linee.find(l=>l.codice===profilo.data?.linea_predefinita)?.codice ?? linee[0]?.codice;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0">
    <DialogHeader className="shrink-0 border-b p-4"><DialogTitle>Nuovo kit</DialogTitle><DialogDescription>Kit e componenti della linea selezionata.</DialogDescription></DialogHeader>
    {profilo.isError || famiglie.isError ? <p role="alert" className="p-4 text-sm text-destructive">Impossibile caricare linee e famiglie.</p>
      : !gestisce ? <p className="p-4 text-sm">Accesso riservato alla gestione delle anagrafiche.</p>
      : !iniziale ? <p className="p-4 text-sm">Nessuna linea abilitata.</p>
      : open && famiglie.data && <NuovoKitForm key={iniziale} linee={linee} iniziale={iniziale} famiglie={famiglie.data}
        onCancel={()=>onOpenChange(false)} onCreate={async row=>{
          const kit = await createKit(row);
          await Promise.all([qc.invalidateQueries({queryKey:['kit-lista-v2']}),qc.invalidateQueries({queryKey:['kit-codici']})]);
          toast.success('Kit creato'); onOpenChange(false); await navigate({to:'/kit/$id',params:{id:kit.id}}); return kit;
        }} />}
  </DialogContent></Dialog>;
}

export function NuovoKitForm({ linee, iniziale, famiglie, onCreate, onCancel }: {
  linee: ConfigurazioneLineaPreventivo[]; iniziale: LineaPreventivo; famiglie: KitFamiglia[];
  onCreate: (row:KitInsert)=>Promise<Kit>; onCancel:()=>void;
}) {
  const [linea,setLinea]=useState(iniziale);
  const [famigliaId,setFamigliaId]=useState('');
  const [codiceManuale,setCodiceManuale]=useState<string|null>(null);
  const [nome,setNome]=useState('');
  const [um,setUm]=useState(lineaPreventivo(iniziale).kit.umBaseDefault as string);
  const [descrizione,setDescrizione]=useState('');
  const [specifiche,setSpecifiche]=useState<Record<string,string>>({});
  const [errore,setErrore]=useState('');
  const codici = useQuery({queryKey:['kit-codici',linea],queryFn:()=>fetchCodiciKit(linea),staleTime:0});
  const config=lineaPreventivo(linea).kit;
  const famiglieLinea=famiglie.filter(f=>f.linea===linea && f.attiva);
  const famiglia=famiglieLinea.find(f=>f.id===famigliaId)?.id ?? famiglieLinea[0]?.id ?? '';
  const proposto=proponiCodiceKit(linea,codici.data ?? []);
  const codice=codiceManuale ?? proposto;
  const mut=useMutation({mutationFn:async()=>{
    if (!linee.some(l=>l.codice===linea)) throw new Error('Linea non abilitata');
    if (!famiglia) throw new Error('Scegli una famiglia attiva della linea');
    if (!nome.trim() || !codice.trim() || !um.trim()) throw new Error('Compila codice, nome e unità base');
    return onCreate({linea,famiglia_id:famiglia,codice:codice.trim(),nome:nome.trim(),um_base:um.trim(),descrizione_tecnica:descrizione.trim()||null,specifiche:specificheKitDaValori(linea,specifiche)});
  },onError:(e:Error)=>setErrore(e.message)});
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={e=>{e.preventDefault();setErrore('');mut.mutate();}}>
    <div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="nuovo-kit-linea">Linea</Label>{linee.length>1 ? <Select value={linea} onValueChange={v=>{
        const scelta=linee.find(l=>l.codice===v); if(!scelta)return;
        setLinea(scelta.codice);setFamigliaId('');setCodiceManuale(null);setUm(scelta.kit.umBaseDefault);setSpecifiche({});setErrore('');
      }}><SelectTrigger id="nuovo-kit-linea" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{linee.map(l=><SelectItem key={l.codice} value={l.codice}>{l.etichetta}</SelectItem>)}</SelectContent></Select>
        : <p className="flex min-h-11 items-center text-sm">{lineaPreventivo(linea).etichetta}</p>}</div>
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="nuovo-kit-famiglia">Famiglia *</Label><Select value={famiglia} onValueChange={setFamigliaId} disabled={!famiglieLinea.length}><SelectTrigger id="nuovo-kit-famiglia" className="min-h-11"><SelectValue placeholder="Nessuna famiglia attiva" /></SelectTrigger><SelectContent>{famiglieLinea.map(f=><SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="nuovo-kit-codice">Codice *</Label><Input id="nuovo-kit-codice" className="min-h-11 font-mono" value={codice} onChange={e=>{setCodiceManuale(e.target.value);setErrore('');}} /></div>
      <div className="grid min-w-0 gap-1.5"><Label htmlFor="nuovo-kit-um">Unità base *</Label><Input id="nuovo-kit-um" className="min-h-11" value={um} onChange={e=>setUm(e.target.value)} /></div>
      <div className="grid min-w-0 gap-1.5 sm:col-span-2"><Label htmlFor="nuovo-kit-nome">Nome *</Label><Input id="nuovo-kit-nome" className="min-h-11" value={nome} onChange={e=>setNome(e.target.value)} /></div>
      <SpecificheKitFields campi={config.specifiche} valori={specifiche} onChange={(k,v)=>setSpecifiche(s=>({...s,[k]:v}))} />
      <div className="grid min-w-0 gap-1.5 sm:col-span-2"><Label htmlFor="nuovo-kit-descrizione">Descrizione tecnica</Label><Textarea id="nuovo-kit-descrizione" rows={3} value={descrizione} onChange={e=>setDescrizione(e.target.value)} /></div>
      {!famiglieLinea.length && <p role="alert" className="text-sm text-muted-foreground sm:col-span-2">Nessuna famiglia attiva per questa linea.</p>}
      {codici.isError && <p role="alert" className="text-sm text-destructive sm:col-span-2">Impossibile proporre un codice. Riprova.</p>}
      {errore && <p role="alert" className="text-sm text-destructive sm:col-span-2">{errore}</p>}
    </div></div>
    <DialogFooter className="shrink-0 border-t bg-card p-4"><Button type="button" variant="outline" className="min-h-10" onClick={onCancel}>Annulla</Button><Button type="submit" className="min-h-10" disabled={!nome.trim()||!codice.trim()||!um.trim()||!famiglia||codici.isFetching||codici.isError||mut.isPending}>{mut.isPending?'Creazione…':'Crea kit'}</Button></DialogFooter>
  </form>;
}
