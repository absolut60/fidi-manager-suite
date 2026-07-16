import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const RUOLI_RICHIESTE: AppRole[] = [
  "richiedente",
  "approvatore_richieste_liv1",
  "approvatore_richieste_liv2",
  "gestore_richieste",
  "esecutore_richieste",
];

type UtenteEsistente = {
  email: string;
  ruoliDaAggiungere: AppRole[];
};

type UtenteDaCreare = {
  email: string;
  nome: string;
  cognome: string;
  storeId: string | null;
  ruoli: AppRole[];
};

const ESISTENTI: UtenteEsistente[] = [
  { email: "a.giani@gruppomade.com", ruoliDaAggiungere: ["richiedente", "approvatore_richieste_liv1", "gestore_richieste"] },
  { email: "enrico.mongiusti@madepoint.it", ruoliDaAggiungere: ["richiedente", "gestore_richieste"] },
  { email: "carlos.casuscelli@madepoint.it", ruoliDaAggiungere: ["richiedente"] },
  { email: "daniele.galliani@madepoint.it", ruoliDaAggiungere: ["richiedente"] },
  { email: "matteo.garavaglia@madepoint.it", ruoliDaAggiungere: ["richiedente"] },
];

const DA_CREARE: UtenteDaCreare[] = [
  { email: "g.bellini@gruppomade.com", nome: "Gianluca", cognome: "Bellini", storeId: null, ruoli: ["amministrazione", "richiedente", "approvatore_richieste_liv2"] },
  { email: "s.sapone@gruppomade.com", nome: "Serena", cognome: "Sapone", storeId: null, ruoli: ["amministrazione", "richiedente", "approvatore_richieste_liv2"] },
  { email: "n.albini@gruppomade.com", nome: "Nadia", cognome: "Albini", storeId: null, ruoli: ["amministrazione", "richiedente", "gestore_richieste"] },
  { email: "o.sfratta@gruppomade.com", nome: "Omar", cognome: "Sfratta", storeId: null, ruoli: ["amministrazione", "richiedente", "gestore_richieste"] },
  { email: "gabriele.doni@madepoint.it", nome: "Gabriele", cognome: "Doni", storeId: null, ruoli: ["richiedente", "esecutore_richieste"] },
  { email: "s.sassatelli@gruppomade.com", nome: "Sandra", cognome: "Sassatelli", storeId: null, ruoli: ["richiedente", "esecutore_richieste"] },
  { email: "silvia.vismara@madepoint.it", nome: "Silvia", cognome: "Vismara", storeId: null, ruoli: ["richiedente", "esecutore_richieste"] },
  { email: "sonia.bellia@madepoint.it", nome: "Sonia", cognome: "Bellia", storeId: null, ruoli: ["richiedente", "esecutore_richieste"] },
  { email: "antonio.giannubilo@madepoint.it", nome: "Antonio", cognome: "Giannubilo", storeId: null, ruoli: ["richiedente"] },
  { email: "ketty.laveni@madepoint.it", nome: "Ketty", cognome: "Laveni", storeId: null, ruoli: ["richiedente"] },
  { email: "alessio.sironi@madepoint.it", nome: "Alessio", cognome: "Sironi", storeId: "dd51b549-e15a-4d3a-bac4-38d28967c651", ruoli: ["store_manager", "richiedente"] },
  { email: "andrea.abrate@madepoint.it", nome: "Andrea", cognome: "Abrate", storeId: "111bbe8b-225a-4f38-82a8-5340395288d6", ruoli: ["store_manager", "richiedente"] },
  { email: "attilio.garavaglia@madepoint.it", nome: "Attilio", cognome: "Garavaglia", storeId: "f5d415b4-87c6-46fe-aba8-47896e3667d6", ruoli: ["store_manager", "richiedente"] },
  { email: "gianfranco.serino@madepoint.it", nome: "Gianfranco", cognome: "Serino", storeId: "7f7b0f8b-05f7-48bc-9771-ccd03214c7d8", ruoli: ["store_manager", "richiedente"] },
  { email: "luca.lopolito@madepoint.it", nome: "Luca", cognome: "Lopolito", storeId: "1b2523bf-5739-4914-abbf-60ddb4c1190c", ruoli: ["store_manager", "richiedente"] },
  { email: "maria.fatiga@madepoint.it", nome: "Maria", cognome: "Fatiga", storeId: "9cb773ac-8f95-49aa-9eb2-15a0c1337dca", ruoli: ["store_manager", "richiedente"] },
];

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "amministratore")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // paginato: cerca su tutte le pagine finché non trovato
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function aggiornaMappatura(email: string, uuidDestinazione: string, note?: string) {
  const { error } = await supabaseAdmin
    .from("migrazione_richieste_utenti")
    .update({ uuid_destinazione: uuidDestinazione, ...(note ? { note } : {}) })
    .eq("email", email);
  if (error) throw new Error(`mappatura ${email}: ${error.message}`);
}

async function aggiungiRuoli(userId: string, ruoli: AppRole[]) {
  if (ruoli.length === 0) return;
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert(
      ruoli.map((role) => ({ user_id: userId, role })),
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export const migrazioneRichiesteCreaUtenti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const pwd = process.env.MIGRAZIONE_PWD_TEMP;
    if (!pwd || pwd.length < 8) {
      throw new Error("Secret MIGRAZIONE_PWD_TEMP mancante o troppo corta (min 8 char)");
    }

    const log: Array<{ email: string; azione: string; userId?: string }> = [];

    // --- 1. Utenti già esistenti: risolvi uuid e AGGIUNGI ruoli Richieste ---
    for (const u of ESISTENTI) {
      const userId = await findUserIdByEmail(u.email);
      if (!userId) {
        log.push({ email: u.email, azione: "ERRORE: utente esistente non trovato in auth" });
        continue;
      }
      await aggiungiRuoli(userId, u.ruoliDaAggiungere);
      await aggiornaMappatura(u.email, userId, "esistente — ruoli richieste aggiunti");
      log.push({ email: u.email, azione: "ruoli richieste aggiunti", userId });
    }

    // --- 2. Utenti da creare (idempotente) ---
    for (const u of DA_CREARE) {
      let userId = await findUserIdByEmail(u.email);

      if (!userId) {
        const { data: created, error: eCreate } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: pwd,
          email_confirm: true,
          user_metadata: { nome: u.nome, cognome: u.cognome },
        });
        if (eCreate) {
          log.push({ email: u.email, azione: `ERRORE createUser: ${eCreate.message}` });
          continue;
        }
        userId = created.user?.id ?? null;
        if (!userId) {
          log.push({ email: u.email, azione: "ERRORE: createUser non ha restituito id" });
          continue;
        }
        log.push({ email: u.email, azione: "creato", userId });
      } else {
        log.push({ email: u.email, azione: "già esistente — aggiorno profilo/ruoli", userId });
      }

      // Profilo (attivo=false per tutti i 16 nuovi)
      const { error: eProf } = await supabaseAdmin
        .from("profili")
        .update({
          nome: u.nome,
          cognome: u.cognome,
          store_id: u.storeId,
          attivo: false,
        })
        .eq("id", userId);
      if (eProf) {
        log.push({ email: u.email, azione: `ERRORE profilo: ${eProf.message}`, userId });
        continue;
      }

      // Ruoli: aggiungi (upsert). Non tocchiamo ruoli preesistenti.
      await aggiungiRuoli(userId, u.ruoli);

      await aggiornaMappatura(u.email, userId, "nuovo — creato");
    }

    // Sanity: verifica quante righe di mappatura hanno uuid_destinazione
    const { count: mappate } = await supabaseAdmin
      .from("migrazione_richieste_utenti")
      .select("*", { count: "exact", head: true })
      .not("uuid_destinazione", "is", null);

    return {
      ok: true,
      mappateConDestinazione: mappate ?? 0,
      totaleAttese: 21,
      ruoliRichieste: RUOLI_RICHIESTE,
      log,
    };
  });
