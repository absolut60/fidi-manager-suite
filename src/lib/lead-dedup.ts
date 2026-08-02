import { supabase } from "@/integrations/supabase/client";

/**
 * Deduplica base "in ingresso" per il modulo Lead.
 * Versione locale e isolata: sarà promossa a risolutore identità condiviso
 * in uno strato successivo. Non modifica nulla, esegue solo ricerche.
 */

/** Placeholder anagrafici da ignorare sempre. */
const PLACEHOLDER = new Set(["102730", "102729"]);

export function normalizzaCodice(v?: string | null): string {
  if (!v) return "";
  const n = v.replace(/[\s.\-/]/g, "").toUpperCase();
  return PLACEHOLDER.has(n) ? "" : n;
}

export function normalizzaEmail(v?: string | null): string {
  if (!v) return "";
  return v.trim().toLowerCase();
}

/** Ripulisce il testo dai caratteri che rompono la sintassi `.or()` di PostgREST. */
function sanitizzaTesto(v?: string | null): string {
  if (!v) return "";
  return v.replace(/[%,()*]/g, " ").trim();
}

export type DedupMatch = {
  entita: "lead" | "cliente" | "contatto";
  id: string;
  /** id da usare per il link (per i contatti è il cliente_id, null se il contatto appartiene solo a un lead) */
  linkId: string | null;
  etichetta: string;
  campo: "partita_iva" | "codice_fiscale" | "email" | "nome";
  valore: string;
};

export type DedupInput = {
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  email?: string | null;
  /** ricerca testuale su ragione sociale / nome / cognome (opzionale) */
  nome?: string | null;
  /** id del lead corrente da escludere (in modifica) */
  escludiLeadId?: string | null;
};

function nomeDa(r: { ragione_sociale?: string | null; nome?: string | null; cognome?: string | null }) {
  if (r.ragione_sociale?.trim()) return r.ragione_sociale.trim();
  const pf = `${r.nome ?? ""} ${r.cognome ?? ""}`.trim();
  return pf || "(senza nome)";
}

/** Cerca corrispondenze normalizzate su lead, clienti e contatti. */
export async function cercaDuplicati(input: DedupInput): Promise<DedupMatch[]> {
  const piva = normalizzaCodice(input.partitaIva);
  const cf = normalizzaCodice(input.codiceFiscale);
  const email = normalizzaEmail(input.email);
  const nome = sanitizzaTesto(input.nome);
  if (!piva && !cf && !email && nome.length < 2) return [];

  const out: DedupMatch[] = [];
  const push = (m: DedupMatch) => {
    if (!out.some((x) => x.entita === m.entita && x.id === m.id && x.campo === m.campo)) out.push(m);
  };

  const comuni: string[] = [];
  if (piva) comuni.push(`partita_iva.ilike.%${piva}%`);
  if (cf) comuni.push(`codice_fiscale.ilike.%${cf}%`);
  if (email) comuni.push(`email.ilike.${email}`);

  const cercaNome = nome.length >= 2;
  const filtroLead = [
    ...comuni,
    ...(cercaNome
      ? [`ragione_sociale.ilike.%${nome}%`, `nome.ilike.%${nome}%`, `cognome.ilike.%${nome}%`]
      : []),
  ].join(",");
  const filtroClienti = [
    ...comuni,
    ...(cercaNome ? [`ragione_sociale.ilike.%${nome}%`] : []),
  ].join(",");
  const filtroContatti = [
    ...(cf ? [`codice_fiscale.ilike.%${cf}%`] : []),
    ...(email ? [`email.ilike.${email}`] : []),
    ...(cercaNome ? [`nome.ilike.%${nome}%`, `cognome.ilike.%${nome}%`] : []),
  ].join(",");

  const [leadRes, clientiRes, contattiRes] = await Promise.all([
    supabase
      .from("lead")
      .select("id, ragione_sociale, nome, cognome, partita_iva, codice_fiscale, email")
      .or(filtroLead)
      .limit(20),
    supabase
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, codice_fiscale, email")
      .or(filtroClienti)
      .limit(20),
    filtroContatti
      ? supabase
          .from("contatti")
          .select("id, cliente_id, nome, cognome, codice_fiscale, email")
          .or(filtroContatti)
          .limit(20)
      : Promise.resolve({ data: [] as { id: string; cliente_id: string | null; nome: string | null; cognome: string | null; codice_fiscale: string | null; email: string | null }[] }),
  ]);

  const testoCombacia = (r: { ragione_sociale?: string | null; nome?: string | null; cognome?: string | null }) => {
    if (!cercaNome) return false;
    const n = nome.toLowerCase();
    return [r.ragione_sociale, r.nome, r.cognome, `${r.nome ?? ""} ${r.cognome ?? ""}`]
      .some((v) => (v ?? "").toLowerCase().includes(n));
  };

  const controlla = (
    entita: DedupMatch["entita"],
    id: string,
    linkId: string | null,
    etichetta: string,
    row: {
      partita_iva?: string | null;
      codice_fiscale?: string | null;
      email?: string | null;
      ragione_sociale?: string | null;
      nome?: string | null;
      cognome?: string | null;
    },
  ) => {
    if (piva && normalizzaCodice(row.partita_iva) === piva) {
      push({ entita, id, linkId, etichetta, campo: "partita_iva", valore: piva });
    }
    if (cf && normalizzaCodice(row.codice_fiscale) === cf) {
      push({ entita, id, linkId, etichetta, campo: "codice_fiscale", valore: cf });
    }
    if (email && normalizzaEmail(row.email) === email) {
      push({ entita, id, linkId, etichetta, campo: "email", valore: email });
    }
    if (testoCombacia(row)) {
      push({ entita, id, linkId, etichetta, campo: "nome", valore: nome });
    }
  };

  for (const l of leadRes.data ?? []) {
    if (input.escludiLeadId && l.id === input.escludiLeadId) continue;
    controlla("lead", l.id, l.id, nomeDa(l), l);
  }
  for (const c of clientiRes.data ?? []) {
    controlla("cliente", c.id, c.id, nomeDa(c), c);
  }
  for (const c of contattiRes.data ?? []) {
    controlla("contatto", c.id, c.cliente_id, nomeDa(c), c);
  }

  return out;
}

export type SoggettoTrovato = {
  tipo: "cliente" | "lead";
  id: string;
  etichetta: string;
  /** dettaglio secondario da mostrare (P.IVA / email / città) */
  dettaglio: string | null;
};

/**
 * Ricerca unificata clienti + lead per il risolutore identità.
 * Cerca su ragione sociale, nome, cognome, P.IVA, codice fiscale ed email.
 */
export async function cercaSoggetti(
  query: string,
  limite = 20,
): Promise<SoggettoTrovato[]> {
  const q = sanitizzaTesto(query);
  if (q.length < 2) return [];
  const codice = normalizzaCodice(q);

  const ors = (campi: string[]) =>
    [
      ...campi.map((c) => `${c}.ilike.%${q}%`),
      ...(codice && codice !== q.toUpperCase()
        ? ["partita_iva", "codice_fiscale"]
            .filter((c) => campi.includes(c))
            .map((c) => `${c}.ilike.%${codice}%`)
        : []),
    ].join(",");

  const [clientiRes, leadRes] = await Promise.all([
    supabase
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, email, citta")
      .or(ors(["ragione_sociale", "partita_iva", "codice_fiscale", "email"]))
      .order("ragione_sociale")
      .limit(limite),
    supabase
      .from("lead")
      .select("id, ragione_sociale, nome, cognome, partita_iva, email, citta")
      .or(ors(["ragione_sociale", "nome", "cognome", "partita_iva", "codice_fiscale", "email"]))
      .order("created_at", { ascending: false })
      .limit(limite),
  ]);

  const out: SoggettoTrovato[] = [];
  for (const c of clientiRes.data ?? []) {
    out.push({
      tipo: "cliente",
      id: c.id,
      etichetta: nomeDa(c),
      dettaglio: c.partita_iva || c.email || c.citta || null,
    });
  }
  for (const l of leadRes.data ?? []) {
    out.push({
      tipo: "lead",
      id: l.id,
      etichetta: nomeDa(l),
      dettaglio: l.partita_iva || l.email || l.citta || null,
    });
  }
  return out.slice(0, limite * 2);
}

export const DEDUP_CAMPO_LABEL: Record<DedupMatch["campo"], string> = {
  partita_iva: "P.IVA",
  codice_fiscale: "C.F.",
  email: "email",
  nome: "denominazione",
};
