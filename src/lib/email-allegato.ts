/** Lettore unico degli allegati email; le librerie si caricano solo alla lettura. */
export type AllegatoEmail = { nome: string; mime: string; byte: Uint8Array };
export type EmailAllegato = {
  oggetto: string;
  mittente: string;
  destinatari: { a: string[]; cc: string[] };
  data: string | null;
  corpoHtml?: string;
  corpoTesto?: string;
  allegati: AllegatoEmail[];
};

function indirizzo(nome?: string, email?: string) {
  return nome && email && nome !== email ? `${nome} <${email}>` : email || nome || "";
}

function indirizzoOutlook(nome?: string, smtp?: string, email?: string, modificatore?: string) {
  const pubblico = (valore?: string) => valore && !/^\/O=/i.test(valore.trim()) ? valore : undefined;
  const fallback = email && /^\/O=/i.test(email.trim()) && modificatore?.includes("@")
    ? pubblico(modificatore) : undefined;
  return indirizzo(nome, pubblico(smtp) || pubblico(email) || fallback);
}

export async function leggiEmailAllegato(dati: ArrayBuffer, nome: string, mime = ""): Promise<EmailAllegato> {
  if (/\.eml$/i.test(nome) || mime.toLowerCase() === "message/rfc822") {
    const { default: PostalMime } = await import("postal-mime");
    const email = await PostalMime.parse(dati);
    if (!email.subject && !email.from && !email.text && !email.html) throw new Error("Email non valida");
    const formatta = (valori: import("postal-mime").Address[] = []): string[] => valori.flatMap((v) =>
      v.group ? v.group.map((m) => indirizzo(m.name, m.address)) : [indirizzo(v.name, v.address)]);
    return {
      oggetto: email.subject || "(Senza oggetto)",
      mittente: formatta(email.from ? [email.from] : []).join(", "),
      destinatari: { a: formatta(email.to), cc: formatta(email.cc) },
      data: email.date || null, corpoHtml: email.html, corpoTesto: email.text,
      allegati: email.attachments.map((a) => {
        if (typeof a.content === "string") throw new Error("Contenuto allegato non binario");
        return { nome: a.filename || "Allegato", mime: a.mimeType, byte: new Uint8Array(a.content) };
      }),
    };
  }
  const modulo = await import("@kenjiuno/msgreader");
  // Compatibilità CJS (Bun) ed ESM (Vite), senza import browser al caricamento della pagina.
  const esportato = modulo.default;
  const MsgReader = typeof esportato === "function" ? esportato : (esportato as unknown as { default: typeof modulo.default }).default;
  const lettore = new MsgReader(dati);
  const email = lettore.getFileData();
  if (email.error || email.dataType !== "msg") throw new Error(email.error || "Email non valida");
  const destinatari = (tipo: "to" | "cc") => (email.recipients || [])
    .filter((r) => r.recipType === tipo).map((r) => indirizzoOutlook(r.name, r.smtpAddress, r.email));
  return {
    oggetto: email.subject || "(Senza oggetto)",
    mittente: indirizzoOutlook(email.senderName, email.senderSmtpAddress, email.senderEmail, email.lastModifierName),
    destinatari: { a: destinatari("to"), cc: destinatari("cc") },
    data: email.clientSubmitTime || email.messageDeliveryTime || null,
    corpoHtml: email.bodyHtml || (email.html ? new TextDecoder(email.internetCodepage === 1252 ? "windows-1252" : "utf-8").decode(email.html) : undefined), corpoTesto: email.body,
    allegati: (email.attachments || []).filter((a) => a.attachmentHidden !== true).map((a) => {
      const contenuto = lettore.getAttachment(a);
      return { nome: contenuto.fileName || "Allegato", mime: a.attachMimeTag || "application/octet-stream", byte: new Uint8Array(contenuto.content) };
    }),
  };
}