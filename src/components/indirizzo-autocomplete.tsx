// Input indirizzo con suggerimenti Google Places (API New).
// Resta un normale input modificabile: l'autocomplete è solo un aiuto.
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { caricaMaps } from "@/lib/google-maps-loader";

export type IndirizzoScelto = {
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  lat: number | null;
  lng: number | null;
};

type Sugg = { testo: string; placeId: string };

function componente(place: any, tipo: string, corto = false): string {
  const c = (place?.addressComponents ?? []).find((x: any) =>
    (x.types ?? []).includes(tipo),
  );
  if (!c) return "";
  return (corto ? c.shortText : c.longText) ?? "";
}

export function IndirizzoAutocomplete({
  apiKey, value, onChange, onScelto, placeholder,
}: {
  apiKey?: string | null;
  value: string;
  onChange: (v: string) => void;
  onScelto: (d: IndirizzoScelto) => void;
  placeholder?: string;
}) {
  const [sugg, setSugg] = useState<Sugg[]>([]);
  const [aperto, setAperto] = useState(false);
  const tokenRef = useRef<any>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const ultimoRef = useRef("");

  useEffect(() => {
    if (!apiKey) return;
    caricaMaps(apiKey).catch(() => { /* fallback manuale */ });
  }, [apiKey]);

  // Chiudi cliccando fuori
  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  useEffect(() => {
    const testo = value.trim();
    ultimoRef.current = testo;
    if (!apiKey || testo.length < 3) { setSugg([]); return; }
    const t = setTimeout(async () => {
      try {
        await caricaMaps(apiKey);
        const places: any = await window.google.maps.importLibrary("places");
        const { AutocompleteSuggestion, AutocompleteSessionToken } = places;
        if (!AutocompleteSuggestion) return;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: testo,
          includedRegionCodes: ["it"],
          language: "it",
          sessionToken: tokenRef.current,
        });
        if (ultimoRef.current !== testo) return;
        const out: Sugg[] = (suggestions ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => ({ testo: p.text?.toString?.() ?? "", placeId: p.placeId }));
        setSugg(out);
        setAperto(out.length > 0);
      } catch {
        setSugg([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value, apiKey]);

  async function scegli(s: Sugg) {
    setAperto(false);
    setSugg([]);
    try {
      const places: any = await window.google.maps.importLibrary("places");
      const place = new places.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["addressComponents", "location", "formattedAddress"] });
      const via = componente(place, "route");
      const civico = componente(place, "street_number");
      const citta =
        componente(place, "locality") ||
        componente(place, "administrative_area_level_3") ||
        componente(place, "postal_town");
      const loc = place.location;
      onScelto({
        indirizzo: [via, civico].filter(Boolean).join(" ") || place.formattedAddress || s.testo,
        cap: componente(place, "postal_code"),
        citta,
        provincia: componente(place, "administrative_area_level_2", true),
        lat: loc ? Number(Number(loc.lat()).toFixed(6)) : null,
        lng: loc ? Number(Number(loc.lng()).toFixed(6)) : null,
      });
      tokenRef.current = null;
    } catch {
      onChange(s.testo);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (sugg.length) setAperto(true); }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {aperto && sugg.length > 0 && (
        <ul className="absolute z-[10000] mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {sugg.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => scegli(s)}
              >
                {s.testo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
