// Mappa Google dei cantieri geolocalizzati. Componente caricato solo lato client
// (import dinamico): la Maps JS API richiede il browser.
import { useEffect, useRef } from "react";
import { CATEGORIA_COLORE, CATEGORIA_LABEL, indirizzoCompleto, nomeSoggettoCantiere, testoSedeVicina, type CantiereRow } from "@/lib/cantieri";

declare global {
  interface Window { google?: any; __initGoogleMaps?: () => void }
}

let caricamento: Promise<void> | null = null;

function caricaMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (caricamento) return caricamento;
  caricamento = new Promise<void>((resolve, reject) => {
    window.__initGoogleMaps = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__initGoogleMaps&language=it&region=IT`;
    s.async = true;
    s.onerror = () => reject(new Error("Caricamento Google Maps non riuscito"));
    document.head.appendChild(s);
  });
  return caricamento;
}

function pinSvg(colore: string): string {
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 24 14 24s14-14 14-24c0-7.7-6.3-14-14-14z" fill="${colore}"/>
        <circle cx="14" cy="14" r="5" fill="#fff"/>
      </svg>`,
    )
  );
}

export default function CantieriMappa({
  apiKey, cantieri, onApri,
}: {
  apiKey: string;
  cantieri: CantiereRow[];
  onApri: (c: CantiereRow) => void;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);

  useEffect(() => {
    let annullato = false;
    caricaMaps(apiKey)
      .then(() => {
        if (annullato || !divRef.current || !window.google?.maps) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(divRef.current, {
            center: { lat: 42.5, lng: 12.5 },
            zoom: 6,
            mapTypeControl: false,
            streetViewControl: false,
          });
          infoRef.current = new window.google.maps.InfoWindow();
        }
        const map = mapRef.current;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];

        const bounds = new window.google.maps.LatLngBounds();
        cantieri.forEach((c) => {
          if (c.lat == null || c.lng == null) return;
          const colore = CATEGORIA_COLORE[c.categoria ?? ""] ?? CATEGORIA_COLORE.altro;
          const marker = new window.google.maps.Marker({
            position: { lat: c.lat, lng: c.lng },
            map,
            title: c.nome,
            icon: { url: pinSvg(colore), scaledSize: new window.google.maps.Size(28, 38) },
          });
          marker.addListener("click", () => {
            const div = document.createElement("div");
            div.style.minWidth = "200px";
            const h = document.createElement("div");
            h.style.fontWeight = "600";
            h.textContent = c.nome;
            const s = document.createElement("div");
            s.style.fontSize = "12px";
            s.textContent = nomeSoggettoCantiere(c);
            const a = document.createElement("div");
            a.style.fontSize = "12px";
            a.style.color = "#666";
            a.textContent = indirizzoCompleto(c) || "—";
            const btn = document.createElement("button");
            btn.textContent = "Apri";
            btn.style.cssText = "margin-top:8px;font-size:12px;text-decoration:underline;cursor:pointer";
            btn.onclick = () => onApri(c);
            div.append(h, s, a, btn);
            infoRef.current.setContent(div);
            infoRef.current.open({ map, anchor: marker });
          });
          markersRef.current.push(marker);
          bounds.extend({ lat: c.lat, lng: c.lng });
        });

        if (markersRef.current.length === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(13);
        } else if (markersRef.current.length > 1) {
          map.fitBounds(bounds);
        }
      })
      .catch(() => {});
    return () => { annullato = true; };
  }, [apiKey, cantieri, onApri]);

  return (
    <div className="space-y-3">
      <div ref={divRef} className="h-[600px] w-full rounded-md border" />
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.keys(CATEGORIA_LABEL).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full" style={{ background: CATEGORIA_COLORE[k] }} />
            {CATEGORIA_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
