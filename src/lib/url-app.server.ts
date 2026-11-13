import { createServerOnlyFn } from "@tanstack/react-start";

/** Fonte unica dei link email: un singolo URL HTTPS, mai l'origin del browser. */
export const urlAppUfficiale = createServerOnlyFn((): string => {
  const configurato = process.env["PUBLIC_APP_URL"]?.trim();
  if (!configurato) return "https://fidi-manager-suite.lovable.app";
  const url = new URL(configurato);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PUBLIC_APP_URL deve essere un unico indirizzo HTTPS ufficiale, senza percorsi o credenziali.");
  }
  return url.origin;
});