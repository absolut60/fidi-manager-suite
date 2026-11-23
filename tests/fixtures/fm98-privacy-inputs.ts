import type { SchedaPdfInput } from '../../src/lib/scheda-pdf';
import { LOGO_MADE_BASE64 } from '../../src/lib/logo-made-base64';

// Valori sintetici nelle forme degli attuali chiamanti: cliente, QR, eventi,
// finalizzazione telematica e finalizzazione con firma grafica.
const base: SchedaPdfInput = {
  tipo: 'nuovo', ragioneSociale: 'Società di prova',
  dichiaranteNome: 'Mario', dichiaranteCognome: 'Rossi',
  luogoNascita: 'Milano', dataNascita: '01/01/1980',
  codiceFiscaleDich: 'RSSMRA80A01F205X', partitaIva: '12345678901',
  residenza: 'Via Prova 1, 20100 Milano (MI)',
  emailDich: 'prova@example.test', cellulareDich: '3330000000',
  consensoProfilazione: true, consensoMarketingMedia: false,
  consensoMarketingDiretto: true, dataFirma: '23/11/2026',
};
export const INPUT_PRIVACY_IDENTITA: Record<string, SchedaPdfInput> = {
  cliente_firma: { ...base, firmaPngDataUrl: `data:image/png;base64,${LOGO_MADE_BASE64}` },
  qr_whatsapp: { ...base, tipo: 'aggiornamento', mostraConsensoMedia: false,
    consensiCanaliMarketing: { whatsapp: true, email: false },
    ipRaccolta: '192.0.2.1', dataOraRaccolta: '23/11/2026, 11:10' },
  evento_canali: { ...base, tipo: 'aggiornamento',
    consensiCanaliMarketing: { whatsapp: false, email: true },
    consensoProfilazione: 'no', consensoMarketingMedia: 'si',
    dataFirma: new Date('2026-11-23T12:00:00Z') },
  finalizzazione_flag: { ...base, tipo: 'aggiornamento',
    consensoProfilazione: 'si', consensoMarketingDiretto: 'no',
    ipRaccolta: '192.0.2.2', dataOraRaccolta: '23/11/2026, 11:10' },
  finalizzazione_dettaglio: { ...base, tipo: 'aggiornamento', mostraConsensoMedia: false,
    dettaglioCanaliMarketing: 'Canali scelti: WhatsApp ed email.' },
};