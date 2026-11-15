import { createFileRoute } from "@tanstack/react-router";
import { RiepilogoIvaPreventivo } from "@/components/preventivatore/RiepilogoIvaPreventivo";
const r = (importo: number, bs = false, codice: string | null = null) => ({ importo, bene_significativo: bs, aliquota_iva: null, articolo_codice: codice });
const blocchi = [{ righe: [r(2000, false, "PEF001"), r(1500), r(300), r(2500, true), r(1700, true)] }] as never;
const senza = [{ righe: [r(1000)] }] as never;
export const Route = createFileRoute("/tmp-iva")({ component: () => (
  <div className="mx-auto grid max-w-3xl gap-6 p-4">
    <RiepilogoIvaPreventivo regime="agevolata_10_bs" ivaPerc={22} blocchi={blocchi} />
    <RiepilogoIvaPreventivo regime="agevolata_10_bs" ivaPerc={22} blocchi={senza} />
    <RiepilogoIvaPreventivo regime="ordinaria" ivaPerc={22} blocchi={blocchi} />
  </div>) });
