// Helper condiviso per invio email via edge function `send-email`.
// Usato dai job Inngest lato server (service role).
export async function sendEmailViaEdge(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; err?: string }> {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
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
