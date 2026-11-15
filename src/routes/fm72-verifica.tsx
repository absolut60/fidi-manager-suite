import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { PreventiviSoggettoTab } from "@/components/preventivatore/PreventiviSoggettoTab";
function Verifica() { return <main className="p-4"><h1>Preventivi del soggetto</h1><PreventiviSoggettoTab soggetto={{tipo: new URLSearchParams(window.location.search).has("cliente") ? "cliente" : "lead",id:"11111111-1111-4111-8111-111111111111",etichetta:"Impresa collaudo"}}/></main>; }
export const Route = createFileRoute("/fm72-verifica")({ component: () => <ClientOnly><Verifica/></ClientOnly> });