// Loader condiviso della Google Maps JS API (con libreria places).
// Evita il doppio caricamento dello script tra mappa cantieri e autocomplete indirizzi.
declare global {
  interface Window { google?: any; __initGoogleMaps?: () => void }
}

let caricamento: Promise<void> | null = null;

export function caricaMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (caricamento) return caricamento;
  caricamento = new Promise<void>((resolve, reject) => {
    const esistente = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (esistente) {
      esistente.addEventListener("load", () => resolve());
      esistente.addEventListener("error", () => reject(new Error("Caricamento Google Maps non riuscito")));
      return;
    }
    window.__initGoogleMaps = () => resolve();
    const s = document.createElement("script");
    s.dataset["googleMaps"] = "1";
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&libraries=places&callback=__initGoogleMaps&language=it&region=IT`;
    s.async = true;
    s.onerror = () => reject(new Error("Caricamento Google Maps non riuscito"));
    document.head.appendChild(s);
  });
  return caricamento;
}
