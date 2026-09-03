import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadContatti } from "@/components/lead/lead-relazioni-tabs";
import { ContattoPrivacyAzioni } from "@/components/contatto-privacy-azioni";
import { CONSENSO_LABEL } from "@/lib/consensi-testi";
import { ShieldCheck, Users } from "lucide-react";

export function LeadPrivacyTab({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useLeadContatti(leadId);

  const contatti = data ?? [];
  const totContatti = contatti.length;

  const conteggi = {
    marketing_diretto: contatti.filter((c) => c.consenso_marketing_diretto).length,
    marketing_media: contatti.filter((c) => c.consenso_marketing_media).length,
    profilazione: contatti.filter((c) => c.consenso_profilazione).length,
  };

  const privacyFirmate = contatti.filter((c) => c.privacy_firmata).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (totContatti === 0) {
    return (
      <Card className="p-12 text-center">
        <ShieldCheck className="size-8 mx-auto text-muted-foreground mb-2" />
        <p className="font-medium text-sm">Nessun contatto</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Aggiungi prima un contatto dal tab Contatti per raccogliere i consensi privacy. La privacy si firma sulla persona fisica, non sul lead.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="size-3.5" /> Consensi marketing dei contatti
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(["marketing_diretto", "marketing_media", "profilazione"] as const).map((k) => (
            <Card key={k} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">
                  {CONSENSO_LABEL[k]}
                </p>
                <p className="text-base font-bold mt-0.5 tabular-nums">
                  {conteggi[k]}/{totContatti}{" "}
                  <span className="text-xs font-normal text-muted-foreground">contatti</span>
                </p>
              </div>
              <Badge variant={conteggi[k] > 0 ? "default" : "secondary"}>
                {conteggi[k] > 0 ? "Attivo" : "Nessuno"}
              </Badge>
            </Card>
          ))}
        </div>
        <Card className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase truncate">
              Privacy firmata
            </p>
            <p className="text-base font-bold mt-0.5 tabular-nums">
              {privacyFirmate}/{totContatti}{" "}
              <span className="text-xs font-normal text-muted-foreground">contatti</span>
            </p>
          </div>
          <Badge variant={privacyFirmate > 0 ? "default" : "secondary"}>
            {privacyFirmate > 0 ? "Attivo" : "Nessuno"}
          </Badge>
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Users className="size-3.5" /> Contatti del lead
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contatti.map((c) => (
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
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
