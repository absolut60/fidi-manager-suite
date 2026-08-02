import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Construction, MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Un lead può avere contatti e cantieri propri prima della conversione:
 * `cliente_id` è nullable e il vincolo di schema richiede almeno uno fra
 * `cliente_id` e `lead_id`. Le righe lead-only sono governate dai permessi lead.
 */

export function LeadContattiTab({ leadId, clienteId }: { leadId: string; clienteId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [ruolo, setRuolo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lead-contatti", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, cliente_id, nome, cognome, email, telefono, cellulare, ruolo")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contatti").insert({
        cliente_id: clienteId,
        lead_id: leadId,
        nome: nome.trim(),
        cognome: cognome.trim() || null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        ruolo: ruolo.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatto aggiunto");
      setOpen(false);
      setNome(""); setCognome(""); setEmail(""); setTelefono(""); setRuolo("");
      qc.invalidateQueries({ queryKey: ["lead-contatti", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 ml-auto">
              <Plus className="size-4" /> Nuovo contatto
            </Button>
          </DialogTrigger>
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
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button disabled={!nome.trim() || addMut.isPending} onClick={() => addMut.mutate()}>Salva</Button>
            </DialogFooter>
          </DialogContent>
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

export function LeadCantieriTab({ leadId, clienteId }: { leadId: string; clienteId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [citta, setCitta] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lead-cantieri", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cantieri")
        .select("id, cliente_id, nome, descrizione, indirizzo, citta, provincia, attivo")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Lead non collegato a un cliente");
      const { error } = await supabase.from("cantieri").insert({
        cliente_id: clienteId,
        lead_id: leadId,
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        indirizzo: indirizzo.trim() || null,
        citta: citta.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cantiere aggiunto");
      setOpen(false);
      setNome(""); setDescrizione(""); setIndirizzo(""); setCitta("");
      qc.invalidateQueries({ queryKey: ["lead-cantieri", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cantieri").update({ lead_id: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Collegamento rimosso");
      qc.invalidateQueries({ queryKey: ["lead-cantieri", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {!clienteId && (
          <p className="text-xs text-muted-foreground">
            Per aggiungere cantieri il lead deve essere collegato a un cliente (conversione).
          </p>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 ml-auto" disabled={!clienteId}>
              <Plus className="size-4" /> Nuovo cantiere
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo cantiere</DialogTitle>
              <DialogDescription>Il cantiere viene collegato al lead e al cliente associato.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Label className="text-xs">Nome *</Label><Input value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="sm:col-span-2"><Label className="text-xs">Descrizione</Label><Textarea rows={2} value={descrizione} maxLength={1000} onChange={(e) => setDescrizione(e.target.value)} /></div>
              <div><Label className="text-xs">Indirizzo</Label><Input value={indirizzo} maxLength={200} onChange={(e) => setIndirizzo(e.target.value)} /></div>
              <div><Label className="text-xs">Città</Label><Input value={citta} maxLength={100} onChange={(e) => setCitta(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button disabled={!nome.trim() || addMut.isPending} onClick={() => addMut.mutate()}>Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                  onClick={() => { if (confirm("Scollegare il cantiere dal lead?")) delMut.mutate(c.id); }}
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

