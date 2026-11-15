/** Il flag abilita il CID esistente; senza contenuto personalizzato il logo resta identico. */
export function contenutoLogoInline(inlineLogo: boolean | undefined, inlineLogoBase64: string | undefined, logoMade: string): string | null {
  return inlineLogo ? (inlineLogoBase64 || logoMade) : null;
}