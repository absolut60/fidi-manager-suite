import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Mail, X, Loader2, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { sendEmailDetailed } from "@/lib/send-email";
import { wrapEmailHtml } from "@/lib/template-email";
import { escapeHtml } from "@/lib/template-email-render";
import { isEmailValida } from "@/lib/email-validazione";
import { useAuth } from "@/hooks/use-auth";

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

function testoToHtml(testo: string): string {
  return testo
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
  const [destinatario, setDestinatario] = useState("");
  const [fromName, setFromName] = useState("MADE – FidiManager");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [notaInterna, setNotaInterna] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const { profilo, user } = useAuth();
  const nomeMittente = `${profilo?.nome ?? ""} ${profilo?.cognome ?? ""}`.trim() || "Amministrazione MADE";
  const emailMittente = profilo?.email ?? user?.email ?? null;

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

  // HTML REALE della mail: lo stesso prodotto dall'invio (wrapEmailHtml).
  const anteprimaHtml = useMemo(
    () =>
      wrapEmailHtml(
        testoToHtml(corpo),
        null,
        { nome: nomeMittente, email: emailMittente },
        { senzaBande: true, sottotitolo: "Assicurazione crediti" },
      ),
    [corpo, nomeMittente, emailMittente],
  );

  function apriDialog(r: SinistroDaAprire) {
    const importo = new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(r.scaduto_eur ?? 0));
    const rigaPromessa = r.promessa_data
      ? `Il cliente ha promesso un pagamento entro il ${fmtDate(r.promessa_data)}.`
      : "";
    setAperto(r);
    setDestinatario("");
    setFromName("MADE – FidiManager");
    setOggetto(`Apertura sinistro - ${r.ragione_sociale ?? ""}`);
    setCorpo(
      `Buongiorno,\n\ncon la presente siamo a chiedervi apertura del sinistro per il nostro cliente ${r.ragione_sociale ?? ""} per un importo di ${importo} €\n\nTrasmettiamo in allegato:\nScheda contabile\nFattura insoluta\n\nDichiariamo che siete gli unici assicuratori a intervenire per questo cliente.\n\n${rigaPromessa}\n\nIn attesa di un riscontro o di richiesta ulteriori chiarimenti, porgo cordiali saluti`,
    );
    setNotaInterna("");
    setFiles([]);
  }

  async function inviaEApri() {
    if (!aperto) return;
    const dest = destinatario.trim();
    if (!isEmailValida(dest)) {
      toast.error("Indirizzo email destinatario non valido");
      return;
    }
    if (!corpo.trim()) {
      toast.error("Il corpo della mail non può essere vuoto");
      return;
    }
    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          content: await fileToBase64(f),
          contentType: f.type || "application/octet-stream",
        })),
      );

      const esito = await sendEmailDetailed({
        to: dest,
        subject: oggetto,
        html: wrapEmailHtml(
          testoToHtml(corpo),
          null,
          { nome: nomeMittente, email: emailMittente },
          { senzaBande: true, sottotitolo: "Assicurazione crediti", useCid: true },
        ),
        inlineLogo: true,
        fromName: fromName.trim() || undefined,
        ...(attachments.length ? { attachments } : {}),
      });

      if (!esito.ok) {
        toast.error(`Invio fallito: ${esito.err ?? "errore sconosciuto"}`, { duration: 12000 });
        return;
      }

      const { error } = await (supabase.rpc as any)("apri_sinistro_pouey", {
        _polizza_id: aperto.polizza_id,
        _importo_sinistro: Number(aperto.scaduto_eur ?? 0),
        _nota: notaInterna.trim() || null,
      });
      if (error) {
        toast.error(error.message ?? "Errore apertura sinistro");
        return;
      }

      toast.success("Sinistro aperto e mail inviata");
      setAperto(null);
      queryClient.invalidateQueries({ queryKey: ["sinistri-da-aprire"] });
      queryClient.invalidateQueries({ queryKey: ["sinistri-aperti"] });
      queryClient.invalidateQueries({ queryKey: ["assicurazioni-all"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

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
                      <Button size="sm" variant="outline" onClick={() => apriDialog(r)}>
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

      <Dialog open={!!aperto} onOpenChange={(o) => { if (!o && !sending) setAperto(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prepara mail sinistro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome mittente</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="MADE – FidiManager"
              />
            </div>
            <div>
              <Label>Destinatario</Label>
              <Input
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder="email ufficio sinistri POUEY"
              />
            </div>
            <div>
              <Label>Oggetto</Label>
              <Input value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea rows={14} value={corpo} onChange={(e) => setCorpo(e.target.value)} />
            </div>
            <div>
              <Label>Allegati (PDF o immagini)</Label>
              <Input
                type="file"
                multiple
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const nuovi = Array.from(e.target.files ?? []);
                  if (nuovi.length) setFiles((prev) => [...prev, ...nuovi]);
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                      <span className="truncate flex-1">{f.name}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <Label>Nota interna (facoltativa)</Label>
              <Textarea rows={3} value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)} />
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm space-y-0.5">
                <div>
                  <span className="text-muted-foreground">Da:</span>{" "}
                  {fromName.trim() || "MADE – FidiManager"}{" "}
                  <span className="text-xs text-muted-foreground">(indirizzo aziendale MADE)</span>
                </div>
                <div>
                  <span className="text-muted-foreground">A:</span>{" "}
                  {destinatario.trim() || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Oggetto:</span> {oggetto}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Anteprima</div>
                <iframe
                  title="Anteprima email"
                  sandbox=""
                  srcDoc={anteprimaHtml}
                  className="w-full rounded border"
                  style={{ height: 420 }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(null)} disabled={sending}>
              Annulla
            </Button>
            <Button onClick={inviaEApri} disabled={sending}>
              {sending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Invia e apri sinistro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
