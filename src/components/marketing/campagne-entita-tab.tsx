import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Ban, MailWarning, Megaphone, XCircle } from "lucide-react";

const MAX_RIGHE = 200;
const COLORE_CLIC = "#c94f8f";

type RigaCampagna = {
  campagna_id: string;
  campagna_nome: string | null;
  campagna_oggetto: string | null;
  campagna_stato: string | null;
  campagna_inviata_at: string | null;
  destinatario_id: string;
  email: string | null;
  tipo_destinatario: string | null;
  stato_invio: string | null;
  inviato_at: string | null;
  num_clic: number | null;
  ultimo_clic_at: string | null;
  errore: string | null;
  canale: string | null;
  contatto_id: string | null;
  contatto_nome: string | null;
};

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statoLabel(s: string | null) {
  if (s === "inviato") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Inviato</Badge>;
  if (s === "da_inviare") return <Badge className="bg-slate-500 text-white hover:bg-slate-500">In coda</Badge>;
  if (s === "email_non_valida")
    return (
      <Badge className="bg-amber-600 text-white hover:bg-amber-600">
        <MailWarning className="size-3 mr-1" />
        Email non valida
      </Badge>
    );
  if (s === "fallito")
    return (
      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
        <XCircle className="size-3 mr-1" />
        Fallito
      </Badge>
    );
  if (s === "saltato")
    return (
      <Badge variant="outline">
        <Ban className="size-3 mr-1" />
        Saltato
      </Badge>
    );
  return <Badge variant="outline">{s ?? "—"}</Badge>;
}

export function CampagneEntitaTab({ clienteId, leadId }: { clienteId?: string; leadId?: string }) {
  const [periodo, setPeriodo] = useState<"3m" | "12m" | "tutte">("12m");
  const [soloClic, setSoloClic] = useState(false);

  const params = { _cliente_id: clienteId ?? null, _lead_id: clienteId ? null : (leadId ?? null) };

  const { data: riassunto, isLoading: loadingRiassunto } = useQuery({
    queryKey: ["campagne-entita-riassunto", clienteId ?? null, leadId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_riassunto_campagne_entita", params);
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });

  const { data: righe, isLoading } = useQuery({
    queryKey: ["campagne-entita-righe", clienteId ?? null, leadId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_campagne_entita", params);
      if (error) throw error;
      return (data ?? []) as RigaCampagna[];
    },
  });

  const tutte = righe ?? [];

  const filtrate = useMemo(() => {
    const limite =
      periodo === "tutte" ? null : new Date(Date.now() - (periodo === "3m" ? 90 : 365) * 24 * 60 * 60 * 1000);
    return tutte.filter((r) => {
      if (soloClic && !(Number(r.num_clic ?? 0) > 0)) return false;
      if (limite) {
        const rif = r.campagna_inviata_at ?? r.inviato_at;
        if (!rif) return false;
        if (new Date(rif) < limite) return false;
      }
      return true;
    });
  }, [tutte, periodo, soloClic]);

  const visibili = filtrate.slice(0, MAX_RIGHE);
  const nCampagne = Number(riassunto?.n_campagne ?? 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {loadingRiassunto ? (
          <Skeleton className="h-10" />
        ) : nCampagne === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Megaphone className="size-4" /> Mai coinvolto in campagne email
          </p>
        ) : (
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-sm">
                Campagne: <span className="text-lg font-bold tabular-nums">{nCampagne}</span>
              </p>
              <p className="text-sm">
                Email inviate:{" "}
                <span className="text-lg font-bold tabular-nums">{Number(riassunto?.n_inviate ?? 0)}</span>
              </p>
              <p className="text-sm">
                Ha cliccato:{" "}
                <span className="text-lg font-bold tabular-nums" style={{ color: COLORE_CLIC }}>
                  {Number(riassunto?.n_cliccate ?? 0)}
                </span>
              </p>
            </div>
            {riassunto?.ultima_campagna_nome && (
              <p className="text-xs text-muted-foreground">
                Ultima: {riassunto.ultima_campagna_nome} · {fmtDate(riassunto.ultima_campagna_at)}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Ultimi 3 mesi</SelectItem>
            <SelectItem value="12m">Ultimi 12 mesi</SelectItem>
            <SelectItem value="tutte">Tutte</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={soloClic} onCheckedChange={(v) => setSoloClic(v === true)} />
          Solo dove ha cliccato
        </label>

        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {filtrate.length} mostrate di {tutte.length}
        </span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Data</TableHead>
              <TableHead>Campagna</TableHead>
              <TableHead>Canale</TableHead>
              <TableHead>Destinatario</TableHead>
              <TableHead>Esito</TableHead>
              <TableHead className="whitespace-nowrap">Ultimo clic</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                  Caricamento…
                </TableCell>
              </TableRow>
            ) : visibili.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                  Nessuna campagna nel periodo selezionato
                </TableCell>
              </TableRow>
            ) : (
              visibili.map((r) => {
                const clic = Number(r.num_clic ?? 0);
                return (
                  <TableRow key={r.destinatario_id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(r.campagna_inviata_at ?? r.inviato_at)}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <p className="font-semibold text-sm truncate">{r.campagna_nome ?? "—"}</p>
                      {r.campagna_oggetto && (
                        <p className="text-xs text-muted-foreground truncate">{r.campagna_oggetto}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.canale === "lead" ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          Da lead
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Da cliente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <p className="text-sm truncate">{r.email ?? "—"}</p>
                      {r.tipo_destinatario === "aziendale" ? (
                        <p className="text-xs text-muted-foreground">Email aziendale</p>
                      ) : (
                        r.contatto_nome && <p className="text-xs text-muted-foreground truncate">{r.contatto_nome}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {statoLabel(r.stato_invio)}
                        {clic > 0 && (
                          <Badge
                            className="text-white hover:opacity-90"
                            style={{ backgroundColor: COLORE_CLIC }}
                          >
                            Ha cliccato ×{clic}
                          </Badge>
                        )}
                      </div>
                      {r.errore && (
                        <p className="text-[11px] text-destructive mt-1 max-w-[220px] truncate" title={r.errore}>
                          {r.errore}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(r.ultimo_clic_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtrate.length > MAX_RIGHE && (
        <p className="text-xs text-muted-foreground">
          Mostrate le prime {MAX_RIGHE} righe di {filtrate.length}.
        </p>
      )}
    </div>
  );
}
