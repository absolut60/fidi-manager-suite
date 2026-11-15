import { Badge } from '@/components/ui/badge';
import { lineaPreventivo } from '@/lib/linee-preventivo';
import { cn } from '@/lib/utils';

export function BadgeLinea({ linea, className }: { linea: unknown; className?: string }) {
  const configurazione = lineaPreventivo(linea);
  return <Badge variant="outline" className={cn('max-w-full whitespace-normal break-words text-xs', configurazione.classiBadge, className)}>{configurazione.etichetta}</Badge>;
}