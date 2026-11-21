import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import type { KitConComponenti, KitComponenteUpdate } from '@/lib/kit-api';
import { lineaPreventivo, type LineaPreventivo } from '@/lib/linee-preventivo';
import type { RigaRegoleKit } from '@/lib/kit-regole';
import type { RigaMenuKit } from '@/lib/kit-semplice-ui';
import { CAMPI_SEMPLICI_KIT, type CampoSempliceKit } from '@/lib/kit-semplice-ui';
import { CampiCalcoloKit, campoCalcoloKit, NumeroKit, formatoQuantitaKit } from './CampiCalcoloKit';

export type ComponenteKitVista = KitConComponenti['componenti'][number];
export function ComponenteKit({ row, linea, um, modificabile: autorizzato, mobile = false, onPatch, onChange, onDelete, onEdit, righe, anteprima }: {
  row: ComponenteKitVista; linea: LineaPreventivo; um: string; modificabile: boolean; mobile?: boolean;
  onPatch: (patch: KitComponenteUpdate) => Promise<void>; onChange: (patch: KitComponenteUpdate) => void;
  onDelete: () => void; onEdit: () => void; righe: readonly RigaMenuKit[]; anteprima: RigaRegoleKit | undefined;
}) {
  const config = lineaPreventivo(linea);
  const completa = config.kit.calcoloSemplice === 'completo';
  const campi = completa ? CAMPI_SEMPLICI_KIT : CAMPI_SEMPLICI_KIT.filter(c => c.codice === 'n_pezzi');
  const modificabile = autorizzato;
  const colSpan = campi.length + 6;
  const cambia = (campo: CampoSempliceKit, n: number | null) => onChange({ [campo]: n });
  const salva = (campo: CampoSempliceKit, n: number | null) => onPatch({ [campo]: n });
  const campoProps = { row, completa, righe, disabled: !modificabile, onChange: cambia, onSave: salva };
  const articolo = <div className="min-w-0 space-y-1">
    {modificabile ? <Button variant="link" className="h-auto min-h-10 max-w-full justify-start whitespace-normal break-all p-0 text-left font-mono text-xs" onClick={onEdit}>{row.articolo_codice ?? row.codice_articolo_fornitore ?? 'Definisci articolo'}</Button>
      : <p className="break-all font-mono text-xs">{row.articolo_codice ?? row.codice_articolo_fornitore ?? '—'}</p>}
    <p className="break-words text-xs">{row.articolo?.descrizione ?? row.descrizione ?? 'Articolo da definire'}</p>
    <p className="text-xs text-muted-foreground">U.M. {row.articolo?.um ?? row.um ?? '—'}{!row.articolo_codice ? ' · manuale' : ''}</p>
    {row.note && <p className="break-words text-xs text-muted-foreground">{row.note}</p>}
  </div>;
  const quantita = <div className="space-y-1" data-quantita-riga={row.ordine}><strong className="break-all font-mono text-xs">{formatoQuantitaKit(anteprima?.quantitaPerUnita)}</strong>
    {anteprima && <p className="text-xs text-muted-foreground">Calcolo</p>}</div>;
  const peso = <NumeroKit campo="peso_unitario" etichetta={`Peso unitario riga ${row.ordine}`} valore={row.peso_unitario} disabled={!modificabile} compatto={!mobile}
    onChange={n => cambia('peso_unitario', n)} onSave={n => salva('peso_unitario', n)}/>;
  const azioni = modificabile && <div className="flex shrink-0 flex-col gap-1"><Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Modifica riga ${row.ordine}`} title="Modifica riga" onClick={onEdit}><Pencil className="h-4 w-4"/></Button>
    <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label={`Elimina riga ${row.ordine}`} title="Elimina riga" onClick={onDelete}><Trash2 className="h-4 w-4"/></Button></div>;
  const errore = anteprima?.errore && <p role="alert" className="break-words text-xs text-destructive">{anteprima.errore}</p>;
  return mobile ? <Card className={`min-w-0 border-l-4 ${config.classiBordo}`}><CardContent className="space-y-3 p-3">
    <section className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Articolo · {row.ordine}</h3>{articolo}</div>{azioni}</section>
    <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Calcolo</h3><CampiCalcoloKit {...campoProps}/><div className="max-w-xs space-y-1"><Label className="text-xs">Peso unit. (kg)</Label>{peso}</div></section>
    <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">Risultato</h3><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Incidenza / {um}</p>{quantita}</div><div><p className="text-xs text-muted-foreground">Peso/{um} (kg)</p><strong className="font-mono text-xs">{formatoQuantitaKit(anteprima?.pesoPerUnita)}</strong></div></div>{errore}</section>
  </CardContent></Card> : <><TableRow className="align-top text-xs"><TableCell className="px-1 py-2 font-mono">{row.ordine}</TableCell><TableCell className="px-2 py-2">{articolo}</TableCell>
    {campi.map(c => <TableCell key={c.codice} className="px-0.5 py-2">{campoCalcoloKit({ ...campoProps, campo: c, compatto: true })}</TableCell>)}
    <TableCell className="px-1 py-2">{quantita}</TableCell><TableCell className="px-0.5 py-2">{peso}</TableCell><TableCell className="break-all px-1 py-2 font-mono text-xs">{formatoQuantitaKit(anteprima?.pesoPerUnita)}</TableCell><TableCell className="px-0.5 py-2">{azioni}</TableCell>
  </TableRow>{errore && <TableRow><TableCell colSpan={colSpan} className="py-2">{errore}</TableCell></TableRow>}</>;
}
