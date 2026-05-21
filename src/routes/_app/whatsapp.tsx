import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppPage,
});

function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">Notifiche e comunicazioni automatiche</p>
      </div>

      <Card className="p-12 text-center max-w-2xl mx-auto">
        <div className="size-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="size-7 text-accent" />
        </div>
        <h2 className="text-xl font-bold mb-2">Prossimamente</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          L'integrazione WhatsApp Business permetterà di inviare automaticamente notifiche di approvazione, richieste di firma privacy e promemoria ai clienti dei punti vendita.
        </p>
        <div className="inline-flex items-center gap-1.5 mt-6 px-3 py-1.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
          <Clock className="size-3" /> In sviluppo
        </div>
      </Card>
    </div>
  );
}
