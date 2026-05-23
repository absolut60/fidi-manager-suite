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
  righe_saltate: number | null;
  codici_mancanti: string[] | null;
  log_errori: unknown;
  completata_at: string | null;
};

type StartImportArgs = {
  file: File;
  rowsTotali: number;
  rigeErroreClient?: number;
  scadenziarioStaging?: {
    rows: Array<Record<string, unknown>>;
    missing: number[];
    chunkSize?: number;
  };
};

export function useBackgroundImport(opts: {
  fonte: Fonte;
  invalidateKeys?: string[][];
  onDone?: (p: BackgroundImportProgress) => void;
  onUploadComplete?: () => void;
  onError?: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [importazioneId, setImportazioneId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const startMut = useMutation({
    mutationFn: async (args: StartImportArgs) => {
      const { file, rowsTotali, rigeErroreClient = 0 } = args;
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

      // Single-shot upload del file Excel intero su Supabase Storage.
      const filePath = `${imp.id}/${file.name}`;
      try {
        const { error } = await supabase.storage.from("import-files").upload(filePath, file, {
          contentType:
            file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
        if (error) throw error;
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
      let triggerFilePath = filePath;

      if (opts.fonte === "scadenziario" && args.scadenziarioStaging) {
        const chunkSize = args.scadenziarioStaging.chunkSize ?? 1000;
        const chunks: Array<{
          chunkIndex: number;
          chunkPath: string;
          rowsCount: number;
          missingCount: number;
        }> = [];
        const byRow = new Map<number, Record<string, unknown>>();
        args.scadenziarioStaging.rows.forEach((row) => byRow.set(Number(row.idx), row));
        const orderedIndexes = Array.from(
          new Set([
            ...args.scadenziarioStaging.rows.map((row) => Number(row.idx)),
            ...args.scadenziarioStaging.missing,
          ]),
        )
          .filter((idx) => Number.isFinite(idx))
          .sort((a, b) => a - b);

        for (let i = 0; i < orderedIndexes.length; i += chunkSize) {
          const chunkIndex = Math.floor(i / chunkSize);
          const indexes = orderedIndexes.slice(i, i + chunkSize);
          const chunkRows = indexes.map((idx) => byRow.get(idx)).filter(Boolean) as Array<
            Record<string, unknown>
          >;
          const validIndexes = new Set(chunkRows.map((row) => Number(row.idx)));
          const chunkMissing = indexes.filter((idx) => !validIndexes.has(idx));
          const chunkPath = `_staging/${imp.id}/chunk-${chunkIndex}.json`;
          const payload = JSON.stringify({ rows: chunkRows, missing: chunkMissing });
          const { error } = await supabase.storage
            .from("import-files")
            .upload(chunkPath, new Blob([payload], { type: "application/json" }), {
              contentType: "application/json",
              upsert: true,
            });
          if (error) throw error;
          chunks.push({
            chunkIndex,
            chunkPath,
            rowsCount: chunkRows.length,
            missingCount: chunkMissing.length,
          });
        }

        const manifestPath = `_staging/${imp.id}/manifest.json`;
        const manifest = JSON.stringify({
          kind: "scadenziario-staging-v1",
          originalFilePath: filePath,
          totRead: args.rowsTotali,
          chunkCount: chunks.length,
          chunks,
          createdAt: new Date().toISOString(),
        });
        const { error } = await supabase.storage
          .from("import-files")
          .upload(manifestPath, new Blob([manifest], { type: "application/json" }), {
            contentType: "application/json",
            upsert: true,
          });
        if (error) throw error;
        triggerFilePath = manifestPath;
      }

      await supabase.from("importazioni").update({ file_path: triggerFilePath }).eq("id", imp.id);
      opts.onUploadComplete?.();

      await triggerImport({
        data: { fonte: opts.fonte, importazioneId: imp.id, filePath: triggerFilePath },
      });
      return imp.id;
    },
    onSuccess: (id) => {
      setImportazioneId(id);
      setDone(false);
      toast.success("Import avviato in background. Puoi chiudere la pagina, prosegue lato server.");
      qc.invalidateQueries({ queryKey: ["storico-import-export"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      opts.onError?.(e.message);
    },
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
