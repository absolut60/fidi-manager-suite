// FM62 G5: gemelli TS (solo per mostrare/nascondere comandi) dei gate SQL fornitori.
// Il controllo vero resta nel database e nelle server function.
// puoGestireFornitori ↔ public.auth_puo_gestire_fornitori()
// puoVedereArticoliFornitori ↔ public.auth_consulta_preventivi() (FM63: anche store_manager)
// puoCambiareConvenzione ↔ public.has_role(auth.uid(),'amministratore') in imposta_stato_convenzione_fornitori
import { puoConsultarePreventivi } from "./permessi-preventivi";
type Ruoli = readonly string[];
export const puoCambiareConvenzione = (r: Ruoli) => r.includes("amministratore");
export const puoGestireFornitori = (r: Ruoli) => r.some(x => x === "amministratore" || x === "preventivi_manage" || x === "amministrazione");
export const puoVedereArticoliFornitori = (r: Ruoli) => puoConsultarePreventivi(r);
