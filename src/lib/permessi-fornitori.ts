// FM62 G5: gemelli TS (solo per mostrare/nascondere comandi) dei gate SQL fornitori.
// Il controllo vero resta nel database e nelle server function.
// puoGestireFornitori ↔ public.auth_puo_gestire_fornitori()
// puoVedereArticoliFornitori ↔ public.auth_ha_accesso_preventivi()
type Ruoli = readonly string[];
export const puoGestireFornitori = (r: Ruoli) => r.some(x => x === "amministratore" || x === "preventivi_manage" || x === "amministrazione");
export const puoVedereArticoliFornitori = (r: Ruoli) => r.some(x => ["amministratore", "preventivi_manage", "preventivi_write", "preventivi_read"].includes(x));
