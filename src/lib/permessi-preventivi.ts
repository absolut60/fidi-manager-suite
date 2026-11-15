// FM63 fetta 2: gemelli TS (solo per mostrare/nascondere menu e comandi) dei gate SQL preventivi.
// Il controllo vero resta nel database (RLS e RPC).
// haAccessoPreventivi      ↔ public.auth_ha_accesso_preventivi() (ricerca clienti, cantieri, numerazioni)
// puoConsultarePreventivi  ↔ public.auth_consulta_preventivi()   (lettura preventivi/ordini/catalogo/fornitori; + store_manager, showroom, responsabile_showroom, 0231)
// puoVedereFornitori       ↔ public.auth_ha_accesso_fornitori()  (consultazione OR amministrazione)
// puoScriverePreventivi    ↔ public.auth_puo_scrivere_preventivo(agente, linea), incluso responsabile_showroom (0231), senza i controlli agente e linea (li fa il DB)
// puoGestireAnagrafichePreventivi ↔ public.auth_puo_gestire_anagrafiche_prev() (kit, listini, articoli)
type Ruoli = readonly string[];
/** FM68: gemello di public.auth_preventivista(); non concede accesso ai clienti. */
export const è_preventivista = (roles: Ruoli) => roles.includes("preventivi_write") || roles.includes("preventivi_manage");
/** Le aggiunte della 0210 consentono UPDATE solo al creatore; i permessi precedenti restano validi. */
export const puoModificareRecordPreventivista = (roles: Ruoli, createdBy: string | null | undefined, userId: string | null | undefined, permessoPreesistente: boolean) =>
  permessoPreesistente || (è_preventivista(roles) && !!userId && createdBy === userId);
const RUOLI_PREVENTIVI = ["amministratore", "preventivi_manage", "preventivi_write", "preventivi_read"];
export const haAccessoPreventivi = (r: Ruoli) => r.some((x) => RUOLI_PREVENTIVI.includes(x));
export const puoConsultarePreventivi = (r: Ruoli) => haAccessoPreventivi(r) || r.includes("store_manager") || r.includes("showroom") || r.includes("responsabile_showroom");
export const puoVedereFornitori = (r: Ruoli) => puoConsultarePreventivi(r) || r.includes("amministrazione");
export const puoScriverePreventivi = (r: Ruoli) => r.some((x) => ["amministratore", "preventivi_manage", "preventivi_write", "responsabile_showroom"].includes(x));
export const puoGestireAnagrafichePreventivi = (r: Ruoli) => r.some((x) => x === "amministratore" || x === "preventivi_manage");
/** Scontistica di base del fornitore: gemello SQL auth_puo_modificare_sconti_base_fornitore(); salvataggio solo via aggiorna_sconti_base_fornitore. */
export const puoModificareScontiBaseFornitore = (r: Ruoli) => puoGestireAnagrafichePreventivi(r) || r.includes("responsabile_showroom");

/** Scrittura legata al proprio agente solo in assenza di altri ruoli che concedono scrittura. */
export const scritturaPreventiviVincolataAgente = (r: Ruoli) =>
  r.includes("preventivi_write") && !puoScriverePreventivi(r.filter(x => x !== "preventivi_write"));

/** Blocco del nuovo documento per il solo preventivi_write senza codice agente nel profilo. */
export const writeOnlyMissingCodice = (r: Ruoli, codiceAgente: string | null | undefined) =>
  scritturaPreventiviVincolataAgente(r) && !codiceAgente;

// FM65 punto 3: unica fonte della modificabilità della scheda preventivo (salvataggio automatico invariato).
// Confermati e ordini sono in sola lettura; il controllo vero resta nel database (RLS preventivi_update).
export const preventivoModificabile = (prev: { stato: string; tipo: string }, puoScrivere: boolean) =>
  puoScrivere && prev.stato !== "confermato" && prev.tipo !== "ordine";
