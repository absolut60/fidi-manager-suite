import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, FileBarChart, Package, Truck, Download, FileSpreadsheet } from "lucide-react";
import type { PreventivoConDettagli } from "@/lib/preventivi-api";
import {
  exportPreventivoPdf, exportPropostaRapidaPdf, exportListaMaterialiPdf, exportListaFornitorePdf,
  COLONNE_RIGHE_DEFAULT, type ColonneRighePdf,
} from "@/lib/pdf-export";
import { exportListaMaterialiXlsx, exportListaFornitoreXlsx } from "@/lib/excel-export";
import { AnteprimaPdfDialog } from "./AnteprimaPdfDialog";
import { supabase } from "@/integrations/supabase/client";

type Modalita = "PREVENTIVO" | "PROPOSTA_RAPIDA" | "LISTA_MATERIALI" | "LISTA_FORNITORE";

function buildModi(isOrdine: boolean): { id: Modalita; label: string; desc: string; icon: typeof FileText; excel: boolean }[] {
  return [
    {
      id: "PREVENTIVO", label: isOrdine ? "Ordine" : "Preventivo",
      desc: isOrdine
        ? "PDF ufficiale per il cliente: intestazione MADE, dati cantiere, blocchi con materiali, totali e IVA."
        : "PDF ufficiale per il cliente: intestazione MADE, dati cantiere, blocchi con materiali, totali e IVA.",
      icon: FileText, excel: false,
    },
    {
      id: "PROPOSTA_RAPIDA", label: "Proposta rapida",
      desc: "Versione sintetica: solo Rif., descrizione, prezzo/mq e importo per ogni blocco.",
      icon: FileBarChart, excel: false,
    },
    {
      id: "LISTA_MATERIALI", label: "Lista materiali",
      desc: "Elenco materiali con quantità teoriche totali (somma incidenze × quantità) raggruppato per articolo.",
      icon: Package, excel: true,
    },
    {
      id: "LISTA_FORNITORE", label: "Lista mat. fornitore",
      desc: "Conferma d'ordine: quantità arrotondate ai minimi di vendita (confezioni/bancali interi), raggruppate per fornitore.",
      icon: Truck, excel: true,
    },
  ];
}

const COLONNE_LABEL: { key: keyof ColonneRighePdf; label: string }[] = [
  { key: "um", label: "U.M." },
  { key: "quantita", label: "Quantità" },
  { key: "prezzo_unit", label: "Prezzo unit." },
  { key: "sconto", label: "Sconto %" },
  { key: "prezzo_scontato", label: "Prezzo scontato" },
  { key: "importo", label: "Importo" },
];

export function GeneraDocumentoDialog({
  open, onOpenChange, prev,
}: { open: boolean; onOpenChange: (v: boolean) => void; prev: PreventivoConDettagli }) {
  const [sel, setSel] = useState<Modalita>("PREVENTIVO");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [colonne, setColonne] = useState<ColonneRighePdf>(COLONNE_RIGHE_DEFAULT);

  const isOrdine = prev.tipo === "ordine";
  const docDa = isOrdine ? "dall'ordine" : "dal preventivo";
  const MODI = buildModi(isOrdine);

  // Carica preferenze utente all'apertura
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("preferenze_stampa")
        .select("colonne_righe")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.colonne_righe) {
        setColonne({ ...COLONNE_RIGHE_DEFAULT, ...(data.colonne_righe as Partial<ColonneRighePdf>) });
      }
    })();
  }, [open]);

  async function salvaPreferenze() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("preferenze_stampa")
      .upsert({ user_id: user.id, colonne_righe: colonne as unknown as Record<string, boolean> }, { onConflict: "user_id" });
  }

  async function run(formato: "pdf" | "xlsx") {
    setBusy(true);
    try {
      if (formato === "pdf") {
        let result: { blob: Blob; fileName: string };
        if (sel === "PREVENTIVO") {
          result = await exportPreventivoPdf(prev, { colonne });
          await salvaPreferenze();
        }
        else if (sel === "PROPOSTA_RAPIDA") result = await exportPropostaRapidaPdf(prev);
        else if (sel === "LISTA_MATERIALI") result = await exportListaMaterialiPdf(prev);
        else result = await exportListaFornitorePdf(prev);
        setPreview(result);
        onOpenChange(false);
      } else {
        if (sel === "LISTA_MATERIALI") await exportListaMaterialiXlsx(prev);
        else if (sel === "LISTA_FORNITORE") await exportListaFornitoreXlsx(prev);
        toast.success("Documento generato");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const modoCorrente = MODI.find((m) => m.id === sel)!;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Genera documento</DialogTitle>
            <DialogDescription>Scegli la modalità di output {docDa} {prev.numero ?? ""}.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {MODI.map((m) => {
              const Icon = m.icon;
              const active = sel === m.id;
              return (
                <Card
                  key={m.id}
                  onClick={() => setSel(m.id)}
                  className={`cursor-pointer border-2 p-3 transition ${
                    active ? "border-primary bg-primary/5" : "border-transparent hover:border-muted"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-6 w-6 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className="text-sm font-semibold">{m.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{m.desc}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {sel === "PREVENTIVO" && (
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-semibold">Colonne righe da includere</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Cod. Gamma, Descrizione e Subtotale del blocco sono sempre stampati.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {COLONNE_LABEL.map(({ key, label }) => (
                  <Label
                    key={key}
                    htmlFor={`col-${key}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      id={`col-${key}`}
                      checked={colonne[key]}
                      onCheckedChange={(v) =>
                        setColonne((c) => ({ ...c, [key]: v === true }))
                      }
                    />
                    {label}
                  </Label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Annulla</Button>
            {modoCorrente.excel && (
              <Button variant="outline" onClick={() => run("xlsx")} disabled={busy}>
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Esporta Excel
              </Button>
            )}
            <Button onClick={() => run("pdf")} disabled={busy}>
              <Download className="mr-1 h-4 w-4" /> {busy ? "Generazione…" : "Genera PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnteprimaPdfDialog
        open={preview !== null}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        blob={preview?.blob ?? null}
        fileName={preview?.fileName ?? ""}
      />
    </>
  );
}
