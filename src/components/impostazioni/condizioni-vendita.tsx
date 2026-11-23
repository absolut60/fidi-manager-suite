import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RiquadroAnagrafica } from '@/components/ui/riquadro-anagrafica';
import { lineeAttive, type ConfigurazioneLineaPreventivo } from '@/lib/linee-preventivo';
import { chiaveCondizioniVendita, leggiCondizioniVendita, salvaCondizioniVendita } from '@/lib/condizioni-vendita';

export function CondizioniVenditaImpostazioni() {
  const { role, user } = useAuth();
  if (role !== 'amministratore' || !user) return null;
  return <section className="space-y-3" aria-labelledby="condizioni-vendita-titolo">
    <h2 id="condizioni-vendita-titolo" className="font-semibold">Condizioni di vendita</h2>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {lineeAttive().map(linea => <CondizioniLinea key={linea.codice} linea={linea} userId={user.id} />)}
    </div>
  </section>;
}

function CondizioniLinea({ linea, userId }: { linea: ConfigurazioneLineaPreventivo; userId: string }) {
  const qc = useQueryClient();
  const chiave = chiaveCondizioniVendita(linea.codice);
  const queryKey = ['configurazioni', chiave];
  const { data, isPending, error } = useQuery({ queryKey, queryFn: () => leggiCondizioniVendita(linea.codice) });
  const [bozza, setBozza] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const testo = bozza ?? data ?? '';
  async function salva() {
    if (salvando || isPending || error) return;
    setSalvando(true);
    try {
      await salvaCondizioniVendita(linea.codice, linea.etichetta, testo, userId);
      qc.setQueryData(queryKey, testo);
      setBozza(null);
      toast.success(`Condizioni ${linea.etichetta} salvate`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossibile salvare le condizioni');
    } finally { setSalvando(false); }
  }
  return <RiquadroAnagrafica tono="primary" className={`space-y-3 ${linea.classiBordo}`}>
    <Label className="font-semibold" htmlFor={chiave}>{linea.etichetta}</Label>
    <Textarea id={chiave} value={testo} onChange={e => setBozza(e.target.value)}
      disabled={isPending || !!error || salvando} className="min-h-64 text-sm" aria-describedby={`${chiave}-nota`} />
    <p id={`${chiave}-nota`} className="text-xs text-muted-foreground break-words">
      {'{{validita}}'} = data di validità; senza data: «indicata nel preventivo».
      {' '}Righe in maiuscolo fino a 60 caratteri: titoli in grassetto. Righe vuote: separazione dei paragrafi.
    </p>
    {error && <p className="text-sm text-destructive">Impossibile leggere le condizioni. <Button variant="link" onClick={() => qc.invalidateQueries({ queryKey })}>Riprova</Button></p>}
    <div className="flex justify-end"><Button onClick={salva} disabled={isPending || !!error || salvando || bozza === null} className="min-h-10 gap-2" aria-label={`Salva condizioni ${linea.etichetta}`}>
      <Save className="size-4" />{salvando ? 'Salvataggio…' : 'Salva'}
    </Button></div>
  </RiquadroAnagrafica>;
}