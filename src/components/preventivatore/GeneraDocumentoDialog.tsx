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
  const [sel, setSel] = useState("PREVENTIVO");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [colonne, setColonne] = useState(COLONNE_RIGHE_DEFAULT);

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
        setColonne({ ...COLONNE_RIGHE_DEFAULT, ...(data.colonne_righe as Partial) });
      }
    })();
  }, [open]);

  async function salvaPreferenze() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("preferenze_stampa")
      .upsert({ user_id: user.id, colonne_righe: colonne as unknown as Record }, { onConflict: "user_id" });
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
      
        
          
            Genera documento
            Scegli la modalità di output {docDa} {prev.numero ?? ""}.
          

          


            {MODI.map((m) => {
              const Icon = m.icon;
              const active = sel === m.id;
              return (
                 setSel(m.id)}
                  className={`cursor-pointer border-2 p-3 transition ${
                    active ? "border-primary bg-primary/5" : "border-transparent hover:border-muted"
                  }`}
                >
                  


                    
                    


                      

{m.label}


                      

{m.desc}


                    


                  


                
              );
            })}
          



          {sel === "PREVENTIVO" && (
            


              

Colonne righe da includere


              


                Cod. Gamma, Descrizione e Subtotale del blocco sono sempre stampati.
              


              


                {COLONNE_LABEL.map(({ key, label }) => (
                  
                    
                        setColonne((c) => ({ ...c, [key]: v === true }))
                      }
                    />
                    {label}
                  
                ))}
              


            


          )}

          
             onOpenChange(false)} disabled={busy}>Annulla
            {modoCorrente.excel && (
               run("xlsx")} disabled={busy}>
                 Esporta Excel
              
            )}
             run("pdf")} disabled={busy}>
               {busy ? "Generazione…" : "Genera PDF"}
            
          
        
      

       { if (!v) setPreview(null); }}
        blob={preview?.blob ?? null}
        fileName={preview?.fileName ?? ""}
      />
    
  );
}
