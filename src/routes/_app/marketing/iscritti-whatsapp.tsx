import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  RefreshCcw,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientePicker } from "@/components/preventivatore/ClientePicker";

export const Route = createFileRoute("/_app/marketing/iscritti-whatsapp")({
  component: IscrittiWhatsappPage,
});

const PAGE_SIZE = 50;

type Iscritto = {
  id: string;
  numero_norm: string | null;
  numero_raw: string | null;
  nome: string | null;
  cognome: string | null;
  azienda: string | null;
  email: string | null;
  origine: string | null;
  stato: string;
  cliente_id: string | null;
  lead_id: string | null;
  contatto_id: string | null;
  consenso_log_id: string | null;
  created_at: string;
};

function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

function badgeStato(stato: string) {
  if (stato === "nuovo")
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Nuovo</Badge>;
  if (stato.startsWith("collegato"))
    return <Badge className="bg-green-100 text-green-800 border-green-300">Collegato</Badge>;
  if (stato === "ignorato")
    return <Badge variant="secondary" className="text-muted-foreground">Ignorato</Badge>;
  return <Badge variant="outline">{stato}</Badge>;
}

const LABEL_ORIGINE: Record<string, string> = {
  qr_pagina: "QR pagina",
  link: "Link",
  wa_chat: "Chat WhatsApp",
};

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function IscrittiWhatsappPage() {
  const queryClient = useQueryClient();
  const [pagina, setPagina] = useState(0);
  const [stato, setStato] = useState<string>("tutti");
  const [origine, setOrigine] = useState<string>("tutti");
  const [ricerca, setRicerca] = useState("");
  const q = useDebounced(ricerca.trim().toLowerCase(), 300);

  const [riconcilia, setRiconcilia] = useState<Iscritto | null>(null);
  const [clienteScelto, setClienteScelto] = useState<string | null>(null);
  const [daIgnorare, setDaIgnorare] = useState<Iscritto | null>(null);

  useEffect(() => {
    setPagina(0);
  }, [stato, origine, q]);

  // Contatori (count-only per stato)
  const conteggiQuery = useQuery({
    queryKey: ["iscritti-whatsapp-conteggi"],
    queryFn: async () => {
      const conta = async (filtro?: (x: any) => any) => {
        let req = supabase.from("iscritti_whatsapp").select("id", {
          count: "exact",
          head: true,
        });
        if (filtro) req = filtro(req);
        const { count, error } = await req;
        if (error) throw error;
        return count ?? 0;
      };
      const [totale, nuovi, ignorati, collegati] = await Promise.all([
        conta(),
        conta((r) => r.eq("stato", "nuovo")),
        conta((r) => r.eq("stato", "ignorato")),
        conta((r) => r.like("stato", "collegato%")),
      ]);
      return { totale, nuovi, ignorati, collegati };
    },
  });

  const listaQuery = useQuery({
    queryKey: ["iscritti-whatsapp", pagina, stato, origine, q],
    queryFn: async () => {
      let req = supabase
        .from("iscritti_whatsapp")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });
      if (stato === "nuovo") req = req.eq("stato", "nuovo");
      else if (stato === "ignorato") req = req.eq("stato", "ignorato");
      else if (stato === "collegato") req = req.like("stato", "collegato%");
      if (origine !== "tutti") req = req.eq("origine", origine);
      if (q) {
        const like = `%${q}%`;
        req = req.or(
          `numero_raw.ilike.${like},nome.ilike.${like},cognome.ilike.${like},azienda.ilike.${like}`,
        );
      }
      req = req.range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, count, error } = await req;
      if (error) throw error;
      return { righe: (data ?? []) as Iscritto[], totale: count ?? 0 };
    },
  });

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ["iscritti-whatsapp"] });
    queryClient.invalidateQueries({ queryKey: ["iscritti-whatsapp-conteggi"] });
  };

  const rimatchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rimatch_iscritti_whatsapp");
      if (error) throw error;
      return data as { ok?: boolean; collegati?: number; errore?: string };
    },
    onSuccess: (res) => {
      if (res?.ok === false) toast.error(res.errore ?? "Operazione non riuscita");
      else toast.success(`Ri-verifica completata: ${res?.collegati ?? 0} collegati`);
      invalida();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore"),
  });

  const riconciliaMutation = useMutation({
    mutationFn: async (p: { id: string; clienteId: string }) => {
      const { data, error } = await supabase.rpc("riconcilia_iscritto_whatsapp", {
        _id: p.id,
        _cliente_id: p.clienteId,
        _lead_id: undefined,
      });
      if (error) throw error;
      return data as { ok?: boolean; errore?: string };
    },
    onSuccess: (res) => {
      if (res?.ok === false) toast.error(res.errore ?? "Operazione non riuscita");
      else toast.success("Iscritto collegato al cliente");
      setRiconcilia(null);
      setClienteScelto(null);
      invalida();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore"),
  });

  const ignoraMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("ignora_iscritto_whatsapp", {
        _id: id,
      });
      if (error) throw error;
      return data as { ok?: boolean; errore?: string };
    },
    onSuccess: (res) => {
      if (res?.ok === false) toast.error(res.errore ?? "Operazione non riuscita");
      else toast.success("Iscritto ignorato");
      setDaIgnorare(null);
      invalida();
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore"),
  });

  const esportaExcelMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("export_iscritti_whatsapp", {
        _stato: stato,
        _origine: origine,
        _q: q || undefined,
      });
      if (error) throw error;
      return (data ?? []) as {
        numero: string | null;
        nome: string | null;
        cognome: string | null;
        azienda: string | null;
        email: string | null;
        origine: string | null;
        stato: string | null;
        collegato_a: string | null;
        data_iscrizione: string | null;
        consenso_data: string | null;
        consenso_origine: string | null;
        informativa_versione: string | null;
        informativa_hash: string | null;
        ip_address: string | null;
        user_agent: string | null;
        secondi_permanenza: number | null;
      }[];
    },
    onSuccess: (rows) => {
      if (rows.length === 0) {
        toast.info("Nessun iscritto da esportare");
        return;
      }
      const exportRows = rows.map((r) => ({
        Numero: r.numero ?? "",
        Nome: r.nome ?? "",
        Cognome: r.cognome ?? "",
        Impresa: r.azienda ?? "",
        Email: r.email ?? "",
        Origine: r.origine ?? "",
        Stato: r.stato ?? "",
        "Collegato a": r.collegato_a ?? "",
        "Data iscrizione": fmtData(r.data_iscrizione),
        "Data consenso": fmtData(r.consenso_data),
        "Origine consenso": r.consenso_origine ?? "",
        "Versione informativa": r.informativa_versione ?? "",
        "Hash informativa": r.informativa_hash ?? "",
        "Indirizzo IP": r.ip_address ?? "",
        "User agent": r.user_agent ?? "",
        "Secondi permanenza": r.secondi_permanenza ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Iscritti WhatsApp");
      const today = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `iscritti-whatsapp-${today}.xlsx`);
      toast.success(`Esportati ${rows.length} iscritti`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore esportazione"),
  });

  const righe = listaQuery.data?.righe ?? [];
  const totale = listaQuery.data?.totale ?? 0;
  const totPagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Iscritti WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Numeri raccolti da pagina pubblica, QR e chat, da riconciliare con clienti e lead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => esportaExcelMutation.mutate()}
            disabled={esportaExcelMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            Esporta Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => rimatchMutation.mutate()}
            disabled={rimatchMutation.isPending}
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Ri-verifica corrispondenze
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Iscritti totali", val: conteggiQuery.data?.totale },
          { label: "Collegati", val: conteggiQuery.data?.collegati },
          { label: "Da riconciliare", val: conteggiQuery.data?.nuovi },
          { label: "Ignorati", val: conteggiQuery.data?.ignorati },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-2xl font-bold tabular-nums">
              {c.val ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Cerca numero, nome o cognome…"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
            />
          </div>
          <Select value={stato} onValueChange={setStato}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli stati</SelectItem>
              <SelectItem value="nuovo">Nuovo</SelectItem>
              <SelectItem value="collegato">Collegato</SelectItem>
              <SelectItem value="ignorato">Ignorato</SelectItem>
            </SelectContent>
          </Select>
          <Select value={origine} onValueChange={setOrigine}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Origine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte le origini</SelectItem>
              <SelectItem value="qr_pagina">QR pagina</SelectItem>
              <SelectItem value="link">Link</SelectItem>
              <SelectItem value="wa_chat">Chat WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Impresa</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Collegato a</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listaQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Caricamento…
                </TableCell>
              </TableRow>
            ) : righe.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nessun iscritto trovato
                </TableCell>
              </TableRow>
            ) : (
              righe.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">
                    {r.numero_raw ?? r.numero_norm ?? "—"}
                  </TableCell>
                  <TableCell>
                    {[r.nome, r.cognome].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{r.azienda || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {LABEL_ORIGINE[r.origine ?? ""] ?? r.origine ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{fmtData(r.created_at)}</TableCell>
                  <TableCell>{badgeStato(r.stato)}</TableCell>
                  <TableCell>
                    {r.cliente_id ? (
                      <Badge variant="secondary">Cliente</Badge>
                    ) : r.lead_id ? (
                      <Badge variant="secondary">Lead</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {r.stato === "nuovo" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRiconcilia(r);
                            setClienteScelto(null);
                          }}
                        >
                          Riconcilia
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDaIgnorare(r)}
                        >
                          Ignora
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totale > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-muted-foreground">
              {totale} iscritti
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                disabled={pagina === 0}
                onClick={() => setPagina(0)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Pagina {pagina + 1} di {totPagine}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={pagina >= totPagine - 1}
                onClick={() => setPagina((p) => Math.min(totPagine - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={pagina >= totPagine - 1}
                onClick={() => setPagina(totPagine - 1)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!riconcilia}
        onOpenChange={(o) => {
          if (!o) setRiconcilia(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Riconcilia iscritto</DialogTitle>
            <DialogDescription>
              Collega il numero {riconcilia?.numero_raw ?? ""} a un cliente
              esistente. Il consenso verrà registrato anche nel registro
              consensi.
              {riconcilia?.azienda && (
                <span className="block mt-1 text-xs">
                  Impresa dichiarata: <strong>{riconcilia.azienda}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ClientePicker value={clienteScelto} onChange={setClienteScelto} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiconcilia(null)}>
              Annulla
            </Button>
            <Button
              disabled={!clienteScelto || riconciliaMutation.isPending}
              onClick={() =>
                riconcilia &&
                clienteScelto &&
                riconciliaMutation.mutate({
                  id: riconcilia.id,
                  clienteId: clienteScelto,
                })
              }
            >
              Collega al cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!daIgnorare}
        onOpenChange={(o) => {
          if (!o) setDaIgnorare(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignorare questo iscritto?</AlertDialogTitle>
            <AlertDialogDescription>
              Il numero {daIgnorare?.numero_raw ?? ""} verrà segnato come
              ignorato (numero errato o doppione). Non verrà usato per gli
              invii.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => daIgnorare && ignoraMutation.mutate(daIgnorare.id)}
            >
              Ignora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
