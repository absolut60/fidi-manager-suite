import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ADMIN_LABEL } from "./richieste-table";

type AdminStatus = "da_gestire" | "in_gestione" | "conclusa";

export type GestisciTarget = {
  id: string;
  title: string;
  admin_status: string | null;
  admin_note: string | null;
  sent_to_gestionale: boolean | null;
  gestionale_ref: string | null;
};

export function GestisciDialog({
  open,
  target,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  target: GestisciTarget | null;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const { user, profilo } = useAuth();
  const fullName =
    [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ").trim() || (user?.email ?? "");

  const [status, setStatus] = useState<AdminStatus>("da_gestire");
  const [note, setNote] = useState("");
  const [sentGest, setSentGest] = useState(false);
  const [gestRef, setGestRef] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    setStatus((target.admin_status as AdminStatus) ?? "da_gestire");
    setNote(target.admin_note ?? "");
    setSentGest(!!target.sent_to_gestionale);
    setGestRef(target.gestionale_ref ?? "");
  }, [open, target]);

  async function submit() {
    if (!target) return;
    setSaving(true);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      admin_status: status,
      admin_note: note.trim() || null,
      admin_at: now,
      admin_by_name: fullName,
      sent_to_gestionale: sentGest,
      gestionale_ref: sentGest ? (gestRef.trim() || null) : null,
      gestionale_sent_at: sentGest
        ? (target.sent_to_gestionale ? undefined : now)
        : null,
    };
    // Remove undefined so PostgREST doesn't touch gestionale_sent_at when already set
    if (patch.gestionale_sent_at === undefined) delete patch.gestionale_sent_at;

    const { error } = await supabase
      .from("richieste_interne")
      .update(patch)
      .eq("id", target.id);
    setSaving(false);
    if (error) {
      toast.error("Errore: " + error.message);
      return;
    }
    toast.success("Aggiornato");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gestione richiesta</DialogTitle>
          <DialogDescription className="truncate">{target?.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Stato attuale:</span>
            <Badge variant="outline">
              {ADMIN_LABEL[target?.admin_status ?? "da_gestire"] ?? "🔴 Da gestire"}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label>Stato</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AdminStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="da_gestire">🔴 Da gestire</SelectItem>
                <SelectItem value="in_gestione">🟡 In gestione</SelectItem>
                <SelectItem value="conclusa">🟢 Conclusa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Note di lavorazione</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note di lavorazione…"
              rows={4}
            />
          </div>

          <div className="rounded-md border p-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sent-gest"
                checked={sentGest}
                onCheckedChange={(v) => setSentGest(!!v)}
              />
              <Label htmlFor="sent-gest" className="cursor-pointer">Inviato a gestionale</Label>
            </div>
            {sentGest && (
              <div className="space-y-2">
                <Label>Riferimento gestionale</Label>
                <Input
                  value={gestRef}
                  onChange={(e) => setGestRef(e.target.value)}
                  placeholder="Es. numero protocollo…"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
