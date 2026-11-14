import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Eccezioni puntuali: espressione completa, non esclusione di un intero file.
const tecniche = [
  {
    "file": "src/components/registra-promessa-dialog.tsx",
    "expression": "supabase.from(\"azioni_recupero\").delete().eq(\"id\", azioneId)",
    "motivo": "Rollback creazione promessa non completata"
  },
  {
    "file": "src/components/richieste-interne/bonifico-acconto-card.tsx",
    "expression": "supabase.from(\"richieste_interne_allegati\").delete().eq(\"id\", allegatoId)",
    "motivo": "Rollback ricevuta dopo registrazione bonifico fallita"
  },
  {
    "file": "src/lib/fido-teorico-ricalcolo-passi.server.ts",
    "expression": "supabaseAdmin.from(\"configurazioni\") .delete().eq(\"chiave\", LOCK_CHIAVE).like(\"valore\", `%\"token\":\"${token}\"%`)",
    "motivo": "Rilascio lock posseduto dal token"
  },
  {
    "file": "src/lib/inngest/eventi-import.server.ts",
    "expression": "withTimeout( supabaseAdmin .from(\"eventi_import_righe\") .delete() .eq(\"importazione_id\", importazioneId), 30_000, \"reset staging import\", )",
    "motivo": "Reset staging/anomalie del singolo import per retry idempotente"
  },
  {
    "file": "src/lib/inngest/eventi-import.server.ts",
    "expression": "withTimeout( supabaseAdmin .from(\"anomalie_import\") .delete() .eq(\"importazione_id\", importazioneId), 20_000, \"reset anomalie import\", )",
    "motivo": "Reset staging/anomalie del singolo import per retry idempotente"
  },
  {
    "file": "src/lib/inngest/functions.server.ts",
    "expression": "supabaseAdmin .from(\"anomalie_import\" as never) .delete() .eq(\"stato\", \"in_attesa\" as never) .in(\"importazione_id\", ids.slice(i, i + 200) as never)",
    "motivo": "Pulizia anomalie import o note Gamma assenti dopo import completo"
  },
  {
    "file": "src/lib/inngest/functions.server.ts",
    "expression": "supabaseAdmin.from(\"anomalie_import\") .delete().eq(\"importazione_id\", importazioneId).eq(\"tipo_anomalia\", \"riga_doppia_gamma\") .eq(\"stato\", \"in_attesa\")",
    "motivo": "Pulizia anomalie import o note Gamma assenti dopo import completo"
  },
  {
    "file": "src/lib/inngest/functions.server.ts",
    "expression": "supabaseAdmin .from(\"note_legali_gestionali\" as never) .delete() .in(\"cliente_id\", slice)",
    "motivo": "Pulizia anomalie import o note Gamma assenti dopo import completo"
  },
  {
    "file": "src/lib/inngest/listini-gamma/gestori.server.ts",
    "expression": "supabaseAdmin .from(\"anomalie_import\" as never) .delete() .eq(\"importazione_id\", importazioneId as never) .like(\"tipo_anomalia\", `${prefisso}%` as never)",
    "motivo": "Sostituzione anomalie del foglio per retry idempotente"
  },
  {
    "file": "src/lib/invio-multiplo-fornitori.functions.ts",
    "expression": "supabaseAdmin.from(\"invii_fornitori\").delete().eq(\"id\", invioId)",
    "motivo": "Rollback invio fornitore non completato"
  },
  {
    "file": "src/lib/invio-multiplo-fornitori.functions.ts",
    "expression": "supabaseAdmin.from(\"attivita_fornitore\").delete().eq(\"invio_id\", invioId).eq(\"stato\", \"in_invio\")",
    "motivo": "Rollback invio fornitore non completato"
  },
  {
    "file": "src/lib/invio-multiplo-fornitori.functions.ts",
    "expression": "supabaseAdmin.from(\"invii_fornitori\").delete().eq(\"id\", invioId)",
    "motivo": "Rollback invio fornitore non completato"
  },
  {
    "file": "src/lib/lettera-fornitore.functions.ts",
    "expression": "supabaseAdmin.from(\"attivita_fornitore\").delete().eq(\"id\", ins.id)",
    "motivo": "Rollback generazione lettera fornitore fallita"
  },
  {
    "file": "src/lib/lettera-pdf.functions.ts",
    "expression": "supabase.from(\"azioni_recupero\").delete().eq(\"id\", azioneId)",
    "motivo": "Rollback creazione lettera recupero fallita"
  },
  {
    "file": "src/lib/lettera-pdf.functions.ts",
    "expression": "supabase.from(\"azioni_recupero\").delete().eq(\"id\", azioneId)",
    "motivo": "Rollback creazione lettera recupero fallita"
  },
  {
    "file": "src/lib/push/index.ts",
    "expression": "supabase .from(\"push_subscriptions\") .delete() .eq(\"user_id\", userId) .eq(\"platform\", platform) .neq(\"endpoint\", endpoint)",
    "motivo": "Pulizia iscrizioni obsolete della stessa piattaforma prima di upsert"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "supabase.from(\"contatti\").delete().eq(\"cliente_id\", clienteId)",
    "motivo": "Rollback cliente/contatti appena creati, non aggiornamenti"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "supabase.from(\"clienti\").delete().eq(\"id\", clienteId)",
    "motivo": "Rollback cliente/contatti appena creati, non aggiornamenti"
  },
  {
    "file": "src/routes/api/public/invia-push.ts",
    "expression": "supabaseAdmin.from(\"push_subscriptions\").delete().eq(\"id\", s.id)",
    "motivo": "Pulizia endpoint push scaduto dopo risposta 404/410"
  }
] as const;
// Operazioni Set/Map/URLSearchParams: non sono cancellazioni database.
const collezioni = [
  {
    "file": "src/components/allegati/anteprima-allegato.tsx",
    "expression": "cacheMiniPdf.delete(chiave)"
  },
  {
    "file": "src/components/allegati/anteprima-allegato.tsx",
    "expression": "cacheUrl.delete(`${bucket}::${storagePath}`)"
  },
  {
    "file": "src/components/app-shell.tsx",
    "expression": "next.delete(key)"
  },
  {
    "file": "src/components/crea-azione-dialog.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/components/eventi/riconcilia-import-card.tsx",
    "expression": "next.delete(r.id)"
  },
  {
    "file": "src/components/eventi/riconcilia-import-card.tsx",
    "expression": "next.delete(r.id)"
  },
  {
    "file": "src/components/fornitori/InviaEmailFornitoreDialog.tsx",
    "expression": "n.delete(x.id)"
  },
  {
    "file": "src/components/fornitori/InviaEmailFornitoreDialog.tsx",
    "expression": "n.delete(x.id)"
  },
  {
    "file": "src/components/invia-email-recupero-dialog.tsx",
    "expression": "n.delete(s.id)"
  },
  {
    "file": "src/components/invia-email-recupero-dialog.tsx",
    "expression": "n.delete(a.id)"
  },
  {
    "file": "src/components/invio-massivo-dialog.tsx",
    "expression": "n.delete(cid)"
  },
  {
    "file": "src/components/marketing/segmenti-whatsapp-tab.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/components/marketing/segmenti-whatsapp-tab.tsx",
    "expression": "n.delete(r.contatto_id)"
  },
  {
    "file": "src/components/marketing/whatsapp-campagne-tab.tsx",
    "expression": "next.delete(id)"
  },
  {
    "file": "src/components/marketing/whatsapp-campagne-tab.tsx",
    "expression": "next.delete(r.id)"
  },
  {
    "file": "src/components/preventivatore/AggiornaListiniDialog.tsx",
    "expression": "s.delete(d.riga_id)"
  },
  {
    "file": "src/components/preventivatore/ArticoloGammaPicker.tsx",
    "expression": "ascoltatori.delete(cb)"
  },
  {
    "file": "src/components/selettore-scadenze-aperte.tsx",
    "expression": "next.delete(id)"
  },
  {
    "file": "src/lib/comunicazioni-richiesta.functions.ts",
    "expression": "ammessi.delete(com.autore_id)"
  },
  {
    "file": "src/lib/inngest/richieste-email.server.ts",
    "expression": "to.delete(data.actor.email.toLowerCase())"
  },
  {
    "file": "src/lib/inngest/richieste-email.server.ts",
    "expression": "userIds.delete(data.actor.id)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perCodice.delete(codice)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perCodice.delete(codice)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perCodice.delete(codice)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perChiave.delete(k)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perChiave.delete(k)"
  },
  {
    "file": "src/lib/listini-gamma-parser.ts",
    "expression": "perChiave.delete(chiave)"
  },
  {
    "file": "src/lib/vista-incorporata.ts",
    "expression": "link.searchParams.delete(\"vista\")"
  },
  {
    "file": "src/routes/_app/alert-fidi.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/calendario-commerciale.tsx",
    "expression": "n.delete(t)"
  },
  {
    "file": "src/routes/_app/chat.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "next.delete(c.id)"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "next.delete(c.id)"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "next.delete(v)"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/clienti.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/cruscotto-incassi.tsx",
    "expression": "s.delete(id)"
  },
  {
    "file": "src/routes/_app/cruscotto-incassi.tsx",
    "expression": "s.delete(id)"
  },
  {
    "file": "src/routes/_app/cruscotto-incassi.tsx",
    "expression": "s.delete(id)"
  },
  {
    "file": "src/routes/_app/cruscotto-incassi.tsx",
    "expression": "s.delete(id)"
  },
  {
    "file": "src/routes/_app/fidi-processare.tsx",
    "expression": "s.delete(id)"
  },
  {
    "file": "src/routes/_app/fornitori.index.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/lead.index.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/lead.index.tsx",
    "expression": "n.delete(r.id)"
  },
  {
    "file": "src/routes/_app/marketing.campagne.tsx",
    "expression": "next.delete(id)"
  },
  {
    "file": "src/routes/_app/marketing.campagne.tsx",
    "expression": "next.delete(r.id)"
  },
  {
    "file": "src/routes/_app/marketing.segmenti.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/marketing.segmenti.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/marketing.segmenti.tsx",
    "expression": "n.delete(c.id)"
  },
  {
    "file": "src/routes/_app/marketing.segmenti.tsx",
    "expression": "n.delete(k.id)"
  },
  {
    "file": "src/routes/_app/recupero-crediti-calendario.tsx",
    "expression": "n.delete(t)"
  },
  {
    "file": "src/routes/_app/recupero-crediti-promemoria.tsx",
    "expression": "n.delete(k)"
  },
  {
    "file": "src/routes/_app/recupero-crediti-promemoria.tsx",
    "expression": "n.delete(id)"
  },
  {
    "file": "src/routes/_app/recupero-crediti.tsx",
    "expression": "n.delete(value)"
  },
  {
    "file": "src/routes/_app/richieste.tsx",
    "expression": "next.delete(id)"
  },
  {
    "file": "src/routes/_app/richieste.tsx",
    "expression": "next.delete(id)"
  },
  {
    "file": "src/routes/_app/scadenziario.tsx",
    "expression": "next.delete(r.cliente_id)"
  },
  {
    "file": "src/routes/_app/scadenziario.tsx",
    "expression": "next.delete(r.cliente_id)"
  }
] as const;
function deleteCalls(text: string, file: string) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "delete") {
      let outer: ts.Node = node;
      while (outer.parent && (ts.isPropertyAccessExpression(outer.parent) || ts.isCallExpression(outer.parent))) outer = outer.parent;
      found.push(outer.getText(source).replace(/\s+/g, " "));
    }
    ts.forEachChild(node, visit);
  }
  visit(source); return found;
}
const key = (file: string, expression: string) => `${file}::${expression}`;
test("ogni DELETE fuori dalla fonte unica deve essere un'eccezione tecnica esplicita o una collezione", () => {
  const ammessi = new Set([...tecniche, ...collezioni].map(r => key(r.file, r.expression)));
  const imprevisti: string[] = [];
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.[cm]?[tj]sx?$/.test(file) && file !== "src/lib/esito-eliminazione.ts") {
        for (const expression of deleteCalls(readFileSync(file, "utf8"), file)) {
          if (!ammessi.has(key(file, expression))) imprevisti.push(key(file, expression));
        }
      }
    }
  }
  scan("src"); expect(imprevisti).toEqual([]);
});
test("la guardia trova anche DELETE multilinea e nuovi DELETE in file con eccezioni", () => {
  const nuove = deleteCalls('await sb\n.from("clienti")\n.delete({count:"exact"}).eq("id", id)', "src/lib/push/index.ts");
  expect(nuove.length).toBe(1);
  expect(tecniche.some(r => key(r.file, r.expression) === key("src/lib/push/index.ts", nuove[0] ?? ""))).toBe(false);
});
