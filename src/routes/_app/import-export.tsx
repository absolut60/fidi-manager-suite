import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/import-export")({
  component: ImportExportPage,
});

function ImportExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Importa clienti da Excel ed esporta report fidi</p>
      </div>

      <Card className="p-12 text-center max-w-2xl mx-auto">
        <div className="size-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <FileSpreadsheet className="size-7 text-accent" />
        </div>
        <h2 className="text-xl font-bold mb-2">Prossimamente</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Strumenti per importazione massiva di anagrafiche clienti da file Excel ed esportazione di report sui fidi commerciali in formato CSV / XLSX.
        </p>
        <div className="inline-flex items-center gap-1.5 mt-6 px-3 py-1.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
          <Clock className="size-3" /> In sviluppo
        </div>
      </Card>
    </div>
  );
}
