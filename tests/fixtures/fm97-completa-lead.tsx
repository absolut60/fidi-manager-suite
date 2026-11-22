import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { EsportaGammaContenuto } from '@/components/preventivatore/EsportaGammaDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { completaDatiGamma } from '@/lib/esportazione-gamma-operazioni';
import { ordineFm96 } from './fm96-gamma';

/** Solo fixture locale: nessuna scrittura/rete verso il database. */
export function CompletaLeadFixture({ scenario }: { scenario: string }) {
  const qc = useQueryClient();
  const iniziale = useRef((() => {
    const d = ordineFm96();
    d.ordine.cliente_id = null; d.ordine.lead_id = '97000000-0000-0000-0000-000000000011'; d.ordine.numero = 'ORD-PROVA/26';
    d.cliente = null;
    d.lead = { id: d.ordine.lead_id, ragione_sociale: scenario === 'persona' ? null : 'Impresa di prova',
      nome: null, cognome: null, tipo_soggetto: scenario === 'persona' ? 'persona_fisica' : 'azienda',
      partita_iva: scenario === 'persona' ? null : '01234567890', codice_fiscale: null,
      indirizzo: null, cap: scenario === 'parziale' ? '20900' : null, citta: null, provincia: 'MB', codice_sdi: '',
      listino_rif: 20, macrocategoria_rif: '01', categoria_rif: '02' };
    return d;
  })());
  const fonte = useRef(structuredClone(iniziale.current));
  const [dati, setDati] = useState(() => [structuredClone(fonte.current)]);
  const [chiamate, setChiamate] = useState(0);
  const [ultimo, setUltimo] = useState<unknown>(null);
  useEffect(() => { qc.setQueryData(['chiave-mappe'], 'fixture-google-local-only'); }, [qc]);
  const client = { rpc: async (nome: string, args: {
    _ordine_id: string; _listino: number | null; _macrocategoria: string | null; _categoria: string | null;
    _codice_sdi: string; _anagrafica: Record<string, string | null>;
  }) => {
    setChiamate(n => n + 1); setUltimo({ nome, args });
    if (scenario === 'errore') return { error: { message: 'Salvataggio negato: ordine esportato' } };
    const d = fonte.current;
    if (d.lead) {
      Object.assign(d.lead, Object.fromEntries(Object.entries(args._anagrafica).filter(([, v]) => v !== null).map(([k, v]) => [k, v || null])), { codice_sdi: args._codice_sdi || null });
    }
    Object.assign(d.ordine, { listino_rif: args._listino, macrocategoria_rif: args._macrocategoria, categoria_rif: args._categoria });
    return { error: null };
  } } as unknown as SupabaseClient<Database>;
  return <>
    <output hidden data-testid="persistito">{JSON.stringify({ chiamate, ultimo, dati })}</output>
    <Dialog open>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-none p-3 sm:h-[min(90dvh,60rem)] sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-lg sm:p-5">
        <DialogHeader className="shrink-0 pr-8 text-left"><DialogTitle>Esporta in Gamma</DialogTitle><DialogDescription>Ordini selezionati: 1</DialogDescription></DialogHeader>
        <EsportaGammaContenuto dati={dati} cataloghi={{ listini: [{ codice: 20, descrizione: 'Listino prova' }], macrocategorie: [{ codice: '01', label: 'Macro prova' }], categorie: [{ codice: '02', label: 'Categoria prova' }] }}
          inCorso={false} onClose={() => undefined} onExport={() => undefined} onSave={async (id, valori) => {
            await completaDatiGamma(id, valori, client);
            setDati([structuredClone(fonte.current)]);
          }} />
      </DialogContent>
    </Dialog>
  </>;
}