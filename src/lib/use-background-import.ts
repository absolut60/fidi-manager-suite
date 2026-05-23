import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { triggerImport } from "@/lib/import.functions";

type Fonte = "anagrafica" | "analisi_rischio" | "scadenziario" | "scadenziario_assicurazioni";

export type BackgroundImportProgress = {
  stato: string | null;
  righe_totali: number | null;
  righe_elaborate: number | null;
  righe_create: number | null;
  righe_aggiornate: number | null;
  righe_errore: number | null;
  log_errori: unknown;
  completata_at: string | null;
};

type StartImportArgs = {
  file: File;
  rowsTotali: number;
  rigeErroreClient?: number;
  stagedChunks?: Array<{ rows: unknown[] }>;
  stagedMissingRows?: number[];
};

export function useBackgroundImport(opts: {
  fonte: Fonte;
  invalidateKeys?: string[][];
  onDone?: (p: BackgroundImportProgress) => void;
  onChunkUploaded?: (uploaded: number, total: number) => void;
  onUploadComplete?: () => void;
}) {
  const qc = useQueryClient();
  const [importazioneId, setImportazioneId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const startMut = useMutation({
    mutationFn: async (args: StartImportArgs) => {
      const { file, rowsTotali, rigeErroreClient = 0, stagedChunks, stagedMissingRows = [] } = args;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: imp, error: impErr } = await supabase
        .from("importazioni")
        .insert({
          nome_file: file.name,
          righe_totali: rowsTotali,
          righe_errore: rigeErroreClient,
          stato: "in_elaborazione",
          fonte: opts.fonte,
          eseguita_da: user?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      let filePath = `${imp.id}/${file.name}`;
      try {
        if (stagedChunks?.length) {
          const basePath = `_staging/${imp.id}`;
          for (const [index, chunk] of stagedChunks.entries()) {
            const body = new Blob([JSON.stringify(chunk.rows)], { type: "application/json" });
            const { error } = await supabase.storage
              .from("import-files")
              .upload(`${basePath}/chunk-${index}.json`, body, {
                contentType: "application/json",
                upsert: true,
              });
            if (error)
              throw new Error(
                `Upload chunk ${index + 1}/${stagedChunks.length} fallito: ${error.message}`,
              );
          }
          const manifest = new Blob(
            [
              JSON.stringify({
                mode: "client-staged",
                sourceFileName: file.name,
                rowsTotali,
                validRows: stagedChunks.reduce((sum, chunk) => sum + chunk.rows.length, 0),
                missingRows: stagedMissingRows,
                chunkCount: stagedChunks.length,
                createdAt: new Date().toISOString(),
              }),
            ],
            { type: "application/json" },
          );
          filePath = `${basePath}/manifest.json`;
          const { error } = await supabase.storage.from("import-files").upload(filePath, manifest, {
            contentType: "application/json",
            upsert: true,
          });
          if (error) throw new Error(`Upload manifest fallito: ${error.message}`);
        } else {
          const { error } = await supabase.storage.from("import-files").upload(filePath, file, {
            contentType:
              file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: true,
          });
          if (error) throw error;
        }
      } catch (upErr) {
        const message = upErr instanceof Error ? upErr.message : String(upErr);
        await supabase
          .from("importazioni")
          .update({
            stato: "completata_con_errori",
            completata_at: new Date().toISOString(),
            log_errori: [{ riga: 0, errore: `Upload fallito: ${message}` }],
          })
          .eq("id", imp.id);
        throw new Error(message);
      }
      await supabase.from("importazioni").update({ file_path: filePath }).eq("id", imp.id);

      await triggerImport({ data: { fonte: opts.fonte, importazioneId: imp.id, filePath } });
      return imp.id;
    },
    onSuccess: (id) => {
      setImportazioneId(id);
      setDone(false);
      toast.success("Import avviato in background. Puoi chiudere la pagina, prosegue lato server.");
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: progress } = useQuery({
    queryKey: ["importazione-stato", importazioneId],
    queryFn: async () => {
      if (!importazioneId) return null;
      const { data } = await supabase
        .from("importazioni")
        .select(
          "stato, righe_totali, righe_elaborate, righe_create, righe_aggiornate, righe_errore, log_errori, completata_at",
        )
        .eq("id", importazioneId)
        .single();
      return data as BackgroundImportProgress | null;
    },
    enabled: !!importazioneId && !done,
    refetchInterval: 2000,
  });

  if (
    progress &&
    !done &&
    (progress.stato === "completata" || progress.stato === "completata_con_errori")
  ) {
    setDone(true);
    (opts.invalidateKeys ?? []).forEach((k) => qc.invalidateQueries({ queryKey: k }));
    qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    toast.success("Import completato");
    opts.onDone?.(progress);
  }

  function reset() {
    setImportazioneId(null);
    setDone(false);
  }

  return {
    start: (args: StartImportArgs) => startMut.mutate(args),
    isPending: startMut.isPending,
    importazioneId,
    inProgress: !!importazioneId && !done,
    done,
    progress: progress ?? null,
    reset,
  };
}
