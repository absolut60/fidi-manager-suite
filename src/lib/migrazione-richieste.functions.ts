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

// =========================================================================
// STRATO 3 — Migrazione DATI e FILE dal progetto esterno RICHIESTE MADE
// Idempotente e ri-eseguibile.
// =========================================================================

const SEDE_MAP: Record<string, string> = {
  "28480450-2050-4649-b934-c2483d74a0f9": "f5d415b4-87c6-46fe-aba8-47896e3667d6",
  "90701cbd-d152-4c2b-8679-172ea2ba5d6c": "dd51b549-e15a-4d3a-bac4-38d28967c651",
  "bcdfcc74-6500-492b-b120-ae80e547052a": "c434096f-3bf0-45ce-ab7e-e631992fe13a",
  "ab2e0571-4da8-41bf-ae7b-b65565226297": "7f7b0f8b-05f7-48bc-9771-ccd03214c7d8",
  "72d78ee2-832c-43e9-8cd8-e008ae5c75b6": "1b2523bf-5739-4914-abbf-60ddb4c1190c",
  "46775ef2-20ad-4c56-80f1-68d51d1897ad": "9cb773ac-8f95-49aa-9eb2-15a0c1337dca",
  "2e3297e9-374f-458a-beba-7f7fb57dc298": "21764518-0d22-461d-bf50-4933f47b56bb",
  "86053474-3aab-425f-9a63-fca44ad5f88a": "3c57ae39-1f3a-4085-96ef-2f2d2c4c8221",
  "eebe0ab6-ee9e-4318-8fb7-ea5e8a00970c": "111bbe8b-225a-4f38-82a8-5340395288d6",
};

const FORNITORI_ESCLUSI = new Set(
  ["Fornitore Test SRL", "Mario Rossi", "ma", "pippo", "fragola srl", "Altra Azienda SPA"].map((s) => s.toLowerCase()),
);

function makeSourceClient() {
  const url = process.env.RICHIESTE_SUPABASE_URL;
  const key = process.env.RICHIESTE_SERVICE_KEY;
  if (!url || !key) throw new Error("Secret RICHIESTE_SUPABASE_URL / RICHIESTE_SERVICE_KEY mancanti");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
}

async function assertAdminUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "amministratore").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accesso riservato agli amministratori");
}

async function loadUserMap(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("migrazione_richieste_utenti").select("uuid_origine, uuid_destinazione").not("uuid_destinazione", "is", null);
  if (error) throw new Error(error.message);
  const m = new Map<string, string>();
  for (const r of data ?? []) if (r.uuid_origine && r.uuid_destinazione) m.set(r.uuid_origine, r.uuid_destinazione);
  return m;
}

function mapUuid(m: Map<string, string>, u: string | null | undefined): string | null {
  if (!u) return null;
  return m.get(u) ?? null;
}

function mapSede(u: string | null | undefined): string | null {
  if (!u) return null;
  return SEDE_MAP[u] ?? null;
}

function newAllegatoPath(oldPath: string): string {
  // origine: {uuid_utente}/{uuid_richiesta}/{ts}_{nome}  →  {uuid_richiesta}/{ts}_{nome}
  const parts = oldPath.split("/");
  if (parts.length <= 1) return oldPath;
  return parts.slice(1).join("/");
}

export const migrazioneRichiesteDati = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUser(context.userId);
    const src = makeSourceClient();
    const userMap = await loadUserMap();
    const unmapped = new Set<string>();
    const log: string[] = [];

    // A) FORNITORI
    const { data: fornSrc, error: eF } = await src.from("fornitori").select("nome");
    if (eF) throw new Error(`fornitori src: ${eF.message}`);
    const fornRows = (fornSrc ?? [])
      .filter((r) => r.nome && !FORNITORI_ESCLUSI.has(String(r.nome).trim().toLowerCase()))
      .map((r) => ({ nome: String(r.nome).trim() }));
    if (fornRows.length > 0) {
      const { error } = await supabaseAdmin.from("fornitori").upsert(fornRows, { onConflict: "nome", ignoreDuplicates: true });
      if (error) throw new Error(`fornitori upsert: ${error.message}`);
    }
    log.push(`fornitori migrati: ${fornRows.length} (esclusi ${(fornSrc?.length ?? 0) - fornRows.length})`);

    // B) RICHIESTE — migra TUTTE le righe. Se un uuid utente non è mappato,
    // metto NULL sulla FK e conservo il *_name testuale (loggando il caso).
    const { data: reqSrc, error: eR } = await src.from("requests").select("*");
    if (eR) throw new Error(`requests src: ${eR.message}`);
    const reqRows: Record<string, unknown>[] = [];
    for (const r of (reqSrc ?? []) as Record<string, unknown>[]) {
      const requesterOrig = r.requester_id as string | null;
      const requesterDest = mapUuid(userMap, requesterOrig);
      if (requesterOrig && !requesterDest) {
        unmapped.add(requesterOrig);
        log.push(`richiesta ${r.id} — requester_id non mappato (${requesterOrig}), FK=NULL, requester_name conservato="${r.requester_name}"`);
      }
      const respOrig = r.resp_approver_id as string | null;
      const respDest = mapUuid(userMap, respOrig);
      if (respOrig && !respDest) unmapped.add(respOrig);
      const dirOrig = r.dir_approver_id as string | null;
      const dirDest = mapUuid(userMap, dirOrig);
      if (dirOrig && !dirDest) unmapped.add(dirOrig);

      reqRows.push({
        id: r.id,
        requester_id: requesterDest,
        requester_name: r.requester_name,
        sede_id: mapSede(r.sede_id as string | null),
        sede_name: r.sede_name,
        title: r.title,
        type: r.type,
        description: r.description,
        amount: r.amount,
        fornitore: r.fornitore,
        status: r.status,
        resp_approver_id: respDest,
        resp_approver_name: r.resp_approver_name,
        resp_note: r.resp_note,
        resp_action: r.resp_action,
        resp_at: r.resp_at,
        dir_approver_id: dirDest,
        dir_approver_name: r.dir_approver_name,
        dir_note: r.dir_note,
        dir_action: r.dir_action,
        dir_at: r.dir_at,
        admin_status: r.admin_status,
        admin_note: r.admin_note,
        admin_at: r.admin_at,
        admin_by_name: r.admin_by_name,
        sent_to_gestionale: r.sent_to_gestionale ?? false,
        gestionale_ref: r.gestionale_ref,
        gestionale_sent_at: r.gestionale_sent_at,
        archived: r.archived ?? false,
        archived_at: r.archived_at,
        archived_by_name: r.archived_by_name,
        created_at: r.created_at,
        updated_at: r.updated_at,
      });
    }
    if (reqRows.length > 0) {
      const { error } = await supabaseAdmin.from("richieste_interne").upsert(reqRows as never, { onConflict: "id" });
      if (error) throw new Error(`richieste upsert: ${error.message}`);
    }
    log.push(`richieste migrate: ${reqRows.length} (totale sorgente: ${reqSrc?.length ?? 0})`);

    // Set of request IDs migrated → filtro per messaggi/allegati
    const validReqIds = new Set(reqRows.map((r) => r.id as string));

    // C) MESSAGGI (tabella sorgente: messaggi_richiesta)
    const { data: msgSrc, error: eM } = await src.from("messaggi_richiesta").select("*");
    if (eM) throw new Error(`messaggi_richiesta src: ${eM.message}`);
    let msgSkipped = 0;
    const msgRows: Record<string, unknown>[] = [];
    for (const m of (msgSrc ?? []) as Record<string, unknown>[]) {
      if (!validReqIds.has(m.request_id as string)) { msgSkipped++; continue; }
      const mitOrig = m.mittente_id as string | null;
      const mitDest = mapUuid(userMap, mitOrig);
      if (mitOrig && !mitDest) unmapped.add(mitOrig);
      const lettoDaSrc = (m.letto_da as string[] | null) ?? [];
      const lettoDaDest: string[] = [];
      for (const u of lettoDaSrc) {
        const d = mapUuid(userMap, u);
        if (d) lettoDaDest.push(d);
        else unmapped.add(u);
      }
      msgRows.push({
        id: m.id,
        request_id: m.request_id,
        mittente_id: mitDest,
        mittente_name: m.mittente_name,
        mittente_ruolo: m.mittente_ruolo,
        destinatario: m.destinatario,
        testo: m.testo,
        tipo: m.tipo ?? "messaggio",
        letto_da: lettoDaDest,
        created_at: m.created_at,
      });
    }
    if (msgRows.length > 0) {
      const { error } = await supabaseAdmin.from("richieste_interne_messaggi").upsert(msgRows as never, { onConflict: "id" });
      if (error) throw new Error(`messaggi upsert: ${error.message}`);
    }
    log.push(`messaggi migrati: ${msgRows.length} (skipped ${msgSkipped})`);

    // D) ALLEGATI (righe)
    const { data: attSrc, error: eA } = await src.from("attachments").select("*");
    if (eA) throw new Error(`attachments src: ${eA.message}`);
    let attSkipped = 0;
    const attRows: Record<string, unknown>[] = [];
    for (const a of (attSrc ?? []) as Record<string, unknown>[]) {
      if (!validReqIds.has(a.request_id as string)) { attSkipped++; continue; }
      const uploOrig = a.uploaded_by as string | null;
      const uploDest = mapUuid(userMap, uploOrig);
      if (uploOrig && !uploDest) unmapped.add(uploOrig);
      const oldPath = String(a.storage_path ?? "");
      attRows.push({
        id: a.id,
        request_id: a.request_id,
        nome_file: a.file_name,
        storage_path: newAllegatoPath(oldPath),
        mime_type: a.file_type,
        dimensione_bytes: a.file_size,
        caricato_da: uploDest,
        created_at: a.created_at,
      });
    }
    if (attRows.length > 0) {
      const { error } = await supabaseAdmin.from("richieste_interne_allegati").upsert(attRows as never, { onConflict: "id" });
      if (error) throw new Error(`allegati upsert: ${error.message}`);
    }
    log.push(`allegati (righe) migrati: ${attRows.length} (skipped ${attSkipped})`);

    return {
      ok: true,
      fornitoriMigrati: fornRows.length,
      richiesteMigrate: reqRows.length,
      richiesteSorgente: reqSrc?.length ?? 0,
      messaggiMigrati: msgRows.length,
      allegatiMigrati: attRows.length,
      unmappedUuids: Array.from(unmapped),
      log,
    };
  });

export const migrazioneRichiesteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUser(context.userId);
    const src = makeSourceClient();

    // Legge tutti gli allegati origine (per il path origine) + le righe destinazione (per path nuovo)
    const { data: attSrc, error: eA } = await src.from("attachments").select("id, storage_path, file_type");
    if (eA) throw new Error(`attachments src: ${eA.message}`);
    const { data: attDest, error: eD } = await supabaseAdmin
      .from("richieste_interne_allegati").select("id, storage_path, mime_type");
    if (eD) throw new Error(`allegati dest: ${eD.message}`);

    const destById = new Map((attDest ?? []).map((r) => [r.id, r]));

    let copied = 0, skipped = 0, failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const a of (attSrc ?? []) as Array<{ id: string; storage_path: string; file_type: string | null }>) {
      const dest = destById.get(a.id);
      if (!dest) { skipped++; continue; } // riga non migrata (es. richiesta skipped)

      const srcPath = a.storage_path;
      const dstPath = dest.storage_path;
      const contentType = dest.mime_type ?? a.file_type ?? "application/octet-stream";

      // Check esistenza destinazione (folder + filename)
      try {
        const dirIdx = dstPath.lastIndexOf("/");
        const dir = dirIdx >= 0 ? dstPath.slice(0, dirIdx) : "";
        const name = dirIdx >= 0 ? dstPath.slice(dirIdx + 1) : dstPath;
        const { data: exists } = await supabaseAdmin.storage.from("richieste-allegati").list(dir, { limit: 1000, search: name });
        if (exists && exists.some((e) => e.name === name)) {
          skipped++;
          continue;
        }
      } catch { /* ignora, prova upload */ }

      // Download
      const { data: blob, error: eDown } = await src.storage.from("richieste-allegati").download(srcPath);
      if (eDown || !blob) {
        failed++;
        errors.push({ id: a.id, error: `download ${srcPath}: ${eDown?.message ?? "no data"}` });
        continue;
      }

      // Upload
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { error: eUp } = await supabaseAdmin.storage
        .from("richieste-allegati")
        .upload(dstPath, bytes, { contentType, upsert: false });
      if (eUp) {
        if (/exists|duplicate/i.test(eUp.message)) { skipped++; continue; }
        failed++;
        errors.push({ id: a.id, error: `upload ${dstPath}: ${eUp.message}` });
        continue;
      }
      copied++;
    }

    return { ok: true, copied, skipped, failed, errors };
  });
