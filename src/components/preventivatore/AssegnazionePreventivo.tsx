import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { assegnazioneModificabile, nomeAssegnato, nomeUtenteAssegnabile, type AssegnazionePreventivoDati } from '@/lib/assegnazione-preventivo';
import { useUtentiAssegnabili } from '@/lib/use-utenti-assegnabili';
import { chiaveSalvaPreventivo } from '@/lib/use-stato-salvataggio-preventivo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltroMultiplo } from '@/components/filtro-multiplo';
import { RiquadroScheda } from './RiquadroScheda';

export function AssegnazionePreventivo({ prev, modificabile }: {
  prev: AssegnazionePreventivoDati & { id: string; stato: string; tipo: string };
  modificabile: boolean;
}) {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const utenti = useUtentiAssegnabili();
  const profili = utenti.data ?? [];
  const editabile = modificabile && assegnazioneModificabile(prev, roles);
  const save = useMutation({
    mutationKey: chiaveSalvaPreventivo(prev.id),
    mutationFn: async (patch: AssegnazionePreventivoDati) => {
      if (!editabile) throw new Error('Il documento è in sola lettura');
      const { data, error } = await supabase.from('preventivi')
        .update({ assegnato_a: patch.assegnato_a, assegnati_copia: [...new Set(patch.assegnati_copia)] })
        .eq('id', prev.id).select('id,assegnato_a,assegnati_copia').single();
      if (error || !data) throw new Error('Assegnazione non salvata: verifica i permessi e riprova');
      return data;
    },
    onSuccess: async data => {
      qc.setQueryData(['preventivo', prev.id], (old: Record<string, unknown> | undefined) => old ? { ...old, ...data } : old);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['preventivo', prev.id] }),
        qc.invalidateQueries({ queryKey: ['preventivi', 'elenco'] }),
        qc.invalidateQueries({ queryKey: ['preventivi-soggetto'] }),
      ]);
      toast.success('Assegnazione salvata');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const attesa = save.isPending || utenti.isLoading || !!utenti.error;
  return <RiquadroScheda titolo="Assegnazione" icona={Users} tono="verde" densita="compatta">
    {utenti.error && <p role="alert" className="mb-2 text-xs text-destructive">{utenti.error.message}</p>}
    {utenti.isLoading && <p className="mb-2 text-xs text-muted-foreground">Caricamento utenti…</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <Label className="text-xs">Responsabile</Label>
        {editabile ? <Select value={prev.assegnato_a || '__none__'} disabled={attesa} onValueChange={id => save.mutate({ assegnato_a: id === '__none__' ? null : id, assegnati_copia: prev.assegnati_copia })}>
          <SelectTrigger aria-label="Responsabile" className="h-10 w-full min-w-0 text-xs [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left"><SelectValue /></SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__none__">Nessuno</SelectItem>
            {prev.assegnato_a && !profili.some(p => p.id === prev.assegnato_a) && <SelectItem value={prev.assegnato_a} disabled>Utente non disponibile</SelectItem>}
            {profili.map(p => <SelectItem key={p.id} value={p.id} className="min-h-10 whitespace-normal break-words">{nomeUtenteAssegnabile(p)}</SelectItem>)}
          </SelectContent>
        </Select> : <p className="break-words text-xs">{nomeAssegnato(prev.assegnato_a, profili)}</p>}
      </div>
      <div className="min-w-0 space-y-1">
        <Label className="text-xs">In copia</Label>
        {editabile && <fieldset disabled={attesa} className="min-w-0 disabled:opacity-50">
          <FiltroMultiplo etichetta="In copia" testoTutti="Nessuno" cercabile className="h-10 text-xs"
            opzioni={profili.map(p => ({ valore: p.id, label: nomeUtenteAssegnabile(p) }))}
            selezionati={prev.assegnati_copia} onChange={ids => save.mutate({ assegnato_a: prev.assegnato_a, assegnati_copia: ids })}/>
        </fieldset>}
        <div className="flex min-w-0 flex-wrap gap-1">
          {prev.assegnati_copia.length === 0 ? <p className="text-xs text-muted-foreground">Nessuno</p> : prev.assegnati_copia.map(id => <span key={id} className="inline-flex max-w-full items-center gap-1 rounded border bg-muted px-2 text-xs">
            <span className="min-w-0 break-words py-1">{nomeAssegnato(id, profili)}</span>
            {editabile && <Button type="button" variant="ghost" size="icon" disabled={attesa} className="size-10 shrink-0" aria-label={`Rimuovi dalla copia ${nomeAssegnato(id, profili)}`} title="Rimuovi dalla copia" onClick={() => save.mutate({ assegnato_a: prev.assegnato_a, assegnati_copia: prev.assegnati_copia.filter(v => v !== id) })}><X className="size-3" /></Button>}
          </span>)}
        </div>
      </div>
    </div>
  </RiquadroScheda>;
}