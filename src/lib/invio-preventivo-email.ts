// Punto d'ingresso dal browser: riceve il PDF già generato e lo invia col server.
// Nessun invio automatico: la chiamerà solo l'azione esplicita "Invia per email" (fetta 2).
import { inviaEmailPreventivo } from "@/lib/invio-preventivo-email.functions";

export async function blobInBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function inviaPreventivoPerEmail(args: {
  preventivoId: string; pdf: Blob; nomeFile: string;
  oggetto: string; corpo: string; to: string[]; cc?: string[]; bcc?: string[];
}) {
  return inviaEmailPreventivo({ data: {
    preventivoId: args.preventivoId, oggetto: args.oggetto, corpo: args.corpo,
    to: args.to, cc: args.cc ?? [], bcc: args.bcc ?? [],
    pdf: { filename: args.nomeFile, base64: await blobInBase64(args.pdf) },
  } });
}
