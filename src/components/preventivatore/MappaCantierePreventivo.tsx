import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientOnly } from "@tanstack/react-router";
import { getChiaveMappe } from "@/lib/cantieri.functions";
import { linkIndicazioniCantiere } from "@/lib/cantiere-distanza";
import type { CantiereRow, SedeMappa } from "@/lib/cantieri";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const Mappa = lazy(() => import("@/components/cantieri-mappa"));
const nessunaApertura = () => {};
export function MappaCantierePreventivo({ open, onOpenChange, cantiere, sedi, sedeCliente }: {
  open: boolean; onOpenChange: (v: boolean) => void; cantiere: CantiereRow; sedi: SedeMappa[]; sedeCliente?: SedeMappa | null;
}) {
  const chiave = useServerFn(getChiaveMappe);
  const { data, error, isPending } = useQuery({ queryKey: ["chiave-mappe"], queryFn: () => chiave(), enabled: open, staleTime: Infinity, retry: false });
  const link = linkIndicazioniCantiere(cantiere, sedeCliente);
  const posizione = cantiere.lat != null && cantiere.lng != null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-full max-w-3xl max-h-[95dvh] overflow-y-auto rounded-none sm:rounded-lg">
    <DialogHeader><DialogTitle className="break-words">{cantiere.nome}</DialogTitle></DialogHeader>
    {!posizione ? <p className="text-sm text-muted-foreground">Posizione non disponibile: apri il cantiere e scegli l'indirizzo dai suggerimenti</p>
      : error || (!isPending && !data?.key) ? <p role="status" className="text-sm text-muted-foreground">Mappa non disponibile. Puoi aprire le indicazioni in Google Maps.</p>
      : isPending ? <p className="text-sm text-muted-foreground">Caricamento mappa…</p>
      : data?.key && <ClientOnly><Suspense fallback={<p>Caricamento mappa…</p>}><Mappa apiKey={data.key} cantieri={[cantiere]} sedi={sedi} onApri={nessunaApertura} compatta/></Suspense></ClientOnly>}
    {link && <a className="inline-flex min-h-10 items-center text-sm text-primary underline" href={link} target="_blank" rel="noopener noreferrer">Apri in Google Maps</a>}
  </DialogContent></Dialog>;
}