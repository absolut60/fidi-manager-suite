import { createFileRoute } from '@tanstack/react-router';
import { SchedaBrandingSede } from '@/components/impostazioni/sedi-branding';
import type { Database } from '@/integrations/supabase/types';
const sede: Database['public']['Tables']['stores']['Row'] = {
  id: '11111111-1111-4111-8111-111111111111', codice: 'TEST', nome: 'Sede di prova con ragione sociale molto lunga',
  insegna: 'MADE · Insegna di prova', telefono: null, email_sede: null, pec_sede: null,
  indirizzo: null, cap: null, citta: null, provincia: null, piva: null, ragione_sociale_sede: null,
  attivo: true, created_at: '', updated_at: '', lat: null, lng: null, geocodifica_stato: null,
  geocodificato_il: null, listino_riferimento: null, logo_email_path: null, logo_pdf_path: null,
};
export const Route = createFileRoute('/verifica-branding')({ component: () => <div className="p-4 max-w-7xl mx-auto"><h1 className="text-2xl mb-4">Sedi</h1><div className="grid grid-cols-1 xl:grid-cols-2 gap-3"><SchedaBrandingSede sede={sede} /><SchedaBrandingSede sede={{ ...sede, id: '22222222-2222-4222-8222-222222222222', nome: 'Seconda sede' }} /></div></div> });