import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RUOLI_MARKETING = ["marketing", "amministrazione", "direzione", "amministratore"];
const BASE_360 = "https://waba-v2.360dialog.io";

async function assertRuoloMarketing(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", RUOLI_MARKETING as never);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Accesso riservato al team marketing");
}

/** Slug conforme alle regole Meta: minuscolo, solo [a-z0-9_]. */
function slugMeta(nome: string): string {
  const s = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
  return s || `template_${Date.now()}`;
}

/** Origin pubblico dell'app, per rendere assoluti i path relativi delle immagini. */
function originPubblico(): string | null {
  const env =
    process.env["APP_PUBLIC_URL"] ??
    process.env["PUBLIC_APP_URL"] ??
    process.env["APP_URL"] ??
    null;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  try {
    const req = getRequest();
    const url = req?.url ? new URL(req.url) : null;
    if (url && url.protocol.startsWith("http") && !/localhost|127\.0\.0\.1/.test(url.hostname)) {
      return url.origin;
    }
  } catch {
    /* nessuna request disponibile */
  }
  return null;
}

type PulsanteWa =
  | { tipo: "link"; testo?: string; url?: string }
  | { tipo: "rapido"; testo?: string; flusso?: string; evento_id?: string };

/**
 * Invia un template WhatsApp a Meta (tramite 360dialog) per approvazione.
 * Non imposta mai lo stato "approvato": in caso di successo il template resta
 * "in_attesa" finché non arriva l'esito dal webhook (fetta 2b).
 */
export const inviaTemplateInApprovazione = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ templateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    await assertRuoloMarketing(context.userId);

    const apiKey = process.env["D360_API_KEY"];
    if (!apiKey || apiKey.trim() === "") {
      return { ok: false, error: "D360_API_KEY non configurata" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tpl, error } = await supabaseAdmin
      .from("whatsapp_template")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!tpl) return { ok: false, error: "Template non trovato" };

    const nome = (tpl.nome ?? "").trim();
    const body = (tpl.body_testo ?? "").trim();
    if (!nome) return { ok: false, error: "Il nome template è obbligatorio" };
    if (!body) return { ok: false, error: "Il corpo del messaggio è obbligatorio" };

    const metaName = (tpl.meta_template_name ?? "").trim() || slugMeta(nome);

    const components: Record<string, unknown>[] = [];

    // HEADER
    if (tpl.header_tipo === "testo" && (tpl.header_testo ?? "").trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: (tpl.header_testo as string).trim() });
    } else if (tpl.header_tipo === "immagine") {
      const media = (tpl.header_media_url ?? "").trim();
      if (!media) return { ok: false, error: "Immagine header mancante" };
      let assoluto = media;
      if (!/^https?:\/\//i.test(media)) {
        const origin = originPubblico();
        if (!origin) {
          return {
            ok: false,
            error:
              "Immagine header richiede URL pubblico: l'app non espone un indirizzo pubblico affidabile. Pubblica l'app o usa un header di testo.",
          };
        }
        assoluto = `${origin}${media.startsWith("/") ? "" : "/"}${media}`;
      }
      components.push({
        type: "HEADER",
        format: "IMAGE",
        example: { header_handle: [assoluto] },
      });
    }

    // BODY (+ example obbligatorio se ci sono segnaposto)
    const nVar = [...body.matchAll(/\{\{(\d+)\}\}/g)].length;
    const bodyComp: Record<string, unknown> = { type: "BODY", text: body };
    if (nVar > 0) {
      bodyComp["example"] = { body_text: [Array.from({ length: nVar }, () => "Esempio")] };
    }
    components.push(bodyComp);

    // FOOTER
    if ((tpl.footer_testo ?? "").trim()) {
      components.push({ type: "FOOTER", text: (tpl.footer_testo as string).trim() });
    }

    // BUTTONS
    const pulsanti = Array.isArray(tpl.pulsanti) ? (tpl.pulsanti as unknown as PulsanteWa[]) : [];
    const buttons = pulsanti
      .map((p) => {
        const testo = (p?.testo ?? "").trim();
        if (!testo) return null;
        if (p.tipo === "link") {
          const url = (p.url ?? "").trim();
          if (!url) return null;
          return { type: "URL", text: testo, url };
        }
        return { type: "QUICK_REPLY", text: testo };
      })
      .filter(Boolean);
    if (buttons.length > 0) components.push({ type: "BUTTONS", buttons });

    const payload = {
      name: metaName,
      category: String(tpl.categoria ?? "marketing").toUpperCase(),
      language: tpl.lingua || "it",
      components,
    };

    let res: Response;
    try {
      res = await fetch(`${BASE_360}/v1/configs/templates`, {
        method: "POST",
        headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[whatsapp-template] rete 360dialog", msg);
      return { ok: false, error: `Connessione a 360dialog fallita: ${msg}` };
    }

    const testo = await res.text();
    let json: any = null;
    try {
      json = testo ? JSON.parse(testo) : null;
    } catch {
      /* risposta non JSON */
    }

    if (!res.ok) {
      const messaggio =
        json?.error?.error_user_msg ??
        json?.error?.message ??
        json?.message ??
        testo ??
        `Errore HTTP ${res.status}`;
      console.error("[whatsapp-template] errore Meta", res.status, testo);
      await supabaseAdmin
        .from("whatsapp_template")
        .update({ nota_rifiuto: String(messaggio).slice(0, 2000) } as never)
        .eq("id", tpl.id);
      return { ok: false, error: String(messaggio) };
    }

    const metaId: string | null = json?.id ?? json?.data?.id ?? json?.template_id ?? null;

    const { error: eUp } = await supabaseAdmin
      .from("whatsapp_template")
      .update({
        stato: "in_attesa",
        meta_template_name: metaName,
        meta_template_id: metaId,
        nota_rifiuto: null,
      } as never)
      .eq("id", tpl.id);
    if (eUp) return { ok: false, error: eUp.message };

    return { ok: true };
  });
