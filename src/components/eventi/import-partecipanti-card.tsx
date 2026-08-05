import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { triggerEventiPartecipantiImport } from "@/lib/eventi-import.functions";

const INTESTAZIONI = [
  "Nome",
  "Cognome",
  "Ragione sociale",
  "Partita IVA",
  "Codice fiscale",
  "Email",
  "Telefono",
  "Cellulare",
  "Note",
];

function scaricaModello() {
  const ws = XLSX.utils.aoa_to_sheet([
    INTESTAZIONI,
    ["Mario", "Rossi", "", "", "", "mario.rossi@example.com", "", "3331234567", ""],
    ["", "", "Rossi Srl", "01234567890", "", "info@rossisrl.it", "0301234567", "", ""],
  ]);
  ws["!cols"] = INTESTAZIONI.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Partecipanti");
  XLSX.writeFile(wb, "modello-partecipanti-evento.xlsx");
}

export function ImportPartecipantiCard({ eventoId }: { eventoId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importazioneId, setImportazioneId] = useState<string | null>(null);
  const trigger = useServerFn(triggerEventiPartecipantiImport);

  // Ultima importazione dell'evento (per mostrare lo stato in corso / concluso)
  const { data: ultima } = useQuery({
    queryKey: ["evento-import", eventoId, importazioneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importazioni")
        .select("id, stato, righe_totali, righe_elaborate, righe_create, righe_saltate, created_at")
        .eq("evento_id", eventoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) =>
      (q.state.data as { stato?: string } | null | undefined)?.stato === "in_elaborazione" ? 2000 : false,
  });

  const inCorso = ultima?.stato === "in_elaborazione";

  // Quando l'import finisce, ricarica lo staging
  useEffect(() => {
    if (ultima && ultima.stato !== "in_elaborazione") {
      queryClient.invalidateQueries({ queryKey: ["evento-import-righe", eventoId] });
    }
  }, [ultima?.stato, ultima, eventoId, queryClient]);

  const importa = useMutation({
    mutationFn: async (file: File) => {
      const path = `eventi/${eventoId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("import-files").upload(path, file);
      if (up.error) throw up.error;

      const { data: imp, error } = await supabase
        .from("importazioni")
        .insert({
          nome_file: file.name,
          dimensione_bytes: file.size,
          file_path: path,
          fonte: "eventi_partecipanti",
          evento_id: eventoId,
          eseguita_da: user?.id ?? null,
          stato: "in_elaborazione",
        })
        .select("id")
        .single();
      if (error) throw error;

      await trigger({ data: { importazioneId: imp.id, eventoId, filePath: path } });
      return imp.id;
    },
    onSuccess: (id) => {
      setImportazioneId(id);
      toast.success("Import avviato: le righe resteranno in sospeso fino al collegamento manuale");
      queryClient.invalidateQueries({ queryKey: ["evento-import", eventoId] });
    },
    onError: (e: Error) => toast.error(`Import non avviato: ${e.message}`),
  });

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Import partecipanti</h2>
          <p className="text-sm text-muted-foreground">
            Carica un elenco: le righe restano in sospeso, nessun lead o contatto viene creato
            automaticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={scaricaModello}>
            <Download className="h-4 w-4 mr-2" />
            Scarica modello
          </Button>
          <Button
            size="sm"
            disabled={importa.isPending || inCorso}
            onClick={() => inputRef.current?.click()}
          >
            {importa.isPending || inCorso ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importa
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importa.mutate(file);
            }}
          />
        </div>
      </div>

      {ultima && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={inCorso ? "secondary" : ultima.stato === "completata" ? "default" : "destructive"}>
            {inCorso ? "In elaborazione" : ultima.stato === "completata" ? "Completata" : "Con avvisi"}
          </Badge>
          <span className="text-muted-foreground">
            {ultima.righe_elaborate ?? 0}/{ultima.righe_totali ?? 0} righe · {ultima.righe_create ?? 0} in
            sospeso · {ultima.righe_saltate ?? 0} scartate
          </span>
        </div>
      )}
    </Card>
  );
}
