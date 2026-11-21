import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIUTO_CALCOLA_DALLA_RIGA } from '@/lib/kit-semplice-ui';

/** Un solo contenuto per passaggio del mouse, tastiera e tocco. */
export function AiutoCalcolaDallaRiga() {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Informazioni su Calcola dalla riga"
      onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(true); }}>
      <Info className="h-3.5 w-3.5"/>
    </Button>
  </PopoverTrigger><PopoverContent className="max-h-[70dvh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto break-words text-xs"
    onOpenAutoFocus={e => e.preventDefault()} onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false); }}>
    {AIUTO_CALCOLA_DALLA_RIGA}
  </PopoverContent></Popover>;
}