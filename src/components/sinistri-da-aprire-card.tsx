import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Mail, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MailSinistroDialog } from "@/components/mail-sinistro-dialog";

export interface SinistroDaAprire {
  cliente_id: string;
  ragione_sociale: string | null;
  store_nome: string | null;
  scaduto_eur: number | null;
  data_scadenza_piu_vecchia: string | null;
  giorni_da_scadenza: number | null;
  giorni_residui_30: number | null;
  finestra: "ok" | "urgente" | "scaduta" | string;
  promessa_data: string | null;
  polizza_id: string;
  numero_polizza: string | null;
  importo_assicurato: number | null;
}

export interface SinistroAperto {
  polizza_id: string;
  cliente_id: string;
  ragione_sociale: string | null;
  store_nome: string | null;
  data_apertura_sinistro: string | null;
  importo_sinistro: number | null;
  numero_sinistro: string | null;
  esito_sinistro: string | null;
  note_sinistro: string | null;
  numero_polizza: string | null;
}

export function SinistriDaAprireCard({
  fmtEuro,
  fmtDate,
}: {
  fmtEuro: (v: unknown) => string;
  fmtDate: (v: unknown) => string;
}) {
  const queryClient = useQueryClient();
  const [aperto, setAperto] = useState<SinistroDaAprire | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sinistri-da-aprire"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_sinistri_da_aprire");
      if (error) throw error;
      return (data ?? []) as SinistroDaAprire[];
    },
  });

  const { data: apertiData, isLoading: apertiLoading } = useQuery({
    queryKey: ["sinistri-aperti"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_sinistri_aperti");
      if (error) throw error;
      return (data ?? []) as SinistroAperto[];
    },
  });

  const righe = data ?? [];
  const aperti = apertiData ?? [];

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="size-5 text-destructive" />
          <h2 className="font-semibold">Sinistri — POUEY</h2>
        </div>

        <Tabs defaultValue="da-aprire">
          <TabsList className="mb-3">
            <TabsTrigger value="da-aprire">Da aprire</TabsTrigger>
            <TabsTrigger value="aperti">Sinistri aperti</TabsTrigger>
          </TabsList>

          <TabsContent value="da-aprire">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : righe.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun sinistro da aprire</p>
            ) : (
              <div className="divide-y">
                {righe.map((r) => {
                  const gg = Number(r.giorni_residui_30 ?? 0);
                  return (
                    <div key={r.polizza_id} className="py-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <div className="font-medium">{r.ragione_sociale ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.store_nome ?? "—"}
                          {r.numero_polizza ? ` · Polizza ${r.numero_polizza}` : ""}
                        </div>
                        {r.promessa_data && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Promessa pagamento: {fmtDate(r.promessa_data)}
                          </div>
                        )}
                      </div>
                      <div className="text-right tabular-nums min-w-[110px]">
                        <div className="font-semibold">{fmtEuro(r.scaduto_eur)}</div>
                        <div className="text-xs text-muted-foreground">
                          Scad. + vecchia: {fmtDate(r.data_scadenza_piu_vecchia)}
                        </div>
                      </div>
                      <div>
                        {r.finestra === "ok" && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            In finestra ({gg} gg ai 30)
                          </Badge>
                        )}
                        {r.finestra === "urgente" && (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                            Urgente: {gg} gg ai 30
                          </Badge>
                        )}
                        {r.finestra === "scaduta" && (
                          <Badge variant="destructive">
                            Termine superato (+{Math.abs(gg)} gg)
                          </Badge>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setAperto(r)}>
                        <Mail className="size-4 mr-1" /> Prepara mail sinistro
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="aperti">
            {apertiLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento…</p>
            ) : aperti.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun sinistro aperto</p>
            ) : (
              <div className="divide-y">
                {aperti.map((r) => (
                  <div key={r.polizza_id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-medium">{r.ragione_sociale ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.store_nome ?? "—"}
                        {r.numero_polizza ? ` · Polizza ${r.numero_polizza}` : ""}
                      </div>
                      {r.note_sinistro && (
                        <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                          {r.note_sinistro}
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular-nums min-w-[110px]">
                      <div className="font-semibold">{fmtEuro(r.importo_sinistro)}</div>
                      <div className="text-xs text-muted-foreground">
                        Aperto il: {fmtDate(r.data_apertura_sinistro)}
                      </div>
                    </div>
                    <Badge variant="secondary">
                      <FileCheck2 className="size-3.5 mr-1" />
                      {r.numero_sinistro ? `N. ${r.numero_sinistro}` : "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {aperto && (
        <MailSinistroDialog
          open={!!aperto}
          onOpenChange={(o) => { if (!o) setAperto(null); }}
          polizzaId={aperto.polizza_id}
          ragioneSociale={aperto.ragione_sociale}
          importoSuggerito={aperto.scaduto_eur}
          promessaData={aperto.promessa_data}
          fmtDate={fmtDate}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ["sinistri-da-aprire"] });
            queryClient.invalidateQueries({ queryKey: ["sinistri-aperti"] });
            queryClient.invalidateQueries({ queryKey: ["assicurazioni-all"] });
          }}
        />
      )}
    </>
  );
}
