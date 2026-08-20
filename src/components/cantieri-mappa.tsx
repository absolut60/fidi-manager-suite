// Mappa Google dei cantieri geolocalizzati + punti vendita MADE. Componente
// caricato solo lato client (import dinamico): la Maps JS API richiede il browser.
import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CATEGORIA_COLORE, CATEGORIA_LABEL, SEDE_COLORE, indirizzoCompleto,
  nomeSoggettoCantiere, testoSedeVicina, type CantiereRow, type SedeMappa,
} from "@/lib/cantieri";

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

/** Pin a goccia colorato: cantieri (colore per categoria). */
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

/** Segnaposto quadrato con simbolo negozio: punti vendita MADE (inconfondibile). */
function sedeSvg(colore: string): string {
  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="40" viewBox="0 0 34 40">
        <path d="M4 1h26a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3h-9l-4 10-4-10H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3z"
              fill="${colore}" stroke="#ffffff" stroke-width="2"/>
        <path d="M9 10h16v3H9z" fill="#ffffff"/>
        <path d="M10.5 14h13v8h-13z" fill="#ffffff"/>
        <path d="M14.5 17h5v5h-5z" fill="${colore}"/>
      </svg>`,
    )
  );
}

export default function CantieriMappa({
  apiKey, cantieri, sedi = [], onApri, focusId, onFocusFatto,
}: {
  apiKey: string;
  cantieri: CantiereRow[];
  sedi?: SedeMappa[];
  onApri: (c: CantiereRow) => void;
  focusId?: string | null;
  onFocusFatto?: () => void;
}) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const sediMarkersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const apriInfoRef = useRef<Map<string, () => void>>(new Map());
  const focusFattoRef = useRef<string | null>(null);
  const [pronta, setPronta] = useState(false);
  const [mostraSedi, setMostraSedi] = useState(true);

  // --- Marker dei cantieri -------------------------------------------------
  useEffect(() => {
    let annullato = false;
    caricaMaps(apiKey)
      .then(() => {
        if (annullato || !divRef.current || !window.google?.maps) return;
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(divRef.current, {
            center: { lat: 42.5, lng: 12.5 },
            zoom: 6,
            mapTypeControl: true,
            mapTypeId: "roadmap",
            mapTypeControlOptions: {
              mapTypeIds: ["roadmap", "satellite", "hybrid", "terrain"],
              style: window.google.maps.MapTypeControlStyle?.HORIZONTAL_BAR,
            },
            streetViewControl: false,
          });
          infoRef.current = new window.google.maps.InfoWindow();
        }
        const map = mapRef.current;

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = new Map();
        apriInfoRef.current = new Map();

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
          const apriInfo = () => {
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
            const sede = document.createElement("div");
            sede.style.fontSize = "12px";
            sede.style.marginTop = "4px";
            const testoSede = testoSedeVicina(c);
            if (testoSede) sede.textContent = `Sede più vicina: ${testoSede}`;
            const btn = document.createElement("button");
            btn.textContent = "Apri";
            btn.style.cssText = "margin-top:8px;font-size:12px;text-decoration:underline;cursor:pointer";
            btn.onclick = () => onApri(c);
            div.append(h, s, a, sede, btn);
            infoRef.current.setContent(div);
            infoRef.current.open({ map, anchor: marker });
          };
          marker.addListener("click", apriInfo);
          markersRef.current.set(c.id, marker);
          apriInfoRef.current.set(c.id, apriInfo);
          bounds.extend({ lat: c.lat, lng: c.lng });
        });

        if (markersRef.current.size === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(13);
        } else if (markersRef.current.size > 1) {
          map.fitBounds(bounds);
        }
        setPronta(true);
      })
      .catch(() => {});
    return () => { annullato = true; };
  }, [apiKey, cantieri, onApri]);

  // --- Marker dei punti vendita (non filtrati per agente) ------------------
  useEffect(() => {
    if (!pronta || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;

    sediMarkersRef.current.forEach((m) => m.setMap(null));
    sediMarkersRef.current = [];
    if (!mostraSedi) return;

    sedi.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const marker = new window.google.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map,
        title: s.nome,
        zIndex: 999,
        icon: {
          url: sedeSvg(SEDE_COLORE),
          scaledSize: new window.google.maps.Size(34, 40),
          anchor: new window.google.maps.Point(17, 40),
        },
      });
      marker.addListener("click", () => {
        const div = document.createElement("div");
        div.style.minWidth = "200px";
        const t = document.createElement("div");
        t.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#0f4c81";
        t.textContent = "Punto vendita MADE";
        const h = document.createElement("div");
        h.style.fontWeight = "600";
        h.textContent = s.nome;
        const a = document.createElement("div");
        a.style.fontSize = "12px";
        a.style.color = "#666";
        a.textContent = indirizzoCompleto(s) || "—";
        div.append(t, h, a);
        if (s.telefono) {
          const tel = document.createElement("div");
          tel.style.fontSize = "12px";
          tel.style.marginTop = "4px";
          tel.textContent = `Tel. ${s.telefono}`;
          div.append(tel);
        }
        infoRef.current.setContent(div);
        infoRef.current.open({ map, anchor: marker });
      });
      sediMarkersRef.current.push(marker);
    });
  }, [pronta, sedi, mostraSedi]);

  // --- Focus su un cantiere (da lista / da scheda cliente) -----------------
  // Applicato una sola volta per id: il parametro resta nell'URL, così l'InfoWindow
  // non viene chiusa da un rebuild dei marker.
  useEffect(() => {
    if (!pronta || !focusId || !mapRef.current) return;
    if (focusFattoRef.current === focusId) return;
    const marker = markersRef.current.get(focusId);
    const apri = apriInfoRef.current.get(focusId);
    if (!marker || !apri) return;
    focusFattoRef.current = focusId;
    mapRef.current.panTo(marker.getPosition());
    mapRef.current.setZoom(15);
    apri();
    onFocusFatto?.();
  }, [pronta, focusId, cantieri, onFocusFatto]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch id="mostra-sedi" checked={mostraSedi} onCheckedChange={setMostraSedi} />
        <Label htmlFor="mostra-sedi" className="text-sm font-normal cursor-pointer">
          Mostra punti vendita ({sedi.length})
        </Label>
      </div>
      <div ref={divRef} className="h-[600px] w-full rounded-md border" />
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.keys(CATEGORIA_LABEL).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full" style={{ background: CATEGORIA_COLORE[k] }} />
            {CATEGORIA_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 font-medium">
          <span
            className="inline-block size-3 rounded-[3px] border border-background"
            style={{ background: SEDE_COLORE }}
          />
          Punti vendita MADE
        </span>
      </div>
    </div>
  );
}
