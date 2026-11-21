import { useState } from 'react';
import { MoreHorizontal, ShoppingCart, Trash2, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motivoTrasformazioneDisabilitata, type statoEvasionePreventivo } from '@/lib/evasione';

export function AzioniEvasione({ esito, inCorso, onTrasforma, onChiusura, onElimina }: {
  esito: ReturnType<typeof statoEvasionePreventivo>; inCorso: boolean;
  onTrasforma: () => void; onChiusura: (chiudi: boolean) => void; onElimina?: () => void;
}) {
  const [conferma, setConferma] = useState(false);
  const motivo = motivoTrasformazioneDisabilitata(esito);
  const chiuso = esito.stato === 'chiuso';
  return <>
    <TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={motivo ? 0 : undefined} className="inline-flex">
      <Button size="sm" variant="outline" className="border-pv-verde text-pv-verde hover:bg-pv-verde-tenue hover:text-pv-verde"
        disabled={!!motivo || inCorso} onClick={onTrasforma} aria-label={motivo ? `Trasforma in ordine — ${motivo}` : 'Trasforma in ordine'}>
        <ShoppingCart className="mr-1 size-4" />Trasforma in ordine
      </Button>
    </span></TooltipTrigger>{motivo && <TooltipContent>{motivo}</TooltipContent>}</Tooltip></TooltipProvider>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Altre azioni"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={inCorso} onSelect={() => chiuso ? onChiusura(false) : setConferma(true)}>
          {chiuso ? <Unlock className="mr-2 size-4" /> : <Lock className="mr-2 size-4" />}{chiuso ? 'Riapri preventivo' : 'Chiudi preventivo'}
        </DropdownMenuItem>
        {onElimina && <DropdownMenuItem className="text-destructive" onSelect={onElimina}><Trash2 className="mr-2 size-4" />Elimina</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={conferma} onOpenChange={setConferma}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Chiudere il preventivo?</AlertDialogTitle>
        <AlertDialogDescription>Il preventivo non sarà più trasformabile in ordine. Potrai riaprirlo in qualsiasi momento.</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel>
        <AlertDialogAction disabled={inCorso} onClick={() => onChiusura(true)}>Chiudi preventivo</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}