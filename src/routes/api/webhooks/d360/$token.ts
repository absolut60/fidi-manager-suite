import { createFileRoute } from "@tanstack/react-router";

const PAROLE_STOP = new Set([
  "STOP",
  "CANCELLAMI",
  "CANCELLA",
  "ANNULLA",
  "DISISCRIVIMI",
  "UNSUBSCRIBE",
]);

type WaMessage = {
  from?: string;
  type?: string;
  text?: { body?: string };
};

type WaValue = {
  messages?: WaMessage[];
};

type WaChange = {
  value?: WaValue;
};

type WaEntry = {
  changes?: WaChange[];
};

type WaBody = {
  entry?: WaEntry[];
};

function estraiMessaggi(body: WaBody): { mittente: string; testo: string }[] {
  const out: { mittente: string; testo: string }[] = [];
  for (const e of body?.entry ?? []) {
    for (const c of e?.changes ?? []) {
      for (const m of c?.value?.messages ?? []) {
        const mittente = typeof m?.from === "string" ? m.from : "";
        if (!mittente) continue;
        const testo =
          m?.type === "text" && typeof m?.text?.body === "string"
            ? m.text.body
            : "";
        out.push({ mittente, testo });
      }
    }
  }
  return out;
}

export const Route = createFileRoute("/api/webhooks/d360/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const expected = process.env["D360_WEBHOOK_TOKEN"];
        if (!expected) {
          return Response.json(
            { ok: false, error: "webhook token non configurato" },
            { status: 500 },
          );
        }
        if (params.token !== expected) {
          return Response.json({ ok: false }, { status: 401 });
        }

        let body: WaBody;
        try {
          body = (await request.json()) as WaBody;
        } catch {
          return Response.json({ ok: true, ignored: true });
        }

        const messaggi = estraiMessaggi(body);
        if (messaggi.length === 0) {
          return Response.json({ ok: true });
        }

        console.log(`[d360-webhook] messaggi ricevuti: ${messaggi.length}`);

        let stop = 0;
        const daProcessare = messaggi.filter(
          (m) => m.testo && PAROLE_STOP.has(m.testo.trim().toUpperCase()),
        );
        if (daProcessare.length > 0) {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          for (const m of daProcessare) {
            try {
              const { error } = await supabaseAdmin.rpc(
                "registra_stop_whatsapp",
                { _numero_raw: m.mittente } as never,
              );
              if (!error) stop += 1;
              else console.error("[d360-webhook] rpc errore", error.message);
            } catch (e) {
              console.error("[d360-webhook] rpc eccezione", e);
            }
          }
        }

        return Response.json({
          ok: true,
          processati: messaggi.length,
          stop,
        });
      },
    },
  },
});
