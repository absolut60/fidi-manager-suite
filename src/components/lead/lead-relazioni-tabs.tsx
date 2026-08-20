import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Construction, MapPin, Users } from "lucide-react";
import { CantiereDialog } from "@/components/cantiere-dialog";
import type { CantiereRow } from "@/lib/cantieri";
import { supabase } from "@/integrations/supabase/client";
import { creaContattoPersona } from "@/lib/contatto-crea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ContattoPrivacyAzioni } from "@/components/contatto-privacy-azioni";
import { useServerFn } from "@tanstack/react-start";
import {
  SceltaCanalePrivacy, inviaRichiestaDopoCreazione, ModuloConsensoPrivacy,
  inviaRichiestaFirmaPrivacy, registraConsensoDiPersona,
  type CanalePrivacy, type ModuloConsensoPayload,
} from "@/components/privacy-post-creazione";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Un lead può avere contatti e cantieri propri prima della conversione:
 * `cliente_id` è nullable e il vincolo di schema richiede almeno uno fra
 * `cliente_id` e `lead_id`. Le righe lead-only sono governate dai permessi lead.
 */

/** Fonte unica dei contatti di un lead: queryKey ["lead-contatti", leadId]. */
export function useLeadContatti(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ["lead-contatti", leadId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, cliente_id, nome, cognome, email, telefono, cellulare, ruolo, privacy_firmata, data_firma, pdf_privacy_url, consenso_profilazione, consenso_marketing_media, consenso_marketing_diretto, richiesta_privacy_generata_il, richiesta_privacy_inviata_il, richiesta_privacy_aperta_il")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function LeadContattiTab({ leadId, clienteId }: { leadId: string; clienteId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [canale, setCanale] = useState<CanalePrivacy | null>(null);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [ruolo, setRuolo] = useState("");
  const [nuovoContattoId, setNuovoContattoId] = useState<string | null>(null);
  const [salvandoPrivacy, setSalvandoPrivacy] = useState(false);
  const inviaFn = useServerFn(inviaRichiestaFirmaPrivacy);
  const diPersonaFn = useServerFn(registraConsensoDiPersona);

  const { data, isLoading } = useLeadContatti(leadId);

  function chiudi() {
    setOpen(false);
    setCanale(null);
    setNuovoContattoId(null);
    setNome(""); setCognome(""); setEmail(""); setTelefono(""); setRuolo("");
    qc.invalidateQueries({ queryKey: ["lead-contatti", leadId] });
  }

  const addMut = useMutation({
    mutationFn: async () => {
      const { id } = await creaContattoPersona({
        cliente_id: clienteId,
        lead_id: leadId,
        nome,
        cognome,
        email,
        telefono,
        ruolo,
      });
      return id;
    },
    onSuccess: async (id) => {
      qc.invalidateQueries({ queryKey: ["lead-contatti", leadId] });
      if (canale === "di_persona") {
        toast.success("Contatto creato — compila il modulo privacy");
        setNuovoContattoId(id);
        return;
      }
      if (canale === "a_distanza") {
        await inviaRichiestaDopoCreazione(inviaFn, id, !!email.trim());
      } else {
        toast.success("Contatto creato — la privacy si raccoglie dopo dalla riga del contatto");
      }
      chiudi();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function salvaDiPersona(p: ModuloConsensoPayload) {
    if (!nuovoContattoId) return;
    setSalvandoPrivacy(true);
    try {
      const res = await diPersonaFn({ data: { contattoId: nuovoContattoId, ...p } });
      toast.success(
        res.emailInviata
          ? "Consenso registrato — copia PDF inviata via email"
          : "Consenso registrato — invio email non riuscito, il PDF è archiviato"
      );
      chiudi();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSalvandoPrivacy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Dialog open={open} onOpenChange={(v) => { if (!v) chiudi(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 ml-auto">
              <Plus className="size-4" /> Nuovo contatto
            </Button>
          </DialogTrigger>
          {nuovoContattoId && canale === "di_persona" ? (
            <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Consenso privacy — {`${nome} ${cognome}`.trim()}</DialogTitle>
                <DialogDescription>
                  Contatto creato. Fai compilare e firmare il modulo direttamente all'interessato.
                </DialogDescription>
              </DialogHeader>
              <ModuloConsensoPrivacy
                valoriIniziali={{ nome, cognome, email }}
                onSubmit={salvaDiPersona}
                isPending={salvandoPrivacy}
                inviaLabel="Conferma e firma"
              />
            </DialogContent>
          ) : canale === null ? (
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuovo contatto</DialogTitle>
                <DialogDescription>Scegli come vuoi creare il contatto.</DialogDescription>
              </DialogHeader>
              <SceltaCanalePrivacy onScegli={setCanale} />
            </DialogContent>
          ) : (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuovo contatto</DialogTitle>
                <DialogDescription>
                  {clienteId
                    ? "Il contatto viene collegato al lead e al cliente associato."
                    : "Il contatto appartiene al lead; verrà collegato al cliente alla conversione."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Nome *</Label><Input value={nome} maxLength={100} onChange={(e) => setNome(e.target.value)} /></div>
                <div><Label className="text-xs">Cognome</Label><Input value={cognome} maxLength={100} onChange={(e) => setCognome(e.target.value)} /></div>
                <div><Label className="text-xs">Email</Label><Input type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label className="text-xs">Telefono</Label><Input value={telefono} maxLength={30} onChange={(e) => setTelefono(e.target.value)} /></div>
                <div className="sm:col-span-2"><Label className="text-xs">Ruolo</Label><Input value={ruolo} maxLength={100} onChange={(e) => setRuolo(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCanale(null)}>Indietro</Button>
                <Button disabled={!nome.trim() || addMut.isPending} onClick={() => addMut.mutate()}>
                  {addMut.isPending ? "Salvataggio..." : "Crea contatto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessun contatto collegato</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data ?? []).map((c) => (
            <Card key={c.id} className="p-4">
              <p className="font-semibold">{`${c.nome} ${c.cognome ?? ""}`.trim()}</p>
              {c.ruolo && <p className="text-xs text-muted-foreground">{c.ruolo}</p>}
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {c.email && <div>{c.email}</div>}
                {(c.telefono || c.cellulare) && <div>{c.telefono || c.cellulare}</div>}
              </div>
              <div className="mt-3 pt-3 border-t">
                <ContattoPrivacyAzioni
                  contatto={c}
                  onRefresh={() => qc.invalidateQueries({ queryKey: ["lead-contatti", leadId] })}
                />
              </div>
              {c.cliente_id && (
                <Link
                  to="/clienti/$clienteId"
                  params={{ clienteId: c.cliente_id }}
                  className="text-xs underline mt-2 inline-block"
                >
                  Vai al cliente
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeadCantieriTab({
  leadId, clienteId, etichetta,
}: {
  leadId: string;
  clienteId: string | null;
  etichetta?: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const soggettoFisso = useMemo(
    () => ({
      tipo: "lead" as const,
      id: leadId,
      etichetta: etichetta?.trim() || "Lead",
      clienteIdAssociato: clienteId ?? null,
    }),
    [leadId, clienteId, etichetta],
  );
  const queryKeysExtra = useMemo(() => [["lead-cantieri", leadId]], [leadId]);

  const { data, isLoading } = useQuery({
    queryKey: ["lead-cantieri", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cantieri")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CantiereRow[];
    },
  });

  // Righe lead-only: non possono restare senza cliente né lead → si eliminano.
  // Righe già collegate a un cliente: si scollega soltanto il lead.
  const delMut = useMutation({
    mutationFn: async (c: { id: string; cliente_id: string | null }) => {
      const { error } = c.cliente_id
        ? await supabase.from("cantieri").update({ lead_id: null }).eq("id", c.id)
        : await supabase.from("cantieri").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cantiere rimosso dal lead");
      qc.invalidateQueries({ queryKey: ["lead-cantieri", leadId] });
      qc.invalidateQueries({ queryKey: ["cantieri-lista"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editing = data?.find((c) => c.id === editId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nuovo cantiere
        </Button>
      </div>

      <CantiereDialog
        open={open}
        onOpenChange={setOpen}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
      />
      <CantiereDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditId(null)}
        cantiere={editing}
        soggettoFisso={soggettoFisso}
        queryKeysExtra={queryKeysExtra}
      />

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Card className="p-12 text-center">
          <Construction className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="font-medium text-sm">Nessun cantiere collegato</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data ?? []).map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{c.nome}</p>
                    {c.attivo ? <Badge className="bg-success/15 text-success">Attivo</Badge> : <Badge variant="outline">Chiuso</Badge>}
                  </div>
                  {c.descrizione && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descrizione}</p>}
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => {
                    const msg = c.cliente_id
                      ? "Scollegare il cantiere dal lead?"
                      : "Eliminare definitivamente questo cantiere del lead?";
                    if (confirm(msg)) delMut.mutate({ id: c.id, cliente_id: c.cliente_id });
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {(c.indirizzo || c.citta) && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 mt-0.5 shrink-0" />
                  <span>{[c.indirizzo, c.citta, c.provincia].filter(Boolean).join(", ")}</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

