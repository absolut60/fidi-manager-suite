import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { geocodificaCantiere } from "@/lib/cantieri.functions";
import { creaCantiereLite } from "@/lib/preventivi-api";

/**
 * Modulo "nuovo cantiere" del preventivo (FM65 B2): unico punto che crea cantieri da preventivo.
 * provvisorio=false: nome e indirizzo obbligatori; provvisorio=true: solo il nome.
 * Dopo la creazione geocodifica il cantiere e restituisce l'id creato.
 */
export function NuovoCantiereForm({ clienteId, provvisorio = false, onCreato }: {
  clienteId: string | null; provvisorio?: boolean; onCreato: (c: { id: string; nome: string }) => void;
}) {
  const qc = useQueryClient();
  const geocodifica = useServerFn(geocodificaCantiere);
  const [nome, setNome] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [cap, setCap] = useState("");
  const [citta, setCitta] = useState("");
  const [provincia, setProvincia] = useState("");

  const crea = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Seleziona un cliente");
      const nuovo = await creaCantiereLite(clienteId, nome, indirizzo || null, citta || null, provincia || null, cap || null, provvisorio);
      let esitoGeo: { stato: string; messaggio?: string | null } | null = null;
      try { esitoGeo = await geocodifica({ data: { cantiere_id: nuovo.id } }); } catch { esitoGeo = null; }
      return { nuovo, esitoGeo };
    },
    onSuccess: ({ nuovo, esitoGeo }) => {
      qc.invalidateQueries({ queryKey: ["cantieri-lite", clienteId] });
      setNome(""); setIndirizzo(""); setCap(""); setCitta(""); setProvincia("");
      if (esitoGeo?.stato === "ok") {
        toast.success("Cantiere creato e geolocalizzato. Sede più vicina calcolata.");
      } else if (esitoGeo) {
        toast.warning(`Cantiere creato ma NON geolocalizzato: ${esitoGeo.messaggio ?? "indirizzo non trovato"}. Aprilo in Cantieri per posizionarlo a mano.`);
      } else {
        toast.warning("Cantiere creato. Geolocalizzazione non riuscita: verifica l'indirizzo nella scheda Cantieri.");
      }
      onCreato(nuovo);
    },
    onError: (e: unknown) => { toast.error((e as Error).message || "Errore creazione cantiere"); },
  });

  if (!clienteId) return <p className="text-sm text-muted-foreground">Prima seleziona un cliente.</p>;
  const off = crea.isPending;
  return <div className="grid gap-2">
    <div className="grid gap-1.5"><Label className="text-xs">Nome cantiere *</Label>
      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Cantiere zona Milano nord" disabled={off} /></div>
    <div className="grid gap-1.5"><Label className="text-xs">Indirizzo{provvisorio ? "" : " *"}</Label>
      <Input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="es. Via Roma 1" disabled={off} /></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_5rem]">
      <div className="grid gap-1.5"><Label className="text-xs">CAP</Label>
        <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="CAP" inputMode="numeric" disabled={off} /></div>
      <div className="grid gap-1.5"><Label className="text-xs">Città</Label>
        <Input value={citta} onChange={(e) => setCitta(e.target.value)} placeholder="Città" disabled={off} /></div>
      <div className="grid gap-1.5"><Label className="text-xs">Provincia</Label>
        <Input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="PR" disabled={off} /></div>
    </div>
    <p className="text-xs text-muted-foreground">
      {provvisorio
        ? "Il cantiere viene salvato fra i cantieri del cliente come provvisorio. Indirizzo facoltativo: se presente viene geolocalizzato."
        : "L'indirizzo verrà geolocalizzato e verrà calcolata la sede più vicina. Serve un indirizzo valido (via + città)."}
    </p>
    <Button type="button" size="sm" disabled={off} onClick={() => {
      if (!nome.trim() || (!provvisorio && !indirizzo.trim())) {
        toast.error(provvisorio ? "Il nome è obbligatorio" : "Nome e indirizzo sono obbligatori");
        return;
      }
      crea.mutate();
    }}>{off ? "Creazione…" : "Crea e seleziona cantiere"}</Button>
  </div>;
}
