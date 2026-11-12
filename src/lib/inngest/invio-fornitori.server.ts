// FM62 G5: job unico dell'invio email a più fornitori. Evento
// `fornitori/invio-multiplo.requested` { invio_id } da avviaInvioFornitori.
// Una email separata per fornitore (indirizzo = fornitori.email, già nella riga),
// blocchi con pausa come il massivo solleciti, concurrency 1. Anti-doppione:
// si spediscono solo le righe ancora "in_invio" (righeDaSpedire); a fine job
// UNA sola notifica all'operatore.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import { wrapEmailHtml, SEDE_FALLBACK } from "@/lib/template-email-render";
import { messaggioErroreInvio } from "@/lib/comunicazioni-fornitore";
import { applicaSegnapostoFornitore, applicaSegnapostoTesto, righeDaSpedire, statoFinaleInvio, messaggioFineInvio } from "@/lib/invio-multiplo-fornitori";

const BLOCCO = 10;
const PAUSA = "30s";

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function aggiornaConteggi(invioId: string) {
  const conta = async (stato: string) => {
    const { count, error } = await supabaseAdmin.from("attivita_fornitore").select("id", { count: "exact", head: true }).eq("invio_id", invioId).eq("stato", stato);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const inviati = await conta("inviata");
  const errori = await conta("errore");
  await supabaseAdmin.from("invii_fornitori").update({ inviati, errori, updated_at: new Date().toISOString() }).eq("id", invioId);
  return { inviati, errori };
}

export const invioMultiploFornitori = inngest.createFunction(
  {
    id: "fornitori-invio-multiplo",
    name: "Fornitori: invio email a più fornitori",
    retries: 2,
    concurrency: { limit: 1 },
    timeouts: { finish: "2h" },
    triggers: [{ event: "fornitori/invio-multiplo.requested" }],
    onFailure: async ({ event: e, error }) => {
      const id = (e.data as { event?: { data?: { invio_id?: string } } })?.event?.data?.invio_id;
      if (!id) return;
      await supabaseAdmin.from("attivita_fornitore").update({ stato: "errore", errore: `Invio interrotto: ${error?.message ?? "errore"}` }).eq("invio_id", id).eq("stato", "in_invio");
      await aggiornaConteggi(id);
      await supabaseAdmin.from("invii_fornitori").update({ stato: "con_errori", completato_il: new Date().toISOString() }).eq("id", id).eq("stato", "in_corso");
    },
  },
  async ({ event, step }) => {
    const invioId = (event.data as { invio_id?: string }).invio_id;
    if (!invioId) return { ok: false, motivo: "senza_id" };

    const prep = await step.run("prepara", async () => {
      const { data: inv, error } = await supabaseAdmin.from("invii_fornitori").select("id, oggetto, corpo_html, allegati, creato_da, stato").eq("id", invioId).maybeSingle();
      if (error || !inv) throw new Error(`Invio non trovato: ${error?.message ?? invioId}`);
      const { data: prof } = inv.creato_da
        ? await supabaseAdmin.from("profili").select("nome, cognome, email").eq("id", inv.creato_da).maybeSingle()
        : { data: null };
      const { data: righe } = await supabaseAdmin.from("attivita_fornitore").select("id").eq("invio_id", invioId).eq("stato", "in_invio").order("created_at");
      return {
        stato: inv.stato, oggetto: inv.oggetto, html: inv.corpo_html, creatoDa: inv.creato_da as string | null,
        allegati: (inv.allegati ?? []) as { nome: string; path: string; mime: string }[],
        nome: `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "Operatore", email: prof?.email ?? null,
        ids: (righe ?? []).map(r => r.id),
      };
    });
    if (prep.stato !== "in_corso") return { ok: true, giaConcluso: true };

    const blocchi = Math.ceil(prep.ids.length / BLOCCO);
    for (let b = 0; b < blocchi; b++) {
      if (b > 0) await step.sleep(`pausa-${b}`, PAUSA);
      await step.run(`blocco-${b}`, async () => {
        const slice = prep.ids.slice(b * BLOCCO, (b + 1) * BLOCCO);
        const { data: righe, error } = await supabaseAdmin.from("attivita_fornitore")
          .select("id, stato, destinatari, fornitore_id, fornitori(ragione_sociale, nome)").in("id", slice);
        if (error) throw new Error(error.message);
        const daSpedire = righeDaSpedire(righe ?? []);
        if (!daSpedire.length) return { spedite: 0 };
        const attachments: { filename: string; content: string; contentType: string }[] = [];
        for (const a of prep.allegati) {
          const { data: blob, error: eDl } = await supabaseAdmin.storage.from("allegati").download(a.path);
          if (eDl || !blob) throw new Error(`Allegato "${a.nome}" non disponibile: ${eDl?.message ?? "assente"}`);
          attachments.push({ filename: a.nome, content: bytesToB64(new Uint8Array(await blob.arrayBuffer())), contentType: a.mime });
        }
        for (const r of daSpedire) {
          const f = (r as unknown as { fornitori: { ragione_sociale: string | null; nome: string | null } | null }).fornitori;
          const rag = f?.ragione_sociale || f?.nome || null;
          const to = (r.destinatari ?? [])[0];
          let esito: { ok: boolean; messageId?: string | null; err?: string | null };
          if (!to) esito = { ok: false, err: "Indirizzo email mancante" };
          else {
            const html = wrapEmailHtml(applicaSegnapostoFornitore(prep.html, rag), SEDE_FALLBACK, { nome: prep.nome, email: prep.email }, {
              senzaBande: true, piedeRiservatezza: true, destinatarioPiede: "fornitore", sottotitolo: "MADE Distribuzione", useCid: true,
            });
            try {
              esito = await sendEmailViaEdge({ to, subject: applicaSegnapostoTesto(prep.oggetto, rag), html, fromName: "MADE Distribuzione",
                replyTo: prep.email ?? undefined, inlineLogo: true, attachments });
            } catch (e) { esito = { ok: false, err: e instanceof Error ? e.message : String(e) }; }
          }
          await supabaseAdmin.from("attivita_fornitore").update(esito.ok
            ? { stato: "inviata", message_id: esito.messageId ?? null, errore: null, data_attivita: new Date().toISOString() }
            : { stato: "errore", errore: messaggioErroreInvio(esito.err) }).eq("id", r.id).eq("stato", "in_invio");
        }
        await aggiornaConteggi(invioId);
        return { spedite: daSpedire.length };
      });
    }

    return await step.run("chiudi", async () => {
      const c = await aggiornaConteggi(invioId);
      const { data: inv } = await supabaseAdmin.from("invii_fornitori").select("totale, saltati").eq("id", invioId).single();
      const stato = statoFinaleInvio({ totale: inv?.totale ?? 0, ...c });
      // Solo chi chiude la riga manda la notifica: mai due notifiche per lo stesso invio.
      const { data: chiuse } = await supabaseAdmin.from("invii_fornitori")
        .update({ stato: stato === "in_corso" ? "con_errori" : stato, completato_il: new Date().toISOString() })
        .eq("id", invioId).eq("stato", "in_corso").select("id");
      if (chiuse?.length && prep.creatoDa) {
        const m = messaggioFineInvio({ ...c, saltati: inv?.saltati ?? 0 }, prep.oggetto);
        await supabaseAdmin.from("notifiche").insert({
          user_id: prep.creatoDa, tipo: "invio_fornitori", titolo: m.titolo, messaggio: m.messaggio,
          link: "/fornitori", metadata: { invio_id: invioId },
        } as never);
      }
      return { ok: true, ...c };
    });
  },
);
