import { supabase } from "@/integrations/supabase/client";
import { isEmailValida } from "@/lib/email-validazione";

export type DestinatarioCampagnaInput = {
  cliente_id: string | null;
  contatto_id: string | null;
  tipo_destinatario: "aziendale" | "contatto";
  email: string;
  nome_riferimento: string | null;
};

export type RiepilogoAggiunta = {
  aggiunti: number;
  saltati: number;
  scartati: number;
};

const CHUNK_INSERT = 500;

/**
 * Aggiunge indirizzi al "carrello" destinatari di una campagna email marketing.
 * - Filtra le email non valide (isEmailValida) -> conteggiate come `scartati`.
 * - Deduplica in-memory sullo stesso batch (l'unità è l'indirizzo).
 * - Insert con ON CONFLICT (campagna_id, email) DO NOTHING (upsert ignoreDuplicates),
 *   quindi è idempotente: reinserire lo stesso set non crea doppioni.
 * NESSUN INVIO: stato_invio resta al default 'da_inviare'.
 */
export async function aggiungiDestinatariCampagna(
  campagnaId: string,
  destinatari: DestinatarioCampagnaInput[],
  aggiuntoDa: string | null,
): Promise<RiepilogoAggiunta> {
  const visti = new Set<string>();
  const validi: DestinatarioCampagnaInput[] = [];
  let scartati = 0;

  for (const d of destinatari) {
    const email = String(d.email ?? "").trim().toLowerCase();
    if (!isEmailValida(email)) { scartati += 1; continue; }
    if (visti.has(email)) continue;
    visti.add(email);
    validi.push({ ...d, email });
  }

  if (validi.length === 0) return { aggiunti: 0, saltati: 0, scartati };

  let aggiunti = 0;
  for (let i = 0; i < validi.length; i += CHUNK_INSERT) {
    const part = validi.slice(i, i + CHUNK_INSERT);
    const { data, error } = await supabase
      .from("campagne_email_destinatari")
      .upsert(
        part.map((d) => ({
          campagna_id: campagnaId,
          cliente_id: d.cliente_id,
          contatto_id: d.contatto_id,
          tipo_destinatario: d.tipo_destinatario,
          email: d.email,
          nome_riferimento: d.nome_riferimento,
          aggiunto_da: aggiuntoDa,
        })),
        { onConflict: "campagna_id,email", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    aggiunti += (data ?? []).length;
  }

  return { aggiunti, saltati: validi.length - aggiunti, scartati };
}
