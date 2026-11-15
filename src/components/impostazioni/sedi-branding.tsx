import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { brandingSede, verificaLogoPng } from '@/lib/branding-sede';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScegliFile } from '@/components/ui/scegli-file';
import { Skeleton } from '@/components/ui/skeleton';

type Sede = Database['public']['Tables']['stores']['Row'];
type TipoLogo = 'email' | 'pdf';
const contattiSchema = z.object({
  telefono: z.string().trim().max(30),
  email_sede: z.union([z.string().trim().max(150).email('Email non valida'), z.literal('')]),
  pec_sede: z.union([z.string().trim().max(150).email('PEC non valida'), z.literal('')]),
});

export function SediBranding() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['stores', 'branding'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').order('codice');
      if (error) throw error;
      return data;
    },
  });
  return <section aria-labelledby="sedi-branding-titolo" className="space-y-3">
    <h2 id="sedi-branding-titolo" className="flex items-center gap-2 font-semibold"><Building2 className="size-4" />Sedi</h2>
    {isPending ? <Skeleton className="h-40" /> : error ? <div className="space-y-2 text-sm text-destructive">
      <p>Impossibile caricare le sedi</p><Button variant="outline" onClick={() => refetch()}>Riprova</Button>
    </div> : data?.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
      {data.map(sede => <SchedaBrandingSede key={sede.id} sede={sede} />)}
    </div> : <p className="text-sm text-muted-foreground">Nessuna sede</p>}
  </section>;
}

export function SchedaBrandingSede({ sede }: { sede: Sede }) {
  const qc = useQueryClient();
  const [contatti, setContatti] = useState({ telefono: sede.telefono ?? '', email_sede: sede.email_sede ?? '', pec_sede: sede.pec_sede ?? '' });
  const [busy, setBusy] = useState(false);
  const [versione, setVersione] = useState(0);
  const [previews, setPreviews] = useState<{ email?: string; pdf?: string }>({});
  const branding = brandingSede(sede);
  // Funziona anche mentre la policy workspace impone il bucket privato.
  useEffect(() => {
    let attivo = true;
    setPreviews({});
    async function carica() {
      const result: { email?: string; pdf?: string } = {};
      for (const tipo of ['email', 'pdf'] as const) {
        const path = tipo === 'email' ? sede.logo_email_path : sede.logo_pdf_path;
        if (!path) continue;
        const { data, error } = await supabase.storage.from('branding').createSignedUrl(path, 3600);
        if (!error && data) result[tipo] = data.signedUrl;
      }
      if (attivo) setPreviews(result);
    }
    void carica();
    return () => { attivo = false; };
  }, [sede.logo_email_path, sede.logo_pdf_path, versione]);

  async function aggiorna(patch: Database['public']['Tables']['stores']['Update']) {
    const { data, error } = await supabase.from('stores').update(patch).eq('id', sede.id).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Non hai il permesso di modificare la sede');
    await qc.invalidateQueries({ queryKey: ['stores'] });
  }

  async function salvaContatti() {
    const validazione = contattiSchema.safeParse(contatti);
    if (!validazione.success) { toast.error(validazione.error.issues[0]?.message ?? 'Contatti non validi'); return; }
    setBusy(true);
    try {
      const dati = validazione.data;
      await aggiorna({ telefono: dati.telefono || null, email_sede: dati.email_sede || null, pec_sede: dati.pec_sede || null });
      toast.success('Contatti della sede salvati');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito'); }
    finally { setBusy(false); }
  }

  async function caricaLogo(tipo: TipoLogo, file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await verificaLogoPng(file);
      const path = `sedi/${sede.id}/logo-${tipo}.png`;
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true, contentType: 'image/png', cacheControl: '0' });
      if (error) throw error;
      await aggiorna(tipo === 'email' ? { logo_email_path: path } : { logo_pdf_path: path });
      setVersione(v => v + 1);
      toast.success('Logo salvato');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Caricamento non riuscito'); }
    finally { setBusy(false); }
  }

  async function rimuoviLogo(tipo: TipoLogo) {
    const path = tipo === 'email' ? sede.logo_email_path : sede.logo_pdf_path;
    if (!path || !window.confirm(`Rimuovere il logo ${tipo === 'email' ? 'email' : 'PDF'} di ${sede.nome}?`)) return;
    setBusy(true);
    try {
      // Prima il riferimento verificato, poi il file: un UPDATE negato non elimina il logo.
      await aggiorna(tipo === 'email' ? { logo_email_path: null } : { logo_pdf_path: null });
      const { error } = await supabase.storage.from('branding').remove([path]);
      if (error) throw new Error('Logo scollegato dalla sede, ma il file non è stato rimosso');
      toast.success('Logo rimosso');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Rimozione non riuscita'); }
    finally { setBusy(false); }
  }

  return <Card className="min-w-0 border-l-4 border-l-accent p-3 sm:p-4 space-y-3">
    <div className="min-w-0">
      <h3 className="font-semibold break-words">{sede.nome}</h3>
      <p className="text-sm text-muted-foreground break-words"><span className="font-mono">{sede.codice}</span>{sede.insegna ? ` · ${sede.insegna}` : ''}</p>
    </div>
    <form onSubmit={event => { event.preventDefault(); void salvaContatti(); }} className="space-y-3">
      {(['telefono', 'email_sede', 'pec_sede'] as const).map(campo => <div key={campo} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
        <Label htmlFor={`${sede.id}-${campo}`}>{campo === 'telefono' ? 'Telefono' : campo === 'email_sede' ? 'Email' : 'PEC'}</Label>
        <Input id={`${sede.id}-${campo}`} type={campo === 'telefono' ? 'tel' : 'email'} maxLength={campo === 'telefono' ? 30 : 150}
          value={contatti[campo]} disabled={busy} onChange={event => setContatti(c => ({ ...c, [campo]: event.target.value }))} />
      </div>)}
      <Button type="submit" variant="outline" disabled={busy} className="h-10 gap-2"><Save className="size-4" />Salva contatti</Button>
    </form>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['email', 'pdf'] as const).map(tipo => {
        const path = tipo === 'email' ? sede.logo_email_path : sede.logo_pdf_path;
        const url = path ? previews[tipo] : tipo === 'email' ? branding.logoEmailUrl : null;
        return <div key={tipo} className="min-w-0 space-y-2">
          <h4 className="text-sm font-medium">Logo {tipo === 'email' ? 'email' : 'PDF'}</h4>
          <div className={`flex h-20 items-center justify-center border rounded-md p-3 ${tipo === 'email' ? 'bg-branding-email text-primary-foreground' : 'bg-branding-pdf text-card-foreground'}`}>
            {url ? <img src={url} alt={`Logo ${tipo === 'email' ? 'email' : 'PDF'} di ${sede.nome}`} className="max-h-full max-w-full object-contain" />
              : <span className="text-xs">{path ? 'Anteprima non disponibile' : 'Nessun logo'}</span>}
          </div>
          <ScegliFile accept="image/png,.png" etichetta={path ? 'Sostituisci' : 'Carica PNG'} disabled={busy} onFiles={files => void caricaLogo(tipo, files[0])} className="[&>span]:hidden" />
          {path && <Button type="button" variant="ghost" disabled={busy} className="h-10 gap-2" onClick={() => void rimuoviLogo(tipo)}><Trash2 className="size-4" />Rimuovi</Button>}
        </div>;
      })}
    </div>
  </Card>;
}