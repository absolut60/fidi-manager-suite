import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ORIGINE_LABEL: Record<string, string> = {
  link_email: "Ha cliccato il link",
  manuale: "Registrata a mano",
  risposta_email: "Ha risposto all'email",
  import: "Importata",
};

const RUOLI_RIATTIVA = ["amministratore", "amministrazione", "direzione"];

type StatoOptOut = {
  email: string;
  disiscritto: boolean;
  origine: string | null;
  campagna_nome: string | null;
  created_at: string | null;
};

function fmtData(v: string | null) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("it-IT");
  } catch {
    return v;
  }
}

export function BadgeDisiscrizione({
  email,
  onRiattivato,
}: {
  email: string | null | undefined;
  onRiattivato?: () => void;
}) {
  const emailNorm = (email ?? "").trim();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const [openConferma, setOpenConferma] = useState(false);
  const [busy, setBusy] = useState(false);

  const puoRiattivare = useMemo(
    () => (roles as string[]).some((r) => RUOLI_RIATTIVA.includes(r)),
    [roles],
  );

  const { data } = useQuery({
    queryKey: ["stato-opt-out", emailNorm.toLowerCase()],
    enabled: !!emailNorm,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("get_stato_opt_out", {
        _emails: [emailNorm],
      });
      if (error) throw error;
      const arr = (rows ?? []) as unknown as StatoOptOut[];
      return arr[0] ?? null;
    },
  });

  async function riattiva() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("riattiva_marketing", { _email: emailNorm });
      if (error) throw new Error(error.message);
      toast.success("Marketing riattivato per questo indirizzo");
      setOpenConferma(false);
      qc.invalidateQueries({ queryKey: ["stato-opt-out", emailNorm.toLowerCase()] });
      onRiattivato?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (!emailNorm) return null;
  if (!data?.disiscritto) return null;

  const dettagli = [
    data.origine ? ORIGINE_LABEL[data.origine] ?? data.origine : null,
    data.campagna_nome ? `Campagna: ${data.campagna_nome}` : null,
    fmtData(data.created_at),
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
      <Badge variant="destructive" className="gap-1">
        <MailX className="size-3" /> Disiscritto dal marketing
      </Badge>
      {dettagli.length > 0 && (
        <span className="text-xs text-muted-foreground">{dettagli.join(" · ")}</span>
      )}
      {puoRiattivare && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setOpenConferma(true)}
          >
            Riattiva marketing
          </Button>
          <AlertDialog open={openConferma} onOpenChange={setOpenConferma}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Riattivare le comunicazioni?</AlertDialogTitle>
                <AlertDialogDescription>
                  Questo indirizzo tornerà a ricevere comunicazioni commerciali. Confermi?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    void riattiva();
                  }}
                >
                  Conferma
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
