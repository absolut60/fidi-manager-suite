import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const leggi = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
test("chat: riga verificata prima del file, nessun aggiornamento messaggio se negata", () => {
  const code = leggi("src/components/chat/canale-conversazione.tsx").split("async function eliminaMessaggio")[1]?.split("const puoInviare")[0] ?? "";
  const stop = code.indexOf('if (esito.tipo !== "eliminato")');
  expect(stop).toBeGreaterThan(code.indexOf('eliminaConEsito("allegati"'));
  expect(code.indexOf('return;', stop)).toBeLessThan(code.indexOf('.storage.from'));
  expect(code.indexOf('.from("messaggi")')).toBeGreaterThan(code.indexOf('.storage.from'));
});
test("promessa: scollegamento tutti gli id, errore e ricarica precedono aggiunte e successo", () => {
  const code = leggi("src/components/modifica-azione-dialog.tsx").split('if (daTogliere.length > 0)')[1]?.split('toast.success("Azione aggiornata")')[0] ?? "";
  expect(code).toContain('richiesti: daTogliere.length');
  expect(code).toContain('q.eq("azione_id", azione.id).in("scadenza_id", daTogliere)');
  expect(code.indexOf('setScadSel(new Set(ids))')).toBeGreaterThan(code.indexOf('esito.tipo !== "eliminato"'));
  expect(code.indexOf('return;')).toBeLessThan(code.indexOf('if (daAggiungere.length > 0)'));
});
test("entrambi i percorsi ruoli: nuovi ruoli solo dopo eliminazione completa; vuoto non esegue DELETE", () => {
  const code = leggi("src/lib/utenti.functions.ts");
  for (const part of [code.split('export const creaUtente')[1]?.split('/** Aggiorna la password')[0], code.split('export const updateUtenteRuoli')[1]?.split('/** FM44:')[0]]) {
    const text = part ?? ""; expect(text).toContain('if (vecchiRuoli > 0)');
    const guardia = text.indexOf('if (esito.tipo !== "eliminato") throw');
    expect(guardia).toBeGreaterThan(text.indexOf('eliminaConEsito("user_roles"'));
    expect(text.indexOf('.insert(data.ruoli')).toBeGreaterThan(guardia);
  }
});
test("push negato: esito al chiamante prima di unsubscribe; dispositivo negato non dichiara successo", () => {
  const code = leggi("src/lib/push/index.ts").split('export async function unsubscribeFromPush')[1] ?? "";
  expect(code).toContain('if (esito.tipo !== "eliminato") return { ok: false, reason: messaggioEsitoEliminazione');
  expect(code.indexOf('if (esito.tipo !== "eliminato")')).toBeLessThan(code.indexOf('if (sub) await sub.unsubscribe()'));
  expect(leggi("src/routes/_app/attiva-notifiche.tsx")).toContain('if (!esito.ok)');
});
