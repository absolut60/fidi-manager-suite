import { expect, test, spyOn } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { logoEmailAnteprima, logoEmailInvio } from '@/lib/branding-email';
import { wrapEmailHtml, LOGO_EMAIL_URL, SEDE_FALLBACK } from '@/lib/template-email-render';
import { contenutoLogoInline } from '../supabase/functions/send-email/inline-logo';
import { buildEmailCampagna } from '@/lib/campagna-marketing-email';
import { buildPromemoriaEmail } from '@/lib/promemoria-scadenza-render';

const png = new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,255])], { type: 'image/png' });
const sede = { ...SEDE_FALLBACK, logo_email_path: 'sedi/test/logo-email.png' };
function storage({ blob = png, fail = false, throws = false } = {}) {
  const calls: string[] = [];
  const client = { storage: { from(bucket: string) {
    expect(bucket).toBe('branding');
    return {
      async download(path: string) { calls.push(`download:${path}`); if (throws) throw new Error('indisponibile'); return { data: fail ? null : blob, error: fail ? { message: 'negato' } : null }; },
      async createSignedUrl(path: string, seconds: number) { calls.push(`firma:${path}:${seconds}`); if (throws) throw new Error('negato'); return { data: fail ? null : { signedUrl: 'https://example.test/logo.png?token=preview' }, error: fail ? { message: 'negato' } : null }; },
    };
  } } } as unknown as Pick<SupabaseClient<Database>, 'storage'>;
  return { client, calls };
}

test('inline: contenuto sede solo con inlineLogo, altrimenti fallback originale', () => {
  expect(contenutoLogoInline(true, 'PNG_SEDE', 'MADE')).toBe('PNG_SEDE');
  expect(contenutoLogoInline(true, undefined, 'MADE')).toBe('MADE');
  expect(contenutoLogoInline(false, 'PNG_SEDE', 'MADE')).toBeNull();
  expect(contenutoLogoInline(undefined, 'PNG_SEDE', 'MADE')).toBeNull();
});
test('senza sede o senza logo: nessun accesso storage e nessun payload personalizzato', async () => {
  const { client, calls } = storage();
  for (const input of [null, SEDE_FALLBACK]) {
    expect(await logoEmailInvio(input, client)).toEqual({ logoEmailUrl: LOGO_EMAIL_URL });
    expect(await logoEmailAnteprima(input, client)).toEqual({ logoEmailUrl: LOGO_EMAIL_URL });
  }
  expect(calls).toEqual([]);
});
test('download privato: CID e archivio condividono esattamente i byte PNG', async () => {
  const { client, calls } = storage();
  const result = await logoEmailInvio(sede, client);
  expect(result.inlineLogoBase64).toBe('iVBORw0KGgoA/w==');
  expect(result.logoEmailUrl).toBe('data:image/png;base64,iVBORw0KGgoA/w==');
  expect(calls).toEqual(['download:sedi/test/logo-email.png']);
});
test('download negato, eccezione, file non PNG o oltre 1 MB: log e ripiego senza blocco', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    for (const options of [{ fail: true }, { throws: true }, { blob: new Blob(['non PNG']) }, { blob: new Blob([new Uint8Array(1048577)]) }]) {
      const { client } = storage(options);
      expect(await logoEmailInvio(sede, client)).toEqual({ logoEmailUrl: LOGO_EMAIL_URL });
    }
    expect(warn).toHaveBeenCalledTimes(4);
  } finally { warn.mockRestore(); }
});
test('anteprima: firma utente riuscita e ripiego silenzioso se negata', async () => {
  const ok = storage();
  expect(await logoEmailAnteprima(sede, ok.client)).toEqual({ logoEmailUrl: 'https://example.test/logo.png?token=preview' });
  expect(ok.calls).toEqual(['firma:sedi/test/logo-email.png:3600']);
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    for (const options of [{ fail: true }, { throws: true }]) expect(await logoEmailAnteprima(sede, storage(options).client)).toEqual({ logoEmailUrl: LOGO_EMAIL_URL });
    expect(warn).not.toHaveBeenCalled();
  } finally { warn.mockRestore(); }
});
test('la cornice cambia solo src in anteprima e conserva CID in invio', () => {
  const originale = wrapEmailHtml('<p>x</p>', SEDE_FALLBACK, { nome: 'A' });
  const url = 'https://example.test/logo.png?a=1&b=2';
  expect(wrapEmailHtml('<p>x</p>', { ...SEDE_FALLBACK, logoEmailUrl: url }, { nome: 'A' }))
    .toBe(originale.replace(LOGO_EMAIL_URL, 'https://example.test/logo.png?a=1&amp;b=2'));
  expect(wrapEmailHtml('<p>x</p>', { ...SEDE_FALLBACK, logoEmailUrl: url }, { nome: 'A' }, { useCid: true }))
    .toBe(wrapEmailHtml('<p>x</p>', SEDE_FALLBACK, { nome: 'A' }, { useCid: true }));
});
test('promemoria e marketing riusano logo sede con pipeline CID invariata', async () => {
  const logo = await logoEmailInvio(sede, storage().client);
  const branded = { ...SEDE_FALLBACK, logoEmailUrl: logo.logoEmailUrl };
  const marketing = { oggetto: 'Test', corpo: '<p>Test</p>', dati: {}, sede: branded, mittente: { nome: 'A' } };
  expect(buildEmailCampagna({ ...marketing, useCid: false }).html).toContain(logo.logoEmailUrl);
  expect(buildEmailCampagna({ ...marketing, useCid: true }).html).toContain('cid:logoMade');
  const promemoria = { template: { oggetto: 'Test', corpo: '<p>Test</p>' }, ragioneSociale: 'Test', scadenze: [], sede: branded, mittente: { nome: 'A' } };
  expect(buildPromemoriaEmail({ ...promemoria, useCid: false }).html).toContain(logo.logoEmailUrl);
  expect(buildPromemoriaEmail({ ...promemoria, useCid: true }).html).toContain('cid:logoMade');
});

const precedenti = [
  {
    "sede": null,
    "opts": {},
    "sha": "2a7cbbfa4d8f960c366d5960541472e75de634e0627b10440d9aa050f30c49ac"
  },
  {
    "sede": null,
    "opts": {
      "useCid": true
    },
    "sha": "82ec1acec200eaba0dc619be825eeb7cc8e2c24a5d472153d766246926391969"
  },
  {
    "sede": null,
    "opts": {
      "tipo": "sollecito_1",
      "piedeRiservatezza": true
    },
    "sha": "b22e4b6c144f3cd7f2d6e58ebfea4d62e73eb6f527778ff23d8f3b1d2788ce9e"
  },
  {
    "sede": null,
    "opts": {
      "senzaBande": true,
      "piedeRiservatezza": true
    },
    "sha": "bb298e597f2c05f8fd527e51d0bf616e6fde4a05744a04620ce7cc327c95408e"
  },
  {
    "sede": {
      "nome": "SEDE AMMINISTRATIVA",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": "02 90380000"
    },
    "opts": {},
    "sha": "2a7cbbfa4d8f960c366d5960541472e75de634e0627b10440d9aa050f30c49ac"
  },
  {
    "sede": {
      "nome": "SEDE AMMINISTRATIVA",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": "02 90380000"
    },
    "opts": {
      "useCid": true
    },
    "sha": "82ec1acec200eaba0dc619be825eeb7cc8e2c24a5d472153d766246926391969"
  },
  {
    "sede": {
      "nome": "SEDE AMMINISTRATIVA",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": "02 90380000"
    },
    "opts": {
      "tipo": "sollecito_1",
      "piedeRiservatezza": true
    },
    "sha": "b22e4b6c144f3cd7f2d6e58ebfea4d62e73eb6f527778ff23d8f3b1d2788ce9e"
  },
  {
    "sede": {
      "nome": "SEDE AMMINISTRATIVA",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": "02 90380000"
    },
    "opts": {
      "senzaBande": true,
      "piedeRiservatezza": true
    },
    "sha": "bb298e597f2c05f8fd527e51d0bf616e6fde4a05744a04620ce7cc327c95408e"
  },
  {
    "sede": {
      "nome": "SEDE TEST",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": null
    },
    "opts": {},
    "sha": "15c38e183464586552540cca9edbf715ab734e2ec88e9c960caacac59a554122"
  },
  {
    "sede": {
      "nome": "SEDE TEST",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": null
    },
    "opts": {
      "useCid": true
    },
    "sha": "c2eb8a5958c361635f8f84fca337847ac487bebd17035ecaddc31f008303bb41"
  },
  {
    "sede": {
      "nome": "SEDE TEST",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": null
    },
    "opts": {
      "tipo": "sollecito_1",
      "piedeRiservatezza": true
    },
    "sha": "61d1e5389f5bd7789575cbbe4b12cff6093cbe49e8d1dfc33c465f262cb757cd"
  },
  {
    "sede": {
      "nome": "SEDE TEST",
      "insegna": null,
      "indirizzo": "Via G. Di Vittorio, 3",
      "cap": "20003",
      "citta": "Casorezzo",
      "provincia": "MI",
      "telefono": null
    },
    "opts": {
      "senzaBande": true,
      "piedeRiservatezza": true
    },
    "sha": "c282231029bf3473abde088fcc63f5828c4b0db66534a6d0864d95cdafa19825"
  }
];
test('non regressione: 12 HTML senza logo identici byte per byte al codice precedente', () => {
  for (const precedente of precedenti) {
    for (const logoEmailUrl of [undefined, null, '', LOGO_EMAIL_URL]) {
      const dati = precedente.sede ? { ...precedente.sede, logoEmailUrl } : null;
      const html = wrapEmailHtml('<p>Corpo invariato</p>', dati, { nome: 'Operatore', email: 'operatore@example.test' }, precedente.opts);
      expect(new Bun.CryptoHasher('sha256').update(html).digest('hex')).toBe(precedente.sha);
    }
  }
});

test('sede del preventivo per store_id: lettura sede, logo e ripiego MADE', async () => {
  const { sedeEmailDaStoreId } = await import('@/lib/branding-email');
  const letti: string[] = [];
  const lettore = (riga: unknown) => ({ from(t: string) { expect(t).toBe('stores'); return { select() { return { eq(_c: string, id: string) { letti.push(id); return { async maybeSingle() { return { data: riga, error: null }; } }; } }; } }; } }) as never;
  const { client, calls } = storage();
  const ok = await sedeEmailDaStoreId('sede-prev', lettore({ ...sede, nome: 'SEDE DI LISSONE' }), client, 'invio');
  expect(letti).toEqual(['sede-prev']);
  expect(ok.inlineLogoBase64).toBe('iVBORw0KGgoA/w==');
  expect(ok.sede?.nome).toBe('SEDE DI LISSONE');
  expect(calls).toEqual(['download:sedi/test/logo-email.png']);
  expect(await sedeEmailDaStoreId(null, lettore(sede), client, 'invio')).toEqual({ sede: null });
  expect(await sedeEmailDaStoreId('x', lettore(null), client, 'anteprima')).toEqual({ sede: null });
});
