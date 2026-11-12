import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { badgeMacrocategoria, type TonoMacrocategoria } from "@/lib/scheda-fornitore";

export function AccessoFornitori({ children }: { children: ReactNode }) {
  const { hasAnyRole, loading } = useAuth();
  if (loading) return <p role="status">Caricamento…</p>;
  if (!hasAnyRole("amministratore", "amministrazione", "preventivi_read", "preventivi_write", "preventivi_manage")) return <p role="alert" className="p-4 text-destructive">Accesso non consentito: non hai accesso ai fornitori.</p>;
  return children;
}
export function useRicercaDifferita(value: string, aggiorna: (value: string) => void) {
  const [testo, setTesto] = useState(value);
  useEffect(() => setTesto(value), [value]);
  useEffect(() => {
    if (testo === value) return;
    const timer = setTimeout(() => aggiorna(testo), 300);
    return () => clearTimeout(timer);
  }, [testo, value, aggiorna]);
  return [testo, setTesto] as const;
}
export function BadgeFornitore({ fornitore: f }: { fornitore: { origine: string; persona_fisica: boolean | null; valida: boolean | null } }) {
  return <div className="flex flex-wrap gap-1">{f.origine === "manuale" && <Badge variant="secondary">Manuale</Badge>}{f.persona_fisica && <Badge variant="outline">Persona fisica</Badge>}{f.valida === false && <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning">Non valido in Gamma</Badge>}</div>;
}
const CLASSI_MACRO: Record<TonoMacrocategoria, string> = {
  merci: "border-info/30 bg-info/10 text-info",
  servizi: "border-motivo-autorizzare/30 bg-motivo-autorizzare-bg text-motivo-autorizzare",
  nd: "border-border bg-muted text-muted-foreground",
};
export function BadgeMacrocategoria({ cod, desc }: { cod: string | null | undefined; desc: string | null | undefined }) {
  const b = badgeMacrocategoria(cod, desc);
  return <Badge variant="outline" className={CLASSI_MACRO[b.tono]}>{b.testo}</Badge>;
}
export function FiltroSiNo({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>{label}</span><Select value={["si", "no"].includes(value) ? value : "tutti"} onValueChange={onChange}><SelectTrigger aria-label={label} className="min-h-10 w-full text-foreground"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tutti">Tutti</SelectItem><SelectItem value="si">Sì</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></label>;
}
export function PaginazioneFornitori({ totale, pagina, dimensione, onChange, nome }: { totale: number; pagina: number; dimensione: number; onChange: (value: number) => void; nome: string }) {
  const pagine = Math.max(1, Math.ceil(totale / dimensione));
  return <footer className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"><span className="tabular-nums">{totale.toLocaleString("it-IT", { useGrouping: true })} {nome} · Pagina {pagina.toLocaleString("it-IT", { useGrouping: true })} di {pagine.toLocaleString("it-IT", { useGrouping: true })}</span><div className="flex gap-2"><Button variant="outline" size="icon" aria-label="Pagina precedente" title="Pagina precedente" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}><ChevronLeft className="size-4" /></Button><Button variant="outline" size="icon" aria-label="Pagina successiva" title="Pagina successiva" disabled={pagina >= pagine} onClick={() => onChange(pagina + 1)}><ChevronRight className="size-4" /></Button></div></footer>;
}
export function ErroreFornitori({ error, riprova }: { error: Error; riprova: () => void }) {
  const accesso = error.message.includes("Accesso non consentito");
  return <div role="alert" className="space-y-3 py-6"><p className="break-words text-destructive">{accesso ? "Accesso non consentito: non hai i permessi necessari per consultare i fornitori." : `Impossibile caricare i dati. ${error.message}`}</p><Button variant="outline" onClick={riprova}>Riprova</Button></div>;
}