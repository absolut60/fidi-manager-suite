import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NuovoLeadDialog } from '@/components/lead/nuovo-lead-dialog';
import { NuovoPreventivoDialog } from '@/components/preventivatore/NuovoPreventivoDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

/** Solo dati sintetici: lo script intercetta tutte le chiamate; nessuna credenziale reale. */
export function LeadCompletoFixture() {
  const { user, roles } = useAuth();
  const [modo, setModo] = useState<'preventivo' | 'ordine' | 'lista'>('preventivo');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const payload = btoa(JSON.stringify({ sub: '98000000-0000-0000-0000-000000000004', exp: Math.floor(Date.now() / 1000) + 3600 }));
    void supabase.auth.setSession({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-non-valida' });
  }, []);
  if (!user || !roles.length) return <p>Caricamento prova…</p>;
  return <main className="space-y-3 p-3">
    <p>Operatore di prova: {roles.join(', ')}</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => { setModo('preventivo'); setOpen(true); }}>Nuovo preventivo</Button>
      <Button onClick={() => { setModo('ordine'); setOpen(true); }}>Nuovo ordine</Button>
      <Button onClick={() => { setModo('lista'); setOpen(true); }}>Nuovo lead dalla lista</Button>
    </div>
    {modo === 'lista' ? <Dialog open={open} onOpenChange={setOpen}>{open && <NuovoLeadDialog onClose={() => setOpen(false)}/>}</Dialog>
      : <NuovoPreventivoDialog key={modo} open={open} onOpenChange={setOpen} tipo={modo}/>}
  </main>;
}