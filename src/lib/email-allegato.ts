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
  nascosti?: number;
};

function indirizzo(nome?: string, email?: string) {
  return nome && email && nome !== email ? `${nome} <${email}>` : email || nome || "";
}

type ProprietaMsg = { tipo: number; o: number; dv: DataView };
const pubblico = (v?: string) => v && !/^\/O=/i.test(v.trim()) ? v.trim() : undefined;

async function leggiMsg(arrayBuffer: ArrayBuffer): Promise<EmailAllegato> {
  const CFB = await import("cfb");
  const cfb = CFB.read(new Uint8Array(arrayBuffer), { type: "array" });
  const root = "Root Entry/";
  const dec16 = new TextDecoder("utf-16le");
  function testo(u8: Uint8Array | undefined, unicode: boolean, cp?: number) {
    if (!u8) return undefined;
    const s = unicode ? dec16.decode(u8) : new TextDecoder(cp === 65001 ? "utf-8" : "windows-1252").decode(u8);
    return s.replace(/\u0000+$/g, "");
  }
  function trova(cartella: string, tag: string) {
    for (const tipo of ["001F", "001E", "0102"]) {
      const e = CFB.find(cfb, `${cartella}__substg1.0_${tag}${tipo}`);
      if (e?.content) return { tipo, dati: Uint8Array.from(e.content) };
    }
    return null;
  }
  function str(cartella: string, tag: string, cp?: number) {
    const v = trova(cartella, tag);
    if (!v || v.tipo === "0102") return undefined;
    return testo(v.dati, v.tipo === "001F", cp);
  }
  function bin(cartella: string, tag: string) {
    const v = trova(cartella, tag);
    return v?.tipo === "0102" ? v.dati : undefined;
  }
  function props(cartella: string, header: number) {
    const e = CFB.find(cfb, `${cartella}__properties_version1.0`);
    const m = new Map<number, ProprietaMsg>();
    if (!e?.content) return m;
    const u = Uint8Array.from(e.content);
    const dv = new DataView(u.buffer);
    for (let o = header; o + 16 <= u.length; o += 16) {
      const tipo = dv.getUint16(o, true), id = dv.getUint16(o + 2, true);
      m.set(id, { tipo, o: o + 8, dv });
    }
    return m;
  }
  function dataFiletime(p?: ProprietaMsg) {
    if (!p || p.tipo !== 0x0040) return null;
    const lo = p.dv.getUint32(p.o, true), hi = p.dv.getUint32(p.o + 4, true);
    const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000;
    return new Date(ms).toISOString();
  }
  const p = props(root, 32);
  const cpProp = p.get(0x3FDE);
  const cp = cpProp?.tipo === 0x0003 ? cpProp.dv.getUint32(cpProp.o, true) : undefined;
  const mittenteNome = str(root, "0C1A", cp);
  const mittenteEmail = pubblico(str(root, "5D01", cp)) || pubblico(str(root, "0C1F", cp)) || (() => {
    const m = str(root, "3FFA", cp);
    return m?.includes("@") ? pubblico(m) : undefined;
  })();
  const htmlBin = bin(root, "1013"), htmlStr = str(root, "1013", cp);
  const dest: EmailAllegato["destinatari"] = { a: [], cc: [] };
  const allegati: AllegatoEmail[] = [];
  let nascosti = 0;
  for (let i = 0; i < 2048; i++) {
    const c = `${root}__recip_version1.0_#${i.toString(16).toUpperCase().padStart(8, "0")}/`;
    if (!CFB.find(cfb, c)) break;
    const rp = props(c, 8), t = rp.get(0x0C15);
    const tipo = t ? t.dv.getUint32(t.o, true) : 1;
    const nome = str(c, "3001", cp);
    const em = pubblico(str(c, "39FE", cp)) || pubblico(str(c, "3003", cp));
    (tipo === 2 ? dest.cc : tipo === 1 ? dest.a : []).push(indirizzo(nome, em));
  }
  for (let i = 0; i < 2048; i++) {
    const c = `${root}__attach_version1.0_#${i.toString(16).toUpperCase().padStart(8, "0")}/`;
    if (!CFB.find(cfb, c)) break;
    const ap = props(c, 8), h = ap.get(0x7FFE);
    const nascosto = h?.tipo === 0x000B && h.dv.getUint16(h.o, true) !== 0;
    const dati = bin(c, "3701");
    if (!dati) continue;
    if (nascosto) { nascosti++; continue; }
    allegati.push({
      nome: str(c, "3707", cp) || str(c, "3704", cp) || str(c, "3001", cp) || "Allegato",
      mime: str(c, "370E", cp) || "application/octet-stream", byte: dati,
    });
  }
  return {
    oggetto: str(root, "0037", cp) || "(Senza oggetto)",
    mittente: indirizzo(mittenteNome, mittenteEmail), destinatari: dest,
    data: dataFiletime(p.get(0x0039)) || dataFiletime(p.get(0x0E06)),
    corpoHtml: htmlStr || (htmlBin ? new TextDecoder(cp === 1252 ? "windows-1252" : "utf-8").decode(htmlBin) : undefined),
    corpoTesto: str(root, "1000", cp), allegati, nascosti,
  };
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
  return leggiMsg(dati);
}