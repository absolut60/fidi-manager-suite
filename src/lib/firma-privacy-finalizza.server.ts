import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generaSchedaCliente } from "./scheda-pdf";
import { buildPrivacyPdfEmailPayload } from "./email-template";
import { estraiIp, estraiUserAgent } from "./request-ip.server";
import { INFORMATIVA_FULL, INFORMATIVA_VERSIONE, calcolaInformativaHash } from "./consensi-testi";

export type DichiaranteInput = {
  nome: string;
  cognome: string;
  societa?: string | undefined;
  luogo_nascita?: string | undefined;
  data_nascita?: string | undefined;
  codice_fiscale?: string | undefined;
  residenza?: string | undefined;
  email: string;
  cellulare?: string | undefined;
};

export type SoggettoIntestazione = {
  ragione_sociale: string;
  partita_iva?: string | null;
  codice_fiscale?: string | null;
};

/**
 * §5 — Logica unica di finalizzazione della raccolta privacy:
 * upload firma + PDF ricco, aggiornamento del contatto (dati dichiarante,
 * 3 consensi, privacy_firmata), riga nel registro consensi e invio della
 * copia PDF al firmatario (non fatale).
 * Usata sia dal link pubblico (`origine: 'link_pubblico'`/'firma_grafica')
 * sia dal canale "Compila di persona" (`origine: 'di_persona'`).
 */
export async function finalizzaRaccoltaPrivacy(opts: {
  contattoId: string;
  contattoNome?: string | null;
  contattoCognome?: string | null;
  soggetto: SoggettoIntestazione;
  dichiarante: DichiaranteInput;
  consensi: { profilazione: boolean; marketing_media: boolean; marketing_diretto: boolean };
  firmaDataUrl: string;
  data_firma?: string | undefined;
  secondi_permanenza?: number | null | undefined;
  origine: "firma_grafica" | "di_persona";
  note: string;
  operatoreId?: string | undefined;
  invalidaToken: boolean;
}): Promise<{ ok: true; pdfUrl: string; pdfPath: string; emailInviata: boolean }> {
  const {
    contattoId, soggetto, dichiarante, consensi, firmaDataUrl,
    origine, note, invalidaToken,
  } = opts;

  const emailDich = dichiarante.email.trim();
  const now = new Date();
  const nomeCompleto =
    [dichiarante.nome, dichiarante.cognome].filter(Boolean).join(" ").trim() ||
    [opts.contattoNome, opts.contattoCognome].filter(Boolean).join(" ").trim() ||
    "Contatto";

  // 1) Upload PNG firma
  const base64 = firmaDataUrl.split(",")[1];
  const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const firmaPath = `contatti/${contattoId}/firma-${now.getTime()}.png`;
  const { error: eFirma } = await supabaseAdmin.storage.from("firme")
    .upload(firmaPath, pngBytes, { upsert: true, contentType: "image/png" });
  if (eFirma) throw new Error(eFirma.message);
  const { data: firmaSigned, error: eSigned } = await supabaseAdmin.storage
    .from("firme")
    .createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
  if (eSigned) {
    await supabaseAdmin.storage.from("firme").remove([firmaPath]);
    throw new Error(eSigned.message);
  }

  // 2) PDF ricco — stesso generatore del wizard cliente
  const ragioneSociale = dichiarante.societa?.trim() || soggetto.ragione_sociale;
  const pdfBytes = await generaSchedaCliente({
    tipo: "aggiornamento",
    ragioneSociale,
    dichiaranteNome: dichiarante.nome,
    dichiaranteCognome: dichiarante.cognome,
    luogoNascita: dichiarante.luogo_nascita || undefined,
    dataNascita: dichiarante.data_nascita || undefined,
    codiceFiscaleDich: dichiarante.codice_fiscale || soggetto.codice_fiscale || undefined,
    partitaIva: soggetto.partita_iva ?? undefined,
    residenza: dichiarante.residenza || undefined,
    emailDich,
    cellulareDich: dichiarante.cellulare || undefined,
    consensoProfilazione: consensi.profilazione ? "si" : "no",
    consensoMarketingMedia: consensi.marketing_media ? "si" : "no",
    consensoMarketingDiretto: consensi.marketing_diretto ? "si" : "no",
    dataFirma: opts.data_firma || now,
    firmaPngDataUrl: firmaDataUrl,
  });
  const pdfPath = `contatti/${contattoId}/privacy-${now.getTime()}.pdf`;
  const { error: ePdf } = await supabaseAdmin.storage.from("documenti-privacy")
    .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
  if (ePdf) {
    await supabaseAdmin.storage.from("firme").remove([firmaPath]);
    throw new Error(ePdf.message);
  }
  const { data: pdfSigned, error: ePdfSigned } = await supabaseAdmin.storage
    .from("documenti-privacy")
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
  if (ePdfSigned) {
    await supabaseAdmin.storage.from("firme").remove([firmaPath]);
    await supabaseAdmin.storage.from("documenti-privacy").remove([pdfPath]);
    throw new Error(ePdfSigned.message);
  }

  // 3) Aggiorna contatto — se fallisce, rimuovi i file orfani
  const { error: eUpd } = await supabaseAdmin.from("contatti").update({
    privacy_firmata: true,
    data_firma: now.toISOString(),
    firma_url: firmaSigned.signedUrl,
    pdf_privacy_url: pdfSigned.signedUrl,
    pdf_privacy_path: pdfPath,
    luogo_nascita: dichiarante.luogo_nascita || null,
    data_nascita: dichiarante.data_nascita || null,
    codice_fiscale: dichiarante.codice_fiscale || null,
    residenza: dichiarante.residenza || null,
    email: emailDich,
    cellulare: dichiarante.cellulare || null,
    consenso_profilazione: consensi.profilazione,
    consenso_marketing_media: consensi.marketing_media,
    consenso_marketing_diretto: consensi.marketing_diretto,
    ...(invalidaToken ? { privacy_token: null, privacy_token_expires_at: null } : {}),
  }).eq("id", contattoId);
  if (eUpd) {
    await supabaseAdmin.storage.from("firme").remove([firmaPath]);
    await supabaseAdmin.storage.from("documenti-privacy").remove([pdfPath]);
    throw new Error(eUpd.message);
  }

  // 3-bis) Registro consensi unificato — non fatale
  try {
    const ip = estraiIp();
    const ua = estraiUserAgent();
    const hash = await calcolaInformativaHash(INFORMATIVA_FULL);
    const { error: eLog } = await supabaseAdmin.rpc("registra_consensi_batch", {
      _contatto_id: contattoId,
      _marketing_diretto: consensi.marketing_diretto,
      _marketing_media: consensi.marketing_media,
      _profilazione: consensi.profilazione,
      _origine: origine,
      _prova_path: pdfPath,
      ...(ip ? { _ip: ip } : {}),
      ...(opts.operatoreId ? { _operatore_id: opts.operatoreId } : {}),
      _informativa_versione: INFORMATIVA_VERSIONE,
      _informativa_hash: hash,
      ...(ua ? { _user_agent: ua } : {}),
      ...(typeof opts.secondi_permanenza === "number" ? { _secondi_permanenza: opts.secondi_permanenza } : {}),
      _note: note,
    });
    if (eLog) console.error("[privacy] registra_consensi_batch fallito:", eLog.message);
  } catch (e) {
    console.error("[privacy] registra_consensi_batch fallito:", e);
  }

  // 4) Invio copia PDF al firmatario — mai fatale
  let emailInviata = false;
  try {
    let binary = "";
    for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
    const payload = buildPrivacyPdfEmailPayload({
      toName: nomeCompleto,
      ragioneSociale,
      dataFirma: now.toISOString(),
      pdfBase64: btoa(binary),
    });
    const { sendEmailViaEdge } = await import("./inngest/send-email.server");
    const esito = await sendEmailViaEdge({ to: emailDich, ...payload });
    emailInviata = esito.ok;
    if (!esito.ok) console.error("[privacy] invio email fallito:", esito.err);
  } catch (e) {
    console.error("[privacy] invio email fallito:", e);
  }

  return { ok: true, pdfUrl: pdfSigned.signedUrl, pdfPath, emailInviata };
}
