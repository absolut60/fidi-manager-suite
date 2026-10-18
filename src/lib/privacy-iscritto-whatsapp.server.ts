import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Fonte unica: PDF privacy di un iscritto dalla pagina pubblica WhatsApp.
 * I consensi sono letti da consensi_log dell'iscritto (ultimo valore per tipo),
 * non dai parametri della richiesta. Presentazione consensi come nell'iscrizione
 * evento (finalizzaRaccoltaPrivacy): WhatsApp separato con dettaglio canali.
 */
export async function generaPdfPrivacyIscritto(opts: {
  iscrittoId: string;
  ip: string | null;
  dataOraRaccolta: Date;
}): Promise<{ pdfBytes: Uint8Array; ragioneSociale: string }> {
  const { data: isc, error: eIsc } = await supabaseAdmin
    .from("iscritti_whatsapp")
    .select("id, cliente_id, lead_id, email, nome, cognome, azienda, numero_norm, numero_raw")
    .eq("id", opts.iscrittoId)
    .maybeSingle();
  if (eIsc) throw new Error(eIsc.message);
  if (!isc) throw new Error(`iscritto ${opts.iscrittoId} non trovato`);

  const { data: righe, error: eLog } = await supabaseAdmin
    .from("consensi_log")
    .select("tipo_consenso, valore, created_at")
    .eq("iscritto_id", opts.iscrittoId)
    .in("tipo_consenso", ["whatsapp", "marketing_diretto", "profilazione"])
    .order("created_at", { ascending: false });
  if (eLog) throw new Error(eLog.message);
  const ultimo = (tipo: string) => righe?.find((r) => r.tipo_consenso === tipo)?.valore === true;
  const whatsapp = ultimo("whatsapp");
  const marketingDiretto = ultimo("marketing_diretto");
  const profilazione = ultimo("profilazione");

  const nomeCognome = [isc.nome, isc.cognome].filter(Boolean).join(" ").trim();
  let ragioneSociale = "";
  let partitaIva: string | undefined;
  let codiceFiscaleDich: string | undefined;
  let residenza: string | undefined;
  if (isc.cliente_id) {
    const { risolviIntestazioneSoggetto } = await import("./intestazione-soggetto.server");
    const soggetto = await risolviIntestazioneSoggetto({ cliente_id: isc.cliente_id });
    ragioneSociale = soggetto.ragione_sociale ?? "";
    partitaIva = soggetto.partita_iva ?? undefined;
    codiceFiscaleDich = soggetto.codice_fiscale ?? undefined;
    residenza = [soggetto.indirizzo, soggetto.citta].filter(Boolean).join(" - ") || undefined;
  } else if (isc.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("lead")
      .select("ragione_sociale, nome, cognome")
      .eq("id", isc.lead_id)
      .maybeSingle();
    ragioneSociale =
      (lead?.ragione_sociale ?? "").trim() ||
      [lead?.nome, lead?.cognome].filter(Boolean).join(" ").trim();
  }
  if (!ragioneSociale) ragioneSociale = (isc.azienda ?? "").trim() || nomeCognome;

  const { generaSchedaCliente } = await import("./scheda-pdf");
  const pdfBytes = await generaSchedaCliente({
    tipo: "aggiornamento",
    ragioneSociale,
    dichiaranteNome: isc.nome ?? "",
    dichiaranteCognome: isc.cognome ?? "",
    ...(partitaIva ? { partitaIva } : {}),
    ...(codiceFiscaleDich ? { codiceFiscaleDich } : {}),
    ...(residenza ? { residenza } : {}),
    cellulareDich: isc.numero_norm ?? isc.numero_raw ?? "",
    emailDich: (isc.email ?? "").trim(),
    consensoProfilazione: profilazione ? "si" : "no",
    // Non stampato (mostraConsensoMedia=false): il QR non raccoglie il consenso "media".
    consensoMarketingMedia: "no",
    consensoMarketingDiretto: whatsapp || marketingDiretto ? "si" : "no",
    consensiCanaliMarketing: { whatsapp, email: marketingDiretto },
    mostraConsensoMedia: false,
    dataFirma: opts.dataOraRaccolta,
    ...(opts.ip ? { ipRaccolta: opts.ip } : {}),
    dataOraRaccolta: opts.dataOraRaccolta.toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
  });

  return { pdfBytes, ragioneSociale };
}

/**
 * Allega al contatto il PDF privacy dell'iscritto dopo la riconciliazione.
 * Idempotente; regola FM37 (non sostituisce documenti presenti o firmati).
 * Data/IP della raccolta originale (prima riga consensi_log 'whatsapp').
 * Non tocca consensi_log.prova_path e non invia email.
 */
export async function allegaPrivacyIscrittoAContatto(
  iscrittoId: string,
): Promise<{ allegato: boolean; motivo?: string }> {
  const { data: isc, error: eIsc } = await supabaseAdmin
    .from("iscritti_whatsapp")
    .select("id, contatto_id, cliente_id")
    .eq("id", iscrittoId)
    .maybeSingle();
  if (eIsc) throw new Error(eIsc.message);
  if (!isc) return { allegato: false, motivo: "iscritto_non_trovato" };
  const contattoId = isc.contatto_id;
  if (!contattoId) return { allegato: false, motivo: "senza_contatto" };

  const { data: cont, error: eCont } = await supabaseAdmin
    .from("contatti")
    .select("pdf_privacy_path, privacy_firmata")
    .eq("id", contattoId)
    .maybeSingle();
  if (eCont) throw new Error(eCont.message);
  if (!cont) return { allegato: false, motivo: "contatto_non_trovato" };
  if (cont.pdf_privacy_path || cont.privacy_firmata === true) {
    return { allegato: false, motivo: "documento_esistente" };
  }

  const { data: orig, error: eOrig } = await supabaseAdmin
    .from("consensi_log")
    .select("created_at, ip_address")
    .eq("iscritto_id", iscrittoId)
    .eq("tipo_consenso", "whatsapp")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eOrig) throw new Error(eOrig.message);
  if (!orig) return { allegato: false, motivo: "raccolta_non_trovata" };

  const { pdfBytes } = await generaPdfPrivacyIscritto({
    iscrittoId,
    ip: orig.ip_address ? String(orig.ip_address) : null,
    dataOraRaccolta: new Date(orig.created_at),
  });

  const pdfPath = `contatti/${contattoId}/privacy-qr-${Date.now()}.pdf`;
  const { error: ePdf } = await supabaseAdmin.storage
    .from("documenti-privacy")
    .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
  if (ePdf) throw new Error(ePdf.message);

  const { data: signed, error: eSigned } = await supabaseAdmin.storage
    .from("documenti-privacy")
    .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
  if (eSigned) throw new Error(eSigned.message);

  const { error: eUpd } = await supabaseAdmin
    .from("contatti")
    .update({ pdf_privacy_url: signed.signedUrl, pdf_privacy_path: pdfPath })
    .eq("id", contattoId);
  if (eUpd) throw new Error(eUpd.message);

  return { allegato: true };
}
