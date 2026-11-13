import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ClientePicker } from '@/components/preventivatore/ClientePicker';
import { NuovoPreventivoDialog } from '@/components/preventivatore/NuovoPreventivoDialog';
import { Copy } from 'lucide-react';
export const Route = createFileRoute('/prova-correzioni-a')({component: Prova});
function Prova() {
 const qc = useQueryClient();
 const [seeded] = useState(() => {
  const cliente = {id:'cliente-a', codice_gestionale:'6913', ragione_sociale:'IMPRESA CON RAGIONE SOCIALE MOLTO LUNGA PER VERIFICARE I RISULTATI', partita_iva:'01234567890', provincia:'MI', condizione_pagamento_cod:null, codice_agente:null};
  const clienteB = {...cliente,id:'cliente-b',codice_gestionale:'13380',ragione_sociale:'CLIENTE SENZA SEDE'};
  for (const [key,data] of [
   [['agenti'],[]], [['stores-attivi'],[{id:'s1',codice:'30',nome:'SEDE DI CINISELLO BALSAMO'},{id:'s2',codice:'10',nome:'SEDE DI CAMBIAGO'}]],
   [['clienti-preventivo-search',''],[cliente,clienteB]],
   [['cliente-preventivo-dati','cliente-a'],cliente], [['cliente-preventivo-dati','cliente-b'],clienteB],
   [['condizioni-preventivo-cliente','cliente-a'],{sede_nome:'SEDE DI CINISELLO BALSAMO',listino:30}],
   [['condizioni-preventivo-cliente','cliente-b'],{sede_nome:null,listino:10}],
   [['cantieri-lite','cliente-a'],[]], [['cantieri-lite','cliente-b'],[]],
  ] as const) { qc.setQueryDefaults(key,{staleTime:Infinity}); qc.setQueryData(key,data); }
  return true;
 });
 const [nuovo,setNuovo]=useState(false);
 const [duplicaOpen,setDuplicaOpen]=useState(false);
 const [duplicaStep,setDuplicaStep]=useState<'scelta'|'seleziona-cliente'>('scelta');
 const [duplicaClienteId,setDuplicaClienteId]=useState<string|null>(null);
 const duplica={isPending:false,mutate:(_arg:unknown)=>setDuplicaOpen(false)};
 return <main className="p-4"><Button onClick={()=>setNuovo(true)}>Nuovo preventivo</Button>
 <NuovoPreventivoDialog open={nuovo} onOpenChange={setNuovo}/>
              <Dialog
                open={duplicaOpen}
                onOpenChange={(v) => {
                  setDuplicaOpen(v);
                  if (!v) {
                    setDuplicaStep("scelta");
                    setDuplicaClienteId(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={duplica.isPending}>
                    <Copy className="mr-1 h-4 w-4" /> {duplica.isPending ? "Duplicazione…" : "Duplica"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl min-w-0 overflow-x-hidden [&>*]:min-w-0">
                  <DialogHeader className="break-words text-left">
                    <DialogTitle>
                      {duplicaStep === "scelta"
                        ? "Duplicare questo preventivo?"
                        : "Duplica preventivo — Seleziona cliente"}
                    </DialogTitle>
                    {duplicaStep === "scelta" && (
                      <DialogDescription className="whitespace-normal break-words">
                        Scegli come duplicare. In tutti i casi verrà creato un nuovo numero progressivo, con data di oggi e stato bozza.
                        <br /><br />
                        <strong>Stesso cliente</strong>: copia di testata, blocchi e righe (stesso cliente, cantiere e agente); gli allegati non vengono copiati.
                        <br />
                        <strong>Come alternativa</strong>: stessa copia, collegata come alternativa al preventivo principale (lettera B, C…).
                        <br />
                        <strong>Nuovo cliente</strong>: copia blocchi e righe (prezzi inclusi), scegli il cliente di destinazione; agente e filiale vengono dal nuovo cliente, cantiere e allegati non vengono copiati.
                      </DialogDescription>
                    )}
                  </DialogHeader>

                  {duplicaStep === "scelta" ? (
                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:space-x-0 [&>button]:min-h-10 [&>button]:w-full sm:[&>button]:w-auto">
                      <Button onClick={() => duplica.mutate({ mode: "stesso_cliente" })}>
                        Stesso cliente
                      </Button>
                      <Button variant="outline" disabled={duplica.isPending} onClick={() => duplica.mutate({ mode: "alternativa" })}>
                        Come alternativa
                      </Button>
                      <Button variant="outline" onClick={() => setDuplicaStep("seleziona-cliente")}>
                        Nuovo cliente
                      </Button>
                      <Button variant="outline" onClick={() => setDuplicaOpen(false)}>Annulla</Button>
                    </DialogFooter>
                  ) : (
                    <>
                      <div className="grid gap-2 py-2">
                        <Label>Cliente di destinazione</Label>
                        <ClientePicker value={duplicaClienteId} onChange={setDuplicaClienteId} />
                        <p className="text-xs text-muted-foreground">
                          Agente e filiale verranno presi dal cliente selezionato.
                        </p>
                      </div>
                      <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" onClick={() => setDuplicaStep("scelta")}>
                          Indietro
                        </Button>
                        <Button
                          disabled={!duplicaClienteId || duplica.isPending}
                          onClick={() =>
                            duplica.mutate({ mode: "nuovo_cliente", nuovoClienteId: duplicaClienteId })
                          }
                        >
                          {duplica.isPending ? "Duplicazione…" : "Duplica"}
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog></main>;
}
