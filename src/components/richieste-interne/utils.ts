export const RICHIESTE_ALLEGATI_BUCKET = "richieste-allegati";

/** Sanitizza il nome file per usarlo come path storage.
 *  NB: usare SOLO per il path fisico. La colonna nome_file deve conservare il nome originale. */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
