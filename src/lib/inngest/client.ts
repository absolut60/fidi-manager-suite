import { Inngest } from "inngest";

// Inngest client. INNGEST_SIGNING_KEY è iniettato dal connector e usato dal
// serve handler per verificare le richieste in arrivo.
export const inngest = new Inngest({ id: "fidi-manager-suite" });

// Invio eventi tramite il gateway Lovable (non chiamare inn.gs direttamente).
export async function sendInngestEvent(name: string, data: Record<string, unknown>) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configurata");
  if (!INNGEST_API_KEY) throw new Error("INNGEST_API_KEY non configurata");

  const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": INNGEST_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, data }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Inngest event send failed [${res.status}]: ${body}`);
  }
  return res.json();
}
