const API_URL = "https://waba-v2.360dialog.io";
const APP_URL_FALLBACK = "https://fidi-manager-suite.lovable.app";

/** Sceglie un solo indirizzo pubblico valido da una eventuale lista separata da virgole. */
function primoOriginValido(env: string): string | null {
  const valide: string[] = [];
  for (const v of env.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      const u = new URL(v);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      valide.push(u.origin);
    } catch {
      /* voce non URL */
    }
  }
  if (valide.length === 0) return null;
  const pubbliche = valide.filter(
    (v) => !v.includes("id-preview--") && !v.includes("localhost") && !v.includes("127.0.0.1"),
  );
  return (pubbliche[0] ?? valide[0]).replace(/\/+$/, "");
}

/** Origin pubblico dell'app, per rendere assoluti i path relativi delle immagini. */
function originPubblico(): string {
  const env =
    process.env["APP_PUBLIC_URL"] ??
    process.env["PUBLIC_APP_URL"] ??
    process.env["APP_URL"] ??
    process.env["VITE_APP_URL"] ??
    null;
  return (env ? primoOriginValido(env) : null) ?? APP_URL_FALLBACK;
}

/** Rende assoluto un path relativo dell'immagine header. */
export function urlAssolutoMedia(media: string): string {
  const m = String(media ?? "").trim();
  if (!m) return "";
  if (/^https?:\/\//i.test(m)) return m;
  const origin = originPubblico();
  return `${origin}${m.startsWith("/") ? "" : "/"}${m}`;
}

/** Normalizza un numero al formato internazionale Meta (solo cifre, senza "+"). */
function normalizzaNumeroWa(raw: string): string {
  let s = String(raw ?? "").replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.length === 10 && s.startsWith("3")) return `39${s}`;
  if (s.startsWith("39") && (s.length === 12 || s.length === 13)) return s;
  return s;
}

export async function inviaTemplate360(params: {
  numeroDest: string;
  templateName: string;
  lingua: string;
  parametriBody: string[];
  headerTipo?: string | null;
  headerMediaUrl?: string | null;
}): Promise<{ ok: boolean; messageId?: string; err?: string; temporaneo?: boolean }> {

  const apiKey = process.env["D360_API_KEY"];
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, err: "D360_API_KEY non configurata" };
  }

  const numero = normalizzaNumeroWa(params.numeroDest);
  if (numero.replace(/\D/g, "").length < 8) {
    return { ok: false, err: "Numero non valido" };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numero,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.lingua || "it" },
      components:
        params.parametriBody.length > 0
          ? [
              {
                type: "body",
                parameters: params.parametriBody.map((v) => ({ type: "text", text: v })),
              },
            ]
          : [],
    },
  };

  let res: Response;
  try {
    res = await fetch(`${API_URL}/messages`, {
      method: "POST",
      headers: {
        "D360-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, err: `Connessione a 360dialog fallita: ${msg}` };
  }

  const testo = await res.text();
  let json: unknown = null;
  try {
    json = testo ? JSON.parse(testo) : null;
  } catch {
    json = null;
  }

  if (res.ok) {
    const messageId = (json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
    return { ok: true, ...(messageId ? { messageId } : {}) };
  }

  console.error(`[whatsapp-invio] errore Meta [${res.status}]: ${testo}`);

  if ([502, 503, 504, 522].includes(res.status)) {
    return {
      ok: false,
      temporaneo: true,
      err: `Servizio 360dialog non disponibile: ${res.status}`,
    };
  }

  const j = json as
    | { error?: { error_user_msg?: string; message?: string }; message?: string }
    | null;
  const msg = j?.error?.error_user_msg ?? j?.error?.message ?? j?.message ?? testo;
  return { ok: false, err: String(msg ?? "Errore invio").slice(0, 500) };
}
