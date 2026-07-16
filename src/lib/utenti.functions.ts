import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const RUOLI_VALIDI = [
  "store_manager",
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "amministratore",
  "amministrazione",
  "direzione",
  "agente",
  "richiedente",
  "approvatore_richieste_liv1",
  "approvatore_richieste_liv2",
  "gestore_richieste",
  "esecutore_richieste",
] as const;

async function assertAgenteEsiste(codice: string) {
  const { data, error } = await supabaseAdmin
    .from("agenti")
    .select("codice")
    .eq("codice", codice)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Agente con codice "${codice}" non trovato`);
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

/** Crea un nuovo utente con password e imposta profilo + ruoli. */
export const creaUtente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    email: string;
    password: string;
    nome?: string;
    cognome?: string;
    ruoli: string[];
    storeId?: string | null;
    codiceAgente?: string | null;
    attivo?: boolean;
  }) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(8, "Password minimo 8 caratteri").max(100),
      nome: z.string().max(100).optional(),
      cognome: z.string().max(100).optional(),
      ruoli: z.array(z.enum(RUOLI_VALIDI)).min(1).max(8),
      storeId: z.string().uuid().nullable().optional(),
      codiceAgente: z.string().max(50).nullable().optional(),
      attivo: z.boolean().optional().default(true),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.ruoli.includes("store_manager") && !data.storeId) {
      throw new Error("Il ruolo Store Manager richiede un punto vendita");
    }
    if (data.ruoli.includes("agente") && !data.codiceAgente) {
      throw new Error("Il ruolo Agente richiede un agente collegato");
    }
    if (data.ruoli.includes("agente") && data.codiceAgente) {
      await assertAgenteEsiste(data.codiceAgente);
    }

    // Crea utente con password — nessuna conferma email richiesta
    const { data: created, error: eCreate } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        nome: data.nome ?? "",
        cognome: data.cognome ?? "",
      },
    });
    if (eCreate) throw new Error(eCreate.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Creazione fallita: nessun utente creato");

    // Forza conferma email — non richiesta per utenti creati dall'admin
    if (userId) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });
    }


    // Aggiorna profilo
    const { error: eProf } = await supabaseAdmin
      .from("profili")
      .update({
        nome: data.nome ?? "",
        cognome: data.cognome ?? "",
        store_id: data.storeId ?? null,
        codice_agente: data.ruoli.includes("agente") ? (data.codiceAgente ?? null) : null,
        attivo: data.attivo ?? true,
      })
      .eq("id", userId);
    if (eProf) throw new Error(eProf.message);

    // Sostituisci i ruoli con quelli scelti
    const { error: eDel } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    if (eDel) throw new Error(eDel.message);
    const { error: eIns } = await supabaseAdmin
      .from("user_roles")
      .insert(data.ruoli.map((role) => ({ user_id: userId, role: role as AppRole })));
    if (eIns) throw new Error(eIns.message);

    return { ok: true, userId };
  });

/** Aggiorna la password di un utente esistente. Solo admin. */
export const aggiornaPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(8, "Password minimo 8 caratteri").max(100),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Invia all'utente un'email con le sue credenziali di accesso. */
export const inviaCredenziali = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(1).max(200),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: userData, error: eUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (eUser) throw new Error(eUser.message);
    const email = userData.user?.email;
    if (!email) throw new Error("Email utente non trovata");

    const { data: profilo } = await supabaseAdmin
      .from("profili")
      .select("nome, cognome")
      .eq("id", data.userId)
      .maybeSingle();

    const nome = [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ") || email;
    const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";

    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#0f1b3d;padding:24px;text-align:center;color:#ffffff;font-weight:700;font-size:18px;">MADE — FidiManager</td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#0f1b3d;">Benvenuto in FidiManager</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Gentile ${esc(nome)},<br/>di seguito le tue credenziali di accesso:</p>
          <table role="presentation" cellspacing="0" cellpadding="8" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;margin:16px 0;">
            <tr><td style="font-weight:600;width:120px;background:#f9fafb;">Email</td><td>${esc(email)}</td></tr>
            <tr><td style="font-weight:600;background:#f9fafb;">Password</td><td style="font-family:monospace;">${esc(data.password)}</td></tr>
          </table>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Ti consigliamo di cambiare la password al primo accesso.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${appUrl}" style="display:inline-block;background:#0f1b3d;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Accedi a FidiManager →</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;font-size:12px;color:#6b7280;text-align:center;">Email generata automaticamente da FidiManager — Gruppo MADE.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const INTERNAL_SECRET = process.env.INTERNAL_EMAIL_SECRET;
    if (!INTERNAL_SECRET) {
      throw new Error("Configurazione email server incompleta: manca INTERNAL_EMAIL_SECRET");
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error(
        `Configurazione email server incompleta: manca ${!SUPABASE_URL ? "SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY"}`,
      );
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        to: email,
        subject: "Le tue credenziali di accesso — FidiManager MADE",
        html,
      }),
    });
    if (!res.ok) {
      const bodyTxt = (await res.text()).slice(0, 400);
      throw new Error(`Invio email fallito [HTTP ${res.status}]: ${bodyTxt}`);
    }

    return { ok: true };
  });

/** Aggiorna profilo + ruoli multipli di un utente esistente. */
export const updateUtenteRuoli = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    ruoli: string[];
    storeId?: string | null;
    codiceAgente?: string | null;
    attivo: boolean;
    nome?: string;
    cognome?: string;
  }) =>
    z.object({
      userId: z.string().uuid(),
      ruoli: z.array(z.enum(RUOLI_VALIDI)).min(1).max(8),
      storeId: z.string().uuid().nullable().optional(),
      codiceAgente: z.string().max(50).nullable().optional(),
      attivo: z.boolean(),
      nome: z.string().max(100).optional(),
      cognome: z.string().max(100).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (data.ruoli.includes("store_manager") && !data.storeId) {
      throw new Error("Il ruolo Store Manager richiede un punto vendita");
    }
    if (data.ruoli.includes("agente") && !data.codiceAgente) {
      throw new Error("Il ruolo Agente richiede un agente collegato");
    }
    if (data.ruoli.includes("agente") && data.codiceAgente) {
      await assertAgenteEsiste(data.codiceAgente);
    }

    const profileUpdate: {
      store_id: string | null;
      codice_agente: string | null;
      attivo: boolean;
      nome?: string;
      cognome?: string;
    } = {
      store_id: data.storeId ?? null,
      codice_agente: data.ruoli.includes("agente") ? (data.codiceAgente ?? null) : null,
      attivo: data.attivo,
    };
    if (data.nome !== undefined) profileUpdate.nome = data.nome;
    if (data.cognome !== undefined) profileUpdate.cognome = data.cognome;

    const { error: eProf } = await supabaseAdmin
      .from("profili")
      .update(profileUpdate)
      .eq("id", data.userId);
    if (eProf) throw new Error(eProf.message);

    const { error: eDel } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (eDel) throw new Error(eDel.message);
    const { error: eIns } = await supabaseAdmin
      .from("user_roles")
      .insert(data.ruoli.map((role) => ({ user_id: data.userId, role: role as AppRole })));
    if (eIns) throw new Error(eIns.message);

    return { ok: true };
  });
