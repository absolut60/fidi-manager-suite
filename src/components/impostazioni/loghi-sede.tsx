import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { brandingSede, verificaLogoPng } from '@/lib/branding-sede';
import { Button } from '@/components/ui/button';
import { ScegliFile } from '@/components/ui/scegli-file';
import { Skeleton } from '@/components/ui/skeleton';

type TipoLogo = 'email' | 'pdf';

/** Loghi email/PDF di una sede esistente: ogni azione salva subito, fuori dal form della sede. */
export function LoghiSede({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const { data: sede, isPending, error, refetch } = useQuery({
    queryKey: ['stores', 'loghi', storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('*').eq('id', storeId).single();
      if (error) throw error;
      return data;
    },
  });
  const [busy, setBusy] = useState(false);
  const [versione, setVersione] = useState(0);
  const [previews, setPreviews] = useState<{ email?: string; pdf?: string }>({});
  const pathEmail = sede?.logo_email_path ?? null;
  const pathPdf = sede?.logo_pdf_path ?? null;

  // URL firmati: funzionano anche con il bucket privato.
  useEffect(() => {
    let attivo = true;
    setPreviews({});
    async function carica() {
      const result: { email?: string; pdf?: string } = {};
      for (const [tipo, path] of [['email', pathEmail], ['pdf', pathPdf]] as const) {
        if (!path) continue;
        const { data, error } = await supabase.storage.from('branding').createSignedUrl(path, 3600);
        if (!error && data) result[tipo] = data.signedUrl;
      }
      if (attivo) setPreviews(result);
    }
    void carica();
    return () => { attivo = false; };
  }, [pathEmail, pathPdf, versione]);

  if (isPending) return <Skeleton className="h-32" />;
  if (error || !sede) return <div className="space-y-2 text-sm text-destructive">
    <p>Impossibile caricare i loghi</p><Button type="button" variant="outline" onClick={() => refetch()}>Riprova</Button>
  </div>;
  const branding = brandingSede(sede);

  async function aggiorna(patch: Database['public']['Tables']['stores']['Update']) {
    const { data, error } = await supabase.from('stores').update(patch).eq('id', storeId).select('id').single();
    if (error) throw error;
    if (!data) throw new Error('Non hai il permesso di modificare la sede');
    await qc.invalidateQueries({ queryKey: ['stores'] });
  }

  async function caricaLogo(tipo: TipoLogo, file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      await verificaLogoPng(file);
      const path = `sedi/${storeId}/logo-${tipo}.png`;
      const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: true, contentType: 'image/png', cacheControl: '0' });
      if (error) throw error;
      await aggiorna(tipo === 'email' ? { logo_email_path: path } : { logo_pdf_path: path });
      setVersione(v => v + 1);
      toast.success('Logo salvato');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Caricamento non riuscito'); }
    finally { setBusy(false); }
  }

  async function rimuoviLogo(tipo: TipoLogo) {
    const path = tipo === 'email' ? pathEmail : pathPdf;
    if (!path || !window.confirm(`Rimuovere il logo ${tipo === 'email' ? 'email' : 'PDF'} di ${sede!.nome}?`)) return;
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

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {(['email', 'pdf'] as const).map(tipo => {
      const path = tipo === 'email' ? pathEmail : pathPdf;
      const url = path ? previews[tipo] : tipo === 'email' ? branding.logoEmailUrl : null;
      const nome = tipo === 'email' ? 'email' : 'PDF';
      return <div key={tipo} className="min-w-0 space-y-2">
        <p className="text-sm font-medium">Logo {nome}</p>
        <div className={`flex h-20 items-center justify-center rounded-md border p-3 ${tipo === 'email' ? 'bg-branding-email text-primary-foreground' : 'bg-branding-pdf text-card-foreground'}`}>
          {url ? <img src={url} alt={`Logo ${nome} di ${sede.nome}`} className="max-h-full max-w-full object-contain" />
            : <span className="text-xs">{path ? 'Anteprima non disponibile' : 'Nessun logo'}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ScegliFile accept="image/png,.png" etichetta={path ? 'Sostituisci' : 'Carica PNG'} disabled={busy} onFiles={files => void caricaLogo(tipo, files[0])} className="[&>span]:hidden" />
          {path && <Button type="button" variant="ghost" disabled={busy} className="h-10 gap-2" onClick={() => void rimuoviLogo(tipo)}><Trash2 className="size-4" />Rimuovi</Button>}
        </div>
      </div>;
    })}
  </div>;
}
