import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListinoAcquistoView } from "@/components/listini/ListinoAcquistoView";
import { ListinoVenditaView } from "@/components/listini/ListinoVenditaView";
import { MatriceRicarichiView } from "@/components/listini/MatriceRicarichiView";

export const Route = createFileRoute("/_app/listini")({
  head: () => ({ meta: [{ title: "Listini — Sistema MADE" }, { name: "description", content: "Listini acquisto, vendita e matrice ricarichi MADE." }, { property: "og:title", content: "Listini — Sistema MADE" }, { property: "og:description", content: "Listini acquisto, vendita e matrice ricarichi MADE." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ListiniPage,
});

function ListiniPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-3 pt-3 lg:px-6 lg:pt-4">
        <h1 className="text-lg font-bold text-navy lg:text-xl">Listini</h1>
        <p className="hidden text-xs text-muted-foreground lg:block">
          Vista trasversale: editing inline come foglio di calcolo. Le formule sono centralizzate
          in <code className="font-mono">src/lib/pricing.ts</code>.
        </p>
        <Tabs defaultValue="acquisto" className="mt-2 lg:mt-3">
          <TabsList>
            <TabsTrigger value="acquisto">Listino acquisto</TabsTrigger>
            <TabsTrigger value="vendita">Listino vendita</TabsTrigger>
            <TabsTrigger value="matrice">Matrice ricarichi</TabsTrigger>
          </TabsList>
          <TabsContent
            value="acquisto"
            className="mt-0 -mx-3 border-t data-[state=inactive]:hidden lg:-mx-6"
            forceMount
          >
            <ListinoAcquistoView />
          </TabsContent>
          <TabsContent
            value="vendita"
            className="mt-0 -mx-3 border-t data-[state=inactive]:hidden lg:-mx-6"
            forceMount
          >
            <ListinoVenditaView />
          </TabsContent>
          <TabsContent
            value="matrice"
            className="mt-0 -mx-3 border-t data-[state=inactive]:hidden lg:-mx-6"
            forceMount
          >
            <MatriceRicarichiView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
