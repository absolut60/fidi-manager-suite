const MIME_PER_ESTENSIONE: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"],
  webp: ["image/webp"], gif: ["image/gif"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
};

export function verificaTipoAllegatoInvio(filename: string, contentType: string): void {
  const estensione = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!MIME_PER_ESTENSIONE[estensione]?.includes(mime)) {
    throw new Error(`Tipo di file non ammesso per "${filename}": sono consentiti solo PDF, immagini JPG/PNG/WebP/GIF, Word ed Excel/CSV con estensione e tipo MIME coerenti.`);
  }
}