import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link as LinkIcon, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LinkFirmaPrivacyProps =
  | { clienteId: string; leadId?: never }
  | { clienteId?: never; leadId: string };

export function LinkFirmaPrivacy({ clienteId, leadId }: LinkFirmaPrivacyProps) {
  const [link, setLink] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingConsensi, setLoadingConsensi] = useState(false);
  const [linkConsensi, setLinkConsensi] = useState<string | null>(null);
  const [expiresConsensi, setExpiresConsensi] = useState<string | null>(null);

  // Carica i contatti del cliente per selezionare il firmatario
  const { data: contatti } = useQuery({
    queryKey: ["contatti", clienteId ?? null, leadId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatti")
        .select("id, nome, cognome, principale, privacy_firmata")
        .eq(clienteId ? "cliente_id" : "lead_id", (clienteId ?? leadId)!)
        .order("principale", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [contattoId, setContattoId] = useState<string | null>(null);
  const selezionato = contattoId ?? contatti?.find((c) => !c.privacy_firmata)?.id ?? null;

  async function genera() {
    if (!selezionato) {
      toast.error("Seleziona un contatto");
      return;
    }
    setLoading(true);
    try {
      const { generaTokenFirmaPrivacy } = await import("@/lib/firma-privacy.functions");
      const res = await generaTokenFirmaPrivacy({ data: { contattoId: selezionato, giorniValidita: 30 } });
      const url = `${window.location.origin}/firma-privacy/${res.token}`;
      setLink(url);
      setExpires(res.expires_at);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function generaConsensi() {
    if (!selezionato) {
      toast.error("Seleziona un contatto");
      return;
    }
    setLoadingConsensi(true);
    try {
      const { generaTokenConsensiMarketing } = await import("@/lib/consensi-marketing.functions");
      const res = await generaTokenConsensiMarketing({ data: { contattoId: selezionato, giorniValidita: 30 } });
      const url = `${window.location.origin}/consensi/${res.token}`;
      setLinkConsensi(url);
      setExpiresConsensi(res.expires_at);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link consensi marketing copiato negli appunti", { description: url });
      } catch {
        toast.success("Link consensi marketing generato", { description: url });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoadingConsensi(false);
    }
  }

  async function copia() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiato negli appunti");
  }

  async function copiaConsensi() {
    if (!linkConsensi) return;
    await navigator.clipboard.writeText(linkConsensi);
    toast.success("Link copiato negli appunti");
  }

  const noContatti = (contatti?.length ?? 0) === 0;

  return (
    <Card className="p-4 bg-muted/40 border-dashed">
      <p className="text-sm font-medium mb-1 flex items-center gap-1.5">
        <LinkIcon className="size-4" /> Link a distanza per il contatto
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Genera i link da inviare al contatto: firma privacy-base oppure raccolta consensi marketing granulari.
      </p>

      {noContatti ? (
        <p className="text-sm text-destructive">{clienteId ? "Aggiungi prima un contatto al cliente nella tab Contatti." : "Aggiungi prima un contatto al lead nella tab Contatti."}</p>
      ) : (
        <>
          <div className="space-y-2 mb-3">
            <Label className="text-xs">Firmatario</Label>
            <select
              className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              value={selezionato ?? ""}
              onChange={(e) => {
                setContattoId(e.target.value);
                setLink(null);
                setLinkConsensi(null);
              }}
            >
              {contatti?.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.nome, c.cognome].filter(Boolean).join(" ")} {c.principale ? "(principale)" : ""} {c.privacy_firmata ? "— privacy già firmata" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {/* Link privacy-base */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Privacy-base</p>
              {!link ? (
                <Button size="sm" variant="outline" onClick={genera} disabled={loading || !selezionato}>
                  {loading ? "Generazione..." : "Genera link privacy"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input readOnly value={link} className="text-xs font-mono bg-background" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={copia}>
                      <Copy className="size-3.5 mr-1" /> Copia
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={link} target="_blank" rel="noreferrer">Apri</a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={genera} disabled={loading}>
                      Rigenera
                    </Button>
                  </div>
                  {expires && (
                    <p className="text-xs text-muted-foreground">
                      Valido fino al {new Date(expires).toLocaleDateString("it-IT")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Link consensi marketing */}
            <div className="space-y-2 pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Consensi marketing</p>
              {!linkConsensi ? (
                <Button size="sm" variant="outline" onClick={generaConsensi} disabled={loadingConsensi || !selezionato}>
                  {loadingConsensi ? "Generazione..." : "Genera link consensi marketing"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input readOnly value={linkConsensi} className="text-xs font-mono bg-background" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={copiaConsensi}>
                      <Copy className="size-3.5 mr-1" /> Copia
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={linkConsensi} target="_blank" rel="noreferrer">Apri</a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={generaConsensi} disabled={loadingConsensi}>
                      Rigenera
                    </Button>
                  </div>
                  {expiresConsensi && (
                    <p className="text-xs text-muted-foreground">
                      Valido fino al {new Date(expiresConsensi).toLocaleDateString("it-IT")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
