/** Fonte unica, pura e compatibile con entrambi i runtime email. */
export function mascheraEmail(email: string): string {
  const valore = email.trim();
  const separatore = valore.lastIndexOf("@");
  if (separatore <= 0 || separatore === valore.length - 1) return "***";
  return `${valore[0]}***${valore.slice(separatore)}`;
}

/** Include gli indirizzi eventualmente presenti negli errori SMTP. */
export function mascheraEmailNelLog(valore: unknown): string {
  const testo = valore instanceof Error ? valore.message : typeof valore === "string" ? valore : JSON.stringify(valore) ?? "";
  return testo.replace(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+/g, mascheraEmail);
}