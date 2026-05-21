import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/check-scadenze")({
  server: {
    handlers: {
      POST: async () => {
        try {
          // Leggi configurazioni
          const { data: cfgRows } = await supabaseAdmin
            .from("configurazioni")
            .select("chiave, valore")
            .in("chiave", ["giorni_reminder_scadenza", "giorni_reminder_urgente"]);

          const cfg: Record<string, string> = {};
          (cfgRows ?? []).forEach((r) => (cfg[r.chiave] = r.valore));
          const giorniReminder = parseInt(cfg.giorni_reminder_scadenza ?? "30", 10);
          const giorniUrgente = parseInt(cfg.giorni_reminder_urgente ?? "7", 10);

          const now = new Date();
          const limit = new Date(now.getTime() + giorniReminder * 86400000);

          // Trova richieste approvate in scadenza
          const { data: richieste, error } = await supabaseAdmin
            .from("richieste_fido")
            .select("id, cliente_id, importo_approvato, data_scadenza, created_by, store_id, clienti(ragione_sociale)")
            .eq("stato", "approvata")
            .not("data_scadenza", "is", null)
            .lte("data_scadenza", limit.toISOString())
            .gte("data_scadenza", now.toISOString());

          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }

          let creati = 0;
          for (const r of richieste ?? []) {
            const giorniMancanti = Math.ceil(
              (new Date(r.data_scadenza!).getTime() - now.getTime()) / 86400000,
            );
            const urgente = giorniMancanti <= giorniUrgente;
            const clienteNome =
              (r.clienti as { ragione_sociale?: string } | null)?.ragione_sociale ?? "—";

            // Evita duplicati negli ultimi 7 giorni per stessa richiesta
            const { data: esistenti } = await supabaseAdmin
              .from("notifiche")
              .select("id")
              .eq("tipo", "scadenza_fido")
              .filter("metadata->>richiesta_id", "eq", r.id)
              .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString())
              .limit(1);
            if (esistenti && esistenti.length > 0) continue;

            // Destinatari: autore + admin
            const destinatari = new Set<string>();
            if (r.created_by) destinatari.add(r.created_by);
            const { data: admins } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .eq("role", "amministratore");
            (admins ?? []).forEach((a) => destinatari.add(a.user_id));

            for (const userId of destinatari) {
              await supabaseAdmin.from("notifiche").insert({
                user_id: userId,
                tipo: "scadenza_fido",
                titolo: urgente
                  ? `⚠️ Fido in scadenza tra ${giorniMancanti}gg`
                  : `Fido in scadenza tra ${giorniMancanti}gg`,
                messaggio: `${clienteNome} — € ${r.importo_approvato ?? 0}`,
                link: `/richieste/${r.id}`,
                metadata: {
                  richiesta_id: r.id,
                  giorni_mancanti: giorniMancanti,
                  urgente,
                },
              });
              creati++;
            }
          }

          return Response.json({
            success: true,
            richieste_trovate: richieste?.length ?? 0,
            notifiche_create: creati,
            timestamp: now.toISOString(),
          });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Errore sconosciuto" },
            { status: 500 },
          );
        }
      },
    },
  },
});
