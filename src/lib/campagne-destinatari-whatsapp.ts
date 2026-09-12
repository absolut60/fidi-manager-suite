import { supabase } from "@/integrations/supabase/client";

export type DestinatarioWhatsappInput = {
  contatto_id: string;
  cliente_id: string | null;
  numero_dest: string;
  nome_riferimento: string | null;
};

export type RiepilogoAggiuntaWa = {
  aggiunti: number;
  saltati: number;
};

const CHUNK_INSERT = 500;

/**
 * Aggiunge contatti al "carrello" destinatari di una campagna WhatsApp.
 * - Scarta i contatti senza numero_dest.
 * - Deduplica in-memory sullo stesso batch (l'unità è il contatto).
 * - Insert con ON CONFLICT (campagna_id, contatto_id) DO NOTHING (upsert ignoreDuplicates),
 *   quindi è idempotente: reinserire lo stesso set non crea doppioni.
 * NESSUN INVIO: stato resta al default 'in_coda'.
 * NESSUN filtro opt-out qui: il consenso whatsapp è già garantito a monte da
 * get_destinatari_whatsapp_segmento, che è la fonte dei destinatari.
 */
export async function aggiungiDestinatariWhatsappCampagna(
  campagnaId: string,
  destinatari: DestinatarioWhatsappInput[],
  aggiuntoDa: string | null,
): Promise<RiepilogoAggiuntaWa> {
  const visti = new Set<string>();
  const validi: DestinatarioWhatsappInput[] = [];

  for (const d of destinatari) {
    const numero = String(d.numero_dest ?? "").trim();
    if (!numero) continue;
    if (visti.has(d.contatto_id)) continue;
    visti.add(d.contatto_id);
    validi.push({ ...d, numero_dest: numero });
  }

  if (validi.length === 0) return { aggiunti: 0, saltati: 0 };

  let aggiunti = 0;
  for (let i = 0; i < validi.length; i += CHUNK_INSERT) {
    const part = validi.slice(i, i + CHUNK_INSERT);
    const { data, error } = await supabase
      .from("messaggi_whatsapp")
      .upsert(
        part.map((d) => ({
          campagna_id: campagnaId,
          contatto_id: d.contatto_id,
          cliente_id: d.cliente_id,
          numero_dest: d.numero_dest,
          nome_riferimento: d.nome_riferimento,
          aggiunto_da: aggiuntoDa,
        })),
        { onConflict: "campagna_id,contatto_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    aggiunti += (data ?? []).length;
  }

  return { aggiunti, saltati: validi.length - aggiunti };
}
