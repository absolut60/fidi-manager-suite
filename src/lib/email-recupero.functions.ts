// Punto UNICO di invio di una singola email di recupero al cliente (FM48).
// Modalità "modello" (template_email) o "libera" (oggetto/corpo scritti a mano),
// con copia (CC), copia nascosta (CCN), allegati PDF e lettera PDF opzionale.
// Guardia: assertPuoInviareRecupero (gemello SQL auth_puo_inviare_recupero()).
// Tutte le letture/scritture usano il client dell'utente (RLS applicata).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoInviareRecupero } from "@/lib/recupero-permessi.server";
import { costruisciLetteraPdf } from "@/lib/lettera-pdf.server";
import { sendEmailViaEdge } from "@/lib/inngest/send-email.server";
import { isEmailValida } from "@/lib/email-validazione";
import { classificaScadenza } from "@/lib/scadenze";
import {
  formatDateIt,
  livelloSollecitoFromTipo,
  renderTemplate,
  wrapEmailHtml,
  type DatiSede,
  type ScadenzaSollecito,
} from "@/lib/template-email-render";
import type { StadioSollecito } from "@/lib/escalation-solleciti";

const MAX_INDIRIZZI = 10;
const MAX_ALLEGATI_BYTES = 10 * 1024 * 1024;

const inputSchema = z
  .object({
    clienteId: z.string().uuid(),
    azioneEsistenteId: z.string().uuid().nullable(),
    modalita: z.enum(["modello", "libera"]),
    templateId: z.string().uuid().nullable(),
    oggetto: z.string().nullable().optional(),
    corpo: z.string().nullable().optional(),
    scadenzaIds: z.array(z.string().uuid()),
    to: z.string(),
    cc: z.array(z.string()),
    bcc: z.array(z.string()),
    allegatiEsistentiIds: z.array(z.string().uuid()),
    nuoviAllegati: z.array(
      z.object({ filename: z.string().min(1), contentType: z.string(), base64: z.string() }),
    ),
    lettera: z
      .object({
        templateLetteraId: z.string().uuid().nullable(),
        oggetto: z.string(),
        corpo: z.string(),
      })
      .nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.modalita === "modello" && !d.templateId) {
      ctx.addIssue({ code: "custom", message: "Scegli un modello email." });
    }
    if (d.modalita === "libera" && (!d.oggetto?.trim() || !d.corpo?.trim())) {
      ctx.addIssue({ code: "custom", message: "Nell'email libera oggetto e testo sono obbligatori." });
    }
    if (d.lettera && !d.lettera.templateLetteraId && !d.lettera.corpo.trim()) {
      ctx.addIssue({ code: "custom", message: "Nella lettera libera il testo è obbligatorio." });
    }
    const tutti = [d.to, ...d.cc, ...d.bcc].map((e) => e.trim());
    for (const e of tutti) {
      if (!isEmailValida(e)) ctx.addIssue({ code: "custom", message: `Indirizzo email non valido: ${e || "(vuoto)"}` });
    }
    if (tutti.length > MAX_INDIRIZZI) {
      ctx.addIssue({ code: "custom", message: `Massimo ${MAX_INDIRIZZI} indirizzi in totale tra destinatario, copia e copia nascosta.` });
    }
    const visti = new Set<string>();
    for (const e of tutti.map((x) => x.toLowerCase())) {
      if (visti.has(e)) ctx.addIssue({ code: "custom", message: `Indirizzo ripetuto: ${e}` });
      visti.add(e);
    }
  });

export type InviaEmailRecuperoInput = z.infer<typeof inputSchema>;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

function sanitizeName(s: string): string {
  return s.replace(/[^\w.\-]+/g, "_").slice(0, 100);
}

type FileInvio = { filename: string; bytes: Uint8Array; origine: "nuovo" | "esistente" | "lettera" };

export const inviaEmailRecupero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = inputSchema.safeParse(data);
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPuoInviareRecupero(supabase);

    const to = data.to.trim();
    const cc = data.cc.map((e) => e.trim());
    const bcc = data.bcc.map((e) => e.trim());

    // Azione esistente: verificata PRIMA dell'invio
    if (data.azioneEsistenteId) {
      const { data: az, error } = await supabase
        .from("azioni_recupero")
        .select("id, cliente_id, tipo, esito")
        .eq("id", data.azioneEsistenteId)
        .maybeSingle();
      if (error) throw new Error(`Lettura azione fallita: ${error.message}`);
      if (!az || az.cliente_id !== data.clienteId || az.tipo !== "email" || az.esito !== "da_fare") {
        throw new Error("L'azione da completare non è un'email da fare di questo cliente.");
      }
    }

    // Cliente + sede
    const { data: cliente, error: eCli } = await supabase
      .from("clienti")
      .select("id, ragione_sociale, store_id")
      .eq("id", data.clienteId)
      .maybeSingle();
    if (eCli) throw new Error(`Lettura cliente fallita: ${eCli.message}`);
    if (!cliente) throw new Error("Cliente non trovato");

    let sede: DatiSede | null = null;
    if (cliente.store_id) {
      const { data: store } = await supabase
        .from("stores")
        .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
        .eq("id", cliente.store_id)
        .maybeSingle();
      if (store) {
        sede = {
          nome: store.nome ?? null,
          insegna: (store as { insegna?: string | null }).insegna ?? null,
          indirizzo: store.indirizzo ?? null,
          cap: store.cap ?? null,
          citta: store.citta ?? null,
          provincia: store.provincia ?? null,
          telefono: store.telefono ?? null,
        };
      }
    }

    // Operatore
    const { data: prof } = await supabase
      .from("profili")
      .select("nome, cognome, email")
      .eq("id", userId)
      .maybeSingle();
    const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "Operatore";
    const claimEmail = (context.claims as { email?: string } | undefined)?.email ?? null;
    const emailOperatore = prof?.email?.trim() || claimEmail || null;

    // Spese insoluto RiBa (configurazioni)
    const { data: cfgRow } = await supabase
      .from("configurazioni")
      .select("valore")
      .eq("chiave", "spese_insoluto_riba_eur")
      .maybeSingle();
    const parsedSpese = parseFloat(String(cfgRow?.valore ?? ""));
    const speseUnit = Number.isFinite(parsedSpese) && parsedSpese >= 0 ? parsedSpese : 3;

    // Scadenze: solo quelle ricevute, del cliente e scadute
    const richieste = new Set(data.scadenzaIds);
    let scadenzeScelte: (ScadenzaSollecito & { id: string })[] = [];
    if (richieste.size) {
      const { data: rawScad, error: eSc } = await supabase
        .from("scadenze")
        .select("id, numero_documento, data_documento, data_scadenza, importo_scadenza, codice_pagamento, stato_contabile, giorni_ritardo, tempi_scadenza, data_pagamento_effettiva")
        .eq("cliente_id", data.clienteId)
        .order("data_scadenza", { ascending: true });
      if (eSc) throw new Error(`Lettura scadenze fallita: ${eSc.message}`);
      scadenzeScelte = (rawScad ?? [])
        .filter((s) => richieste.has(s.id) && classificaScadenza(s) === "scaduto")
        .map((s) => ({
          id: s.id,
          numero_documento: s.numero_documento,
          data_documento: s.data_documento,
          data_scadenza: s.data_scadenza,
          importo_scadenza: s.importo_scadenza,
          codice_pagamento: s.codice_pagamento,
        }));
    }
    const importoRiferimento = scadenzeScelte.reduce((a, s) => a + Number(s.importo_scadenza ?? 0), 0);

    // Testo sorgente
    let sorgente: { oggetto: string; corpo: string };
    let tipoTemplate: string | null = null;
    let nomeTemplate: string | null = null;
    if (data.modalita === "modello") {
      const { data: tpl, error: eTpl } = await supabase
        .from("template_email")
        .select("id, nome, oggetto, corpo, tipo")
        .eq("id", data.templateId!)
        .maybeSingle();
      if (eTpl) throw new Error(`Lettura modello fallita: ${eTpl.message}`);
      if (!tpl) throw new Error("Modello email non trovato");
      sorgente = { oggetto: tpl.oggetto ?? "", corpo: tpl.corpo ?? "" };
      tipoTemplate = tpl.tipo ?? null;
      nomeTemplate = tpl.nome;
    } else {
      const corpo = data.corpo ?? "";
      const sembraHtml = /<[a-z][\s\S]*>/i.test(corpo);
      sorgente = { oggetto: data.oggetto ?? "", corpo: sembraHtml ? corpo : corpo.replace(/\n/g, "<br/>") };
    }

    // Sollecito (livello 1-3): deve essere collegato ad almeno una fattura scaduta
    // per contare nella scala (stesso vincolo della finestra).
    const livelloInviato = data.modalita === "modello" ? livelloSollecitoFromTipo(tipoTemplate) : null;
    if (livelloInviato && scadenzeScelte.length === 0) {
      throw new Error("Seleziona almeno una fattura scaduta: il sollecito deve essere collegato alle fatture per contare nella scala.");
    }

    // Stadio PRIMA dell'invio (fonte unica get_stadio_sollecito_clienti, RLS utente).
    let stadioPrima: StadioSollecito | null = null;
    if (livelloInviato === 3) {
      const { data: st, error: eSt } = await supabase.rpc("get_stadio_sollecito_clienti", {
        _cliente_ids: [data.clienteId],
      });
      if (eSt) throw new Error(`Lettura livello sollecito fallita: ${eSt.message}`);
      stadioPrima = ((st ?? []) as unknown as StadioSollecito[])[0] ?? null;
    }

    const datiTemplate = {
      ragione_sociale: cliente.ragione_sociale ?? "",
      nome_operatore: nomeOperatore,
      scadenze: scadenzeScelte.map(({ id: _id, ...s }) => s),
    };
    const base = renderTemplate(
      sorgente,
      datiTemplate,
      data.modalita === "modello"
        ? { tipo: tipoTemplate, speseImportoUnitario: speseUnit }
        : { speseImportoUnitario: speseUnit },
    );
    const mittente = { nome: nomeOperatore, email: emailOperatore };
    const wrapOpts = data.modalita === "modello" ? { tipo: tipoTemplate } : { senzaBande: true };
    const htmlInvio = wrapEmailHtml(base.corpo, sede, mittente, { ...wrapOpts, useCid: true });
    const htmlSalvato = wrapEmailHtml(base.corpo, sede, mittente, wrapOpts);

    // Allegati
    const files: FileInvio[] = [];
    for (const a of data.nuoviAllegati) {
      if (a.contentType !== "application/pdf") throw new Error(`Sono ammessi solo file PDF: "${a.filename}" non lo è.`);
      let bytes: Uint8Array;
      try {
        bytes = b64ToBytes(a.base64);
      } catch {
        throw new Error(`Il file "${a.filename}" non è leggibile.`);
      }
      if (!isPdfBytes(bytes)) throw new Error(`Il file "${a.filename}" non è un PDF valido.`);
      files.push({ filename: a.filename, bytes, origine: "nuovo" });
    }

    if (data.allegatiEsistentiIds.length) {
      const { data: righe, error: eAll } = await supabase
        .from("allegati")
        .select("id, nome_file, storage_path, mime_type, cliente_id")
        .in("id", data.allegatiEsistentiIds)
        .eq("cliente_id", data.clienteId);
      if (eAll) throw new Error(`Lettura allegati fallita: ${eAll.message}`);
      const trovati = new Map((righe ?? []).map((r) => [r.id, r]));
      for (const id of data.allegatiEsistentiIds) {
        const r = trovati.get(id);
        if (!r) throw new Error("Uno degli allegati scelti non esiste o non appartiene al cliente.");
        if (r.mime_type !== "application/pdf") throw new Error(`Sono ammessi solo file PDF: "${r.nome_file}" non lo è.`);
        const { data: blob, error: eDl } = await supabase.storage.from("allegati").download(r.storage_path);
        if (eDl || !blob) throw new Error(`Download di "${r.nome_file}" fallito: ${eDl?.message ?? "file assente"}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!isPdfBytes(bytes)) throw new Error(`Il file "${r.nome_file}" non è un PDF valido.`);
        files.push({ filename: r.nome_file, bytes, origine: "esistente" });
      }
    }

    if (data.lettera) {
      const lettera = await costruisciLetteraPdf(supabase, userId, {
        templateId: data.lettera.templateLetteraId,
        clienteId: data.clienteId,
        oggettoOverride: data.lettera.oggetto,
        corpoOverride: data.lettera.corpo,
      });
      files.push({ filename: lettera.fileName, bytes: lettera.pdfBytes, origine: "lettera" });
    }

    const totaleBytes = files.reduce((a, f) => a + f.bytes.byteLength, 0);
    if (totaleBytes > MAX_ALLEGATI_BYTES) {
      const mb = (totaleBytes / (1024 * 1024)).toFixed(1).replace(".", ",");
      throw new Error(`Gli allegati superano il limite di 10 MB (totale ${mb} MB). Togline qualcuno e riprova.`);
    }

    // Invio: in caso di errore nessuna scrittura
    const esito = await sendEmailViaEdge({
      to,
      cc,
      bcc,
      subject: base.oggetto,
      html: htmlInvio,
      fromName: "Recupero Crediti MADE",
      replyTo: emailOperatore ?? undefined,
      inlineLogo: true,
      attachments: files.map((f) => ({
        filename: f.filename,
        content: bytesToB64(f.bytes),
        contentType: "application/pdf",
      })),
    });
    if (!esito.ok) throw new Error(`Invio fallito: ${esito.err ?? "errore sconosciuto"}`);

    // a) Azione
    const nAll = files.length;
    const noteBase = data.modalita === "modello"
      ? `Inviato modello "${nomeTemplate}" a ${to}`
      : `Email libera inviata a ${to}`;
    const valori = {
      tipo: "email",
      esito: "fatto",
      data_azione: new Date().toISOString(),
      operatore_id: userId,
      livello_sollecito: data.modalita === "modello" ? livelloSollecitoFromTipo(tipoTemplate) : null,
      email_oggetto: base.oggetto,
      email_corpo_html: htmlSalvato,
      email_destinatario: to,
      email_cc: cc.length ? cc.join(", ") : null,
      email_bcc: bcc.length ? bcc.join(", ") : null,
      email_message_id: esito.messageId ?? null,
      importo_riferimento: importoRiferimento,
      note: nAll ? `${noteBase} · ${nAll} allegati` : noteBase,
    } as const;

    const avvisi: string[] = [];
    let azioneId: string;
    if (data.azioneEsistenteId) {
      const { error } = await supabase.from("azioni_recupero").update(valori).eq("id", data.azioneEsistenteId);
      if (error) throw new Error(`Email inviata, ma aggiornamento dell'azione fallito: ${error.message}`);
      azioneId = data.azioneEsistenteId;
    } else {
      const { data: ins, error } = await supabase
        .from("azioni_recupero")
        .insert({ ...valori, cliente_id: data.clienteId })
        .select("id")
        .single();
      if (error || !ins) throw new Error(`Email inviata, ma registrazione dell'azione fallita: ${error?.message ?? "errore"}`);
      azioneId = ins.id;
    }

    // b) Scadenze collegate (salta le già collegate)
    if (scadenzeScelte.length) {
      const { data: gia, error: eGia } = await supabase
        .from("azioni_recupero_scadenze")
        .select("scadenza_id")
        .eq("azione_id", azioneId);
      if (eGia) {
        avvisi.push(`Scadenze non collegate: ${eGia.message}`);
      } else {
        const giaSet = new Set((gia ?? []).map((r) => r.scadenza_id));
        const rows = scadenzeScelte
          .filter((s) => !giaSet.has(s.id))
          .map((s) => ({ azione_id: azioneId, scadenza_id: s.id }));
        if (rows.length) {
          const { error: e2 } = await supabase.from("azioni_recupero_scadenze").insert(rows);
          if (e2) avvisi.push(`Scadenze non collegate: ${e2.message}`);
        }
      }
    }

    // c) Copia dei file inviati come allegati dell'azione
    const descrizione = `Inviato via email il ${formatDateIt(new Date())}`;
    for (const f of files) {
      const storagePath = `azione_recupero/${azioneId}/${crypto.randomUUID()}-${sanitizeName(f.filename)}`;
      const { error: eUp } = await supabase.storage
        .from("allegati")
        .upload(storagePath, f.bytes, { contentType: "application/pdf", upsert: false });
      if (eUp) {
        avvisi.push(`"${f.filename}" non salvato tra gli allegati: ${eUp.message}`);
        continue;
      }
      const { error: eIns } = await supabase.from("allegati").insert({
        entita_tipo: "azione_recupero",
        entita_id: azioneId,
        cliente_id: data.clienteId,
        nome_file: f.filename,
        storage_path: storagePath,
        mime_type: "application/pdf",
        dimensione_bytes: f.bytes.byteLength,
        descrizione,
        caricato_da: userId,
      });
      if (eIns) {
        await supabase.storage.from("allegati").remove([storagePath]);
        avvisi.push(`"${f.filename}" non salvato tra gli allegati: ${eIns.message}`);
      }
    }

    // d) Messa in mora ripetuta → proposta di passaggio al legale (FM51).
    // Un errore qui non annulla l'invio: finisce negli avvisi.
    let propostaLegaleCreata = false;
    if (livelloInviato === 3 && stadioPrima?.stadio === 3) {
      try {
        const { data: ingId, error: eP } = await supabase.rpc("registra_proposta_legale_mora", {
          _cliente_id: data.clienteId,
          _azione_sollecito_id: azioneId,
        });
        if (eP) throw new Error(eP.message);
        if (ingId) {
          propostaLegaleCreata = true;
          const { notificaProposteLegale } = await import("@/lib/inngest/proposte-legale.server");
          try {
            await notificaProposteLegale(
              [{
                id: String(ingId),
                ragione_sociale: cliente.ragione_sociale ?? "Cliente",
                negozio: sede?.nome ?? null,
                totale: Number(stadioPrima.totale_scaduto ?? 0),
              }],
              { azione_id: azioneId, cliente_id: data.clienteId },
            );
          } catch (eN) {
            avvisi.push(`Cliente proposto per il legale, ma notifica non inviata: ${eN instanceof Error ? eN.message : String(eN)}`);
          }
        }
      } catch (eProp) {
        avvisi.push(`Proposta di passaggio al legale non registrata: ${eProp instanceof Error ? eProp.message : String(eProp)}`);
      }
    }

    return { ok: true as const, azioneId, messageId: esito.messageId ?? null, avvisi, propostaLegaleCreata };
  });
