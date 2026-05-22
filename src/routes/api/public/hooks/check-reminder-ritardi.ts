import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/check-reminder-ritardi")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const now = new Date();
          const today = now.toISOString().slice(0, 10);
          const since = new Date(now.getTime() - 7 * 86400000).toISOString();

          // Scadenze aperte con ritardo > 60gg
          const { data: scadenze, error } = await supabaseAdmin
            .from("scadenze")
            .select("id, cliente_id, giorni_ritardo, importo_scadenza, numero_documento, clienti(ragione_sociale)")
            .eq("stato_contabile", "Aperta")
            .gt("giorni_ritardo", 60);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          const { data: utenti } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .in("role", ["amministratore", "approvatore_liv3"]);
          const utentiIds = Array.from(new Set((utenti ?? []).map((u) => u.user_id)));
          if (!utentiIds.length) return Response.json({ success: true, created: 0 });

          let created = 0;
          for (const s of scadenze ?? []) {
            // Salta se già esiste reminder recente per questa scadenza
            const { data: exists } = await supabaseAdmin
              .from("reminder")
              .select("id")
              .eq("scadenza_id", s.id)
              .gte("created_at", since)
              .limit(1);
            if (exists && exists.length) continue;

            const cName = (s.clienti as { ragione_sociale?: string } | null)?.ragione_sociale ?? "Cliente";
            const titolo = `Ritardo ${s.giorni_ritardo}gg — ${cName}`;
            const descr = `Doc ${s.numero_documento ?? "—"} · € ${s.importo_scadenza ?? 0}`;

            for (const uid of utentiIds) {
              await supabaseAdmin.from("reminder").insert({
                tipo: "scadenza_insoluto",
                titolo,
                descrizione: descr,
                cliente_id: s.cliente_id,
                scadenza_id: s.id,
                utente_id: uid,
                data_reminder: today,
              });
              await supabaseAdmin.from("notifiche").insert({
                user_id: uid,
                tipo: "ritardo_grave",
                titolo,
                messaggio: descr,
                link: `/clienti/${s.cliente_id}`,
                metadata: { scadenza_id: s.id, cliente_id: s.cliente_id, giorni_ritardo: s.giorni_ritardo },
              });
              created++;
            }
          }
          return Response.json({ success: true, scadenze_trovate: scadenze?.length ?? 0, created });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 });
        }
      },
    },
  },
});
