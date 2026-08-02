import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatEuro } from "@/lib/template-email-render";
import {
  LEAD_RICHIESTA_STATO_LABEL, LEAD_RICHIESTA_TIPO_LABEL, formatData,
  type LeadRichiestaStato, type LeadRichiestaTipo,
} from "@/lib/lead-costanti";

const NESSUNO = "__none__";

const STATI_TERMINALI: LeadRichiestaStato[] = ["evasa", "respinta"];

const STATO_CLASS: Record<LeadRichiestaStato, string> = {
  aperta: "bg-sky-500/15 text-sky-600",
  in_lavorazione: "bg-amber-500/15 text-amber-600",
  evasa: "bg-emerald-500/15 text-emerald-600",
  respinta: "bg-destructive/15 text-destructive",
};

type Richiesta = {
  id: string;
  tipo: LeadRichiestaTipo;
  oggetto: string | null;
  descrizione: string | null;
  stato: LeadRichiestaStato;
  importo_stimato: number | null;
  esito: string | null;
  assegnato_a: string | null;
  created_at: string;
};

type FormRichiesta = {
  tipo: LeadRichiestaTipo;
  oggetto: string;
  descrizione: string;
  importo_stimato: string;
  stato: LeadRichiestaStato;
  assegnato_a: string;
  esito: string;
};

const FORM_VUOTO: FormRichiesta = {
  tipo: "preventivo",
  oggetto: "",
  descrizione: "",
  importo_stimato: "",
  stato: "aperta",
  assegnato_a: NESSUNO,
  esito: "",
};

export function LeadRichiesteTab({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [aperto, setAperto] = useState(false);
  const [inModifica, setInModifica] = useState<Richiesta | null>(null);
  const [f, setF] = useState<FormRichiesta>(FORM_VUOTO);

  const set = <K extends keyof FormRichiesta>(k: K, v: FormRichiesta[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const { data: richieste, isLoading } = useQuery({
    queryKey: ["lead-richieste", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_richieste")
        .select("id, tipo, oggetto, descrizione, stato, importo_stimato, esito, assegnato_a, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Richiesta[];
    },
  });

  const { data: profili } = useQuery({
    queryKey: ["utenti-assegnabili"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_utenti_assegnabili");
      return (data ?? []) as { id: string; nome: string | null; cognome: string | null }[];
    },
    staleTime: 5 * 60_000,
  });

  const nomeProfilo = useMemo(
    () => (id: string | null) => {
      if (!id) return "—";
      const p = profili?.find((x) => x.id === id);
      return p ? `${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || "—" : "—";
    },
    [profili],
  );

  const terminale = STATI_TERMINALI.includes(f.stato);

  const invalida = () => qc.invalidateQueries({ queryKey: ["lead-richieste", leadId] });

  const apriNuova = () => {
    setInModifica(null);
    setF(FORM_VUOTO);
    setAperto(true);
  };

  const apriModifica = (r: Richiesta) => {
    setInModifica(r);
    setF({
      tipo: r.tipo,
      oggetto: r.oggetto ?? "",
      descrizione: r.descrizione ?? "",
      importo_stimato: r.importo_stimato == null ? "" : String(r.importo_stimato),
      stato: r.stato,
      assegnato_a: r.assegnato_a ?? NESSUNO,
      esito: r.esito ?? "",
    });
    setAperto(true);
  };

  const salvaMut = useMutation({
    mutationFn: async () => {
      const importo = f.importo_stimato.trim() === "" ? null : Number(f.importo_stimato);
      if (importo != null && !Number.isFinite(importo)) throw new Error("Importo stimato non valido");
      const terminaleOra = STATI_TERMINALI.includes(f.stato);
      const payload = {
        tipo: f.tipo,
        oggetto: f.oggetto.trim() || null,
        descrizione: f.descrizione.trim() || null,
        importo_stimato: importo,
        stato: f.stato,
        assegnato_a: f.assegnato_a === NESSUNO ? null : f.assegnato_a,
        esito: terminaleOra ? f.esito.trim() || null : null,
      };
      if (inModifica) {
        const { error } = await supabase.from("lead_richieste").update(payload).eq("id", inModifica.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lead_richieste")
          .insert({ ...payload, lead_id: leadId, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(inModifica ? "Richiesta aggiornata" : "Richiesta creata");
      setAperto(false);
      invalida();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminaMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_richieste").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta eliminata");
      invalida();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={apriNuova}>
          <Plus className="size-4" /> Nuova richiesta
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Caricamento…</Card>
      ) : (richieste ?? []).length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessuna richiesta</p>
          <p className="text-xs text-muted-foreground mt-1">Crea la prima richiesta per questo lead.</p>
        </Card>
      ) : (
        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Assegnata a</TableHead>
                <TableHead className="text-right">Importo stimato</TableHead>
                <TableHead>Creata</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(richieste ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{LEAD_RICHIESTA_TIPO_LABEL[r.tipo]}</TableCell>
                  <TableCell className="text-sm">
                    <div>{r.oggetto ?? "—"}</div>
                    {r.esito && <div className="text-xs text-muted-foreground mt-0.5">Esito: {r.esito}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATO_CLASS[r.stato]}>{LEAD_RICHIESTA_STATO_LABEL[r.stato]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{nomeProfilo(r.assegnato_a)}</TableCell>
                  <TableCell className="text-xs text-right">
                    {r.importo_stimato == null ? "—" : formatEuro(Number(r.importo_stimato))}
                  </TableCell>
                  <TableCell className="text-xs">{formatData(r.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => apriModifica(r)} aria-label="Modifica">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        aria-label="Elimina"
                        onClick={() => {
                          if (confirm("Eliminare questa richiesta?")) eliminaMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{inModifica ? "Modifica richiesta" : "Nuova richiesta"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo *</Label>
                <Select value={f.tipo} onValueChange={(v) => set("tipo", v as LeadRichiestaTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_RICHIESTA_TIPO_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Stato</Label>
                <Select value={f.stato} onValueChange={(v) => set("stato", v as LeadRichiestaStato)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_RICHIESTA_STATO_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Oggetto</Label>
              <Input value={f.oggetto} onChange={(e) => set("oggetto", e.target.value)} />
            </div>

            <div>
              <Label className="text-xs">Descrizione</Label>
              <Textarea rows={3} value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Importo stimato (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={f.importo_stimato}
                  onChange={(e) => set("importo_stimato", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Assegnata a</Label>
                <Select value={f.assegnato_a} onValueChange={(v) => set("assegnato_a", v)}>
                  <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNO}>Nessuno</SelectItem>
                    {(profili ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {`${p.nome ?? ""} ${p.cognome ?? ""}`.trim() || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {terminale && (
              <div>
                <Label className="text-xs">Esito (chiusura richiesta)</Label>
                <Textarea rows={2} value={f.esito} onChange={(e) => set("esito", e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)}>Annulla</Button>
            <Button disabled={salvaMut.isPending} onClick={() => salvaMut.mutate()} className="gap-1.5">
              {salvaMut.isPending && <Loader2 className="size-4 animate-spin" />}
              {inModifica ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
