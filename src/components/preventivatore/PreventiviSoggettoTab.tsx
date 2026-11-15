import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { puoConsultarePreventivi, puoScriverePreventivi } from "@/lib/permessi-preventivi";
import { fetchPreventiviSoggetto, type PreventivoSoggetto, type SoggettoTabPreventivi } from "@/lib/preventivi-soggetto";
import { formatDate, formatEuro } from "@/lib/fidi";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BadgeStato, BadgeTipoDoc } from "./BadgeTestata";
import { NuovoPreventivoDialog } from "./NuovoPreventivoDialog";

function BadgeDocumento({ r }: { r: PreventivoSoggetto }) {
  return r.tipo === "ordine" ? <span className="rounded border px-2 py-0.5 text-xs">Ordine</span> : <BadgeTipoDoc tipoDoc={r.tipo_doc} className="whitespace-normal" />;
}

function GruppoPreventivi({ soggetto, originati = false }: { soggetto: SoggettoTabPreventivi; originati?: boolean }) {
  const { user, roles } = useAuth();
  const query = useQuery({
    queryKey: ["preventivi", "soggetto", user?.id, soggetto.tipo, soggetto.id, originati],
    queryFn: () => fetchPreventiviSoggetto(soggetto, originati),
    enabled: puoConsultarePreventivi(roles),
  });
  if (query.isPending) return <p className="p-3 text-sm text-muted-foreground">Caricamento preventivi…</p>;
  if (query.error) return <div role="alert" className="flex flex-wrap items-center gap-2 py-3 text-sm text-destructive">{query.error.message}<Button variant="outline" onClick={() => query.refetch()}>Riprova</Button></div>;
  if (!query.data?.length) return originati ? null : <div className="rounded-md border border-l-4 border-l-pv-blu bg-card p-4 text-sm text-muted-foreground">Nessun preventivo per questo soggetto</div>;
  return <section className="min-w-0 space-y-3">
    {originati && <h3 className="break-words text-sm font-semibold">Originati da questo lead (ora del cliente)</h3>}
    <div className="space-y-3 md:hidden">
      {query.data.map(r => <Link key={r.id} to="/preventivatore/$id" params={{ id: r.id }} className="block min-w-0 rounded-md border border-l-4 border-l-pv-blu bg-card p-3 hover:bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-mono text-sm font-medium">{r.numero ?? "—"}</span><BadgeStato stato={r.stato}/></div>
        <p className="my-2 break-words text-sm">{r.titolo || "—"}</p>
        <div className="flex flex-wrap items-center gap-2"><BadgeDocumento r={r}/><span className="text-xs text-muted-foreground">{formatDate(r.data)}</span><span className="ml-auto text-sm font-semibold tabular-nums">{formatEuro(r.totale ?? 0)}</span></div>
      </Link>)}
    </div>
    <div className="hidden md:block">
      <Table className="table-fixed text-xs">
        <TableHeader><TableRow className="bg-pv-testa hover:bg-pv-testa"><TableHead className="w-32">Numero</TableHead><TableHead className="w-24">Data</TableHead><TableHead>Titolo</TableHead><TableHead className="w-40">Tipo</TableHead><TableHead className="w-28">Stato</TableHead><TableHead className="w-28 text-right">Totale</TableHead></TableRow></TableHeader>
        <TableBody>{query.data.map(r => <TableRow key={r.id} className="relative hover:bg-muted/50">
          <TableCell className="break-words font-mono"><Link to="/preventivatore/$id" params={{ id: r.id }} className="after:absolute after:inset-0 focus-visible:underline">{r.numero ?? "—"}<span className="sr-only">: {r.titolo || "Apri documento"}</span></Link></TableCell>
          <TableCell>{formatDate(r.data)}</TableCell><TableCell className="break-words">{r.titolo || "—"}</TableCell><TableCell><BadgeDocumento r={r}/></TableCell><TableCell><BadgeStato stato={r.stato}/></TableCell><TableCell className="text-right tabular-nums">{formatEuro(r.totale ?? 0)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </section>;
}

export function PreventiviSoggettoTab({ soggetto }: { soggetto: SoggettoTabPreventivi }) {
  const { roles } = useAuth();
  const [nuovo, setNuovo] = useState(false);
  if (!puoConsultarePreventivi(roles)) return null;
  return <div className="min-w-0 space-y-4">
    {puoScriverePreventivi(roles) && <div className="flex justify-end"><Button onClick={() => setNuovo(true)}><Plus className="mr-1 size-4"/>Nuovo preventivo</Button></div>}
    <GruppoPreventivi soggetto={soggetto}/>
    {soggetto.tipo === "lead" && <GruppoPreventivi soggetto={soggetto} originati/>}
    {nuovo && <NuovoPreventivoDialog open onOpenChange={setNuovo} soggettoIniziale={soggetto}/>}
  </div>;
}