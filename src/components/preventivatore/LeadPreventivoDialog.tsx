import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nomeLeadPreventivo, type LeadPreventivo } from "@/lib/soggetto-preventivo";
import { urlLeadIncorporato } from "@/lib/vista-incorporata";

/** Il lead proviene dalla lettura RLS del documento; la pagina incorporata mantiene i propri gate. */
export function LeadPreventivoDialog({ lead, onClose }: { lead: LeadPreventivo; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col rounded-none p-3 sm:h-[90dvh] sm:max-w-6xl sm:rounded-lg">
      <DialogHeader className="pr-8"><DialogTitle className="break-words">Lead · {nomeLeadPreventivo(lead)}</DialogTitle></DialogHeader>
      <iframe title="Scheda completa lead" src={urlLeadIncorporato(lead.id)} className="min-h-0 w-full flex-1 border-0" />
    </DialogContent>
  </Dialog>;
}