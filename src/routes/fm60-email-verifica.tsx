import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { VisualizzatoreAllegato, tipoAllegato } from "@/components/allegati/anteprima-allegato";
import msgUrl from "../../tests/fixtures/email/prova.msg?url";
import emlUrl from "../../tests/fixtures/email/prova.eml?url";

export const Route = createFileRoute("/fm60-email-verifica")({
  head: () => ({ meta: [
    { title: "Verifica email allegata | FidiManager" },
    { name: "description", content: "Verifica temporanea con email fittizie." },
    { property: "og:title", content: "Verifica email allegata | FidiManager" },
    { property: "og:description", content: "Verifica temporanea con email fittizie." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Verifica,
});
function Verifica() {
  const pronta = useHydrated();
  const [file, setFile] = useState<File | null>(null);
  return <main className="p-4"><div className="flex gap-2">{["msg", "eml"].map((ext) => <Button disabled={!pronta} key={ext} onClick={async () => {
    const bytes = await (await fetch(ext === "msg" ? msgUrl : emlUrl)).arrayBuffer();
    setFile(new File([bytes], `Pratica di prova.${ext}`, { type: ext === "msg" ? "" : "message/rfc822" }));
  }}>Apri {ext.toUpperCase()}</Button>)}</div>
    <p>{[tipoAllegato(null, "MAIL.MSG"), tipoAllegato(null, "mail.EmL"), tipoAllegato("application/vnd.ms-outlook", "mail"), tipoAllegato("message/rfc822", "mail")].join(" ")}</p>
    {file && <VisualizzatoreAllegato open onOpenChange={(v) => { if (!v) setFile(null); }} file={file} nomeFile={file.name} tipo="email" />}
  </main>;
}