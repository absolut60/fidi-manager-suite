// Helper condiviso per invio email via edge function `send-email`.
// Usato dai job Inngest lato server (service role + secret interno).
//
// Autorizzazione dual-track sulla edge:
//   - ramo SERVER (questo helper): header `x-internal-secret` = INTERNAL_EMAIL_SECRET
//   - ramo UTENTE (client browser): JWT utente reale + ruolo abilitato
// Il fetch include comunque `Authorization: Bearer <service_role>` per
// superare il gateway della edge function (richiede un JWT valido); la vera
// autorizzazione applicativa la fa il secret interno.
export async function sendEmailViaEdge(payload: {
  to: string;
  subject: string;
  html: string;
  // Se true, la edge allega logo-made.png inline con cid "logoMade"
  // (richiesto quando il corpo HTML usa <img src="cid:logoMade">).
  inlineLogo?: boolean;
  // Display-name mittente (l'indirizzo resta quello SMTP autenticato lato edge).
  fromName?: string;
  // Reply-To: quando l'utente risponde alla mail arriva a questa casella.
  replyTo?: string;
}): Promise<{ ok: boolean; err?: string }> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const INTERNAL_SECRET = process.env.INTERNAL_EMAIL_SECRET;

  if (!SUPABASE_URL || !SERVICE_ROLE || !INTERNAL_SECRET) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SERVICE_ROLE ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
      ...(!INTERNAL_SECRET ? ["INTERNAL_EMAIL_SECRET"] : []),
    ];
    return {
      ok: false,
      err: `Configurazione email server incompleta: manca ${missing.join(", ")}`,
    };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, err: `HTTP ${res.status}: ${txt.slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}
