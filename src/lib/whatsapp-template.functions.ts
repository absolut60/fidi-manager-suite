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

/** Messaggio chiaro per errori temporanei del servizio (Cloudflare/origine 360dialog). */
function messaggioErroreServizio(status: number): string | null {
  if (status === 502 || status === 503 || status === 504 || status === 522) {
    return "Il servizio WhatsApp (360dialog) non risponde al momento: riprova tra qualche minuto.";
  }
  return null;
}

type TemplateRemoto = { status: string; reason: string | null };

/** Estrae in modo difensivo l'array di template dalla risposta 360dialog. */
function estraiTemplateRemoti(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const j = json as Record<string, unknown>;
    for (const k of ["waba_templates", "templates", "data"]) {
      if (Array.isArray(j[k])) return j[k] as Record<string, unknown>[];
    }
  }
  return [];
}

/** Mappa lo status Meta al nostro stato interno; null = lascia invariato. */
function mappaStato(status: string): { stato: string; avviso?: string } | null {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return { stato: "approvato" };
    case "REJECTED":
      return { stato: "rifiutato" };
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return { stato: "in_attesa" };
    case "PAUSED":
      return { stato: "approvato", avviso: "Template in pausa su Meta (PAUSED)." };
    case "DISABLED":
      return { stato: "approvato", avviso: "Template disabilitato su Meta (DISABLED)." };
    default:
      return null;
  }
}

/**
 * Legge gli stati reali dei template da 360dialog e allinea i record locali
 * che hanno meta_template_name valorizzato.
 */
export const sincronizzaStatiTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; error?: string; aggiornati?: number; totaleRemoti?: number }> => {
    await assertRuoloMarketing(context.userId);

    const apiKey = process.env["D360_API_KEY"];
    if (!apiKey || apiKey.trim() === "") {
      return { ok: false, error: "D360_API_KEY non configurata" };
    }

    let res: Response;
    try {
      res = await fetch(`${BASE_360}/v1/configs/templates`, {
        method: "GET",
        headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[whatsapp-template] sync rete 360dialog", msg);
      return { ok: false, error: `Connessione a 360dialog fallita: ${msg}` };
    }

    const testo = await res.text();
    let json: unknown = null;
    try {
      json = testo ? JSON.parse(testo) : null;
    } catch {
      /* risposta non JSON */
    }

    if (!res.ok) {
      const temporaneo = messaggioErroreServizio(res.status);
      if (temporaneo) {
        console.error("[whatsapp-template] sync errore servizio", res.status, testo);
        return { ok: false, error: temporaneo };
      }
      const j = json as Record<string, any> | null;
      const messaggio =
        j?.error?.error_user_msg ?? j?.error?.message ?? j?.message ?? testo ?? `Errore HTTP ${res.status}`;
      console.error("[whatsapp-template] sync errore Meta", res.status, testo);
      return { ok: false, error: String(messaggio) };
    }

    const remoti = estraiTemplateRemoti(json);
    const mappa = new Map<string, TemplateRemoto>();
    for (const t of remoti) {
      const name = typeof t?.name === "string" ? t.name : null;
      const status = typeof t?.status === "string" ? t.status : null;
      if (!name || !status) continue;
      const reason =
        (typeof t?.rejected_reason === "string" && t.rejected_reason) ||
        (typeof t?.reason === "string" && t.reason) ||
        null;
      mappa.set(name, { status, reason });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: locali, error: eRead } = await supabaseAdmin
      .from("whatsapp_template")
      .select("id, stato, nota_rifiuto, meta_template_name")
      .not("meta_template_name", "is", null);
    if (eRead) return { ok: false, error: eRead.message };

    let aggiornati = 0;
    for (const loc of locali ?? []) {
      const remoto = mappa.get(String(loc.meta_template_name));
      if (!remoto) continue;
      const mappato = mappaStato(remoto.status);
      if (!mappato) continue;

      const nuovoStato = mappato.stato;
      const nuovaNota =
        nuovoStato === "approvato"
          ? mappato.avviso ?? null
          : nuovoStato === "rifiutato"
            ? remoto.reason ?? loc.nota_rifiuto ?? null
            : loc.nota_rifiuto ?? null;

      if (nuovoStato === loc.stato && nuovaNota === (loc.nota_rifiuto ?? null)) continue;

      const { error: eUp } = await supabaseAdmin
        .from("whatsapp_template")
        .update({ stato: nuovoStato, nota_rifiuto: nuovaNota } as never)
        .eq("id", loc.id);
      if (eUp) {
        console.error("[whatsapp-template] sync update fallito", loc.id, eUp.message);
        continue;
      }
      aggiornati++;
    }

    return { ok: true, aggiornati, totaleRemoti: remoti.length };
  });
