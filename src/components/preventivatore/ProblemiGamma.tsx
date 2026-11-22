import type { DatiOrdineGamma, ProblemaEsportazione } from '@/lib/esportazione-gamma';

/** Stesso contenuto per il file di prova e per l'esportazione definitiva. */
export function ProblemiGamma({ problemi, dati }: { problemi: ProblemaEsportazione[]; dati: DatiOrdineGamma[] }) {
  const descrizioni = new Map(dati.flatMap(d => d.righe.map(r => [r.id, r.descrizione ?? 'Riga senza descrizione'] as const)));
  return <ul className="divide-y divide-border text-sm">
    {problemi.map((p, i) => <li key={`${p.ordineId}-${p.codice}-${p.rigaId ?? ''}-${i}`} className="min-w-0 py-2 first:pt-0 last:pb-0">
      {p.rigaId && <p className="mb-1 break-words text-xs font-medium text-foreground">{descrizioni.get(p.rigaId) ?? 'Riga senza descrizione'}</p>}
      <p className={`break-words ${p.livello === 'bloccante' ? 'text-destructive' : 'text-pv-arancio'}`}>{p.messaggio}</p>
    </li>)}
  </ul>;
}