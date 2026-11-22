"""Collaudo sulla route temporanea /verifica-fm95, che importa fixtures/fm95-gamma-ui.tsx.
Nessuna richiesta di scrittura raggiunge il database. Rimuovere la route dopo la prova.
"""
import asyncio
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/fm95b')

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width, height in [(320,760),(375,812),(390,844),(768,1024),(1280,1800),(1920,1800)]:
            errors = []
            context = await browser.new_context(viewport={'width':width,'height':height})
            page = await context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            async def rest(route):
                table = urlparse(route.request.url).path.split('/rest/v1/')[-1]
                assert route.request.method == 'GET' or table in ['rpc/anteprima_numero_ordine','rpc/cerca_clienti_preventivo'], f'Richiesta non prevista: {route.request.method} {table}'
                if table == 'rpc/anteprima_numero_ordine':
                    data = 'ORD-PROVA/26'
                elif table == 'stores':
                    data = [{'id':'00000000-0000-0000-0000-000000000095','nome':'Sede prova','codice':'LI'}]
                elif table == 'configurazioni':
                    data = []
                else:
                    data = []
                await route.fulfill(status=200,json=data)
            await page.route('**/rest/v1/**',rest)
            await page.goto('http://localhost:8080/verifica-fm95',wait_until='domcontentloaded')
            campo = page.get_by_role('textbox',name='Codice SDI (fatturazione elettronica)',exact=True)
            await campo.wait_for()
            await page.wait_for_function("() => { const el = document.querySelector('input'); return el && Object.keys(el).some(k => k.startsWith('__reactProps')); }")
            await campo.fill('ab')
            assert await campo.input_value() == 'AB'
            await page.get_by_text('Il codice SDI deve avere 7 caratteri.',exact=False).wait_for()
            await page.screenshot(path=str(OUT/f'{width}-sdi-avviso.png'))
            await campo.fill('abc1234')
            assert await campo.input_value() == 'ABC1234'
            await page.screenshot(path=str(OUT/f'{width}-sdi.png'))
            await page.get_by_role('button',name='Prova pronta',exact=True).click()
            dialog = page.get_by_role('dialog',name='File Gamma di prova')
            await dialog.get_by_text('Pronto per Gamma',exact=True).wait_for()
            await dialog.screenshot(path=str(OUT/f'{width}-pronta.png'))
            async with page.expect_download() as download:
                await dialog.get_by_role('button',name='Scarica file .xls',exact=True).click()
            file = await download.value
            assert file.suggested_filename.endswith('.xls')
            path = OUT/f'{width}-scaricato.xls'
            await file.save_as(path)
            assert path.stat().st_size > 0
            assert path.read_bytes()[:8] == bytes.fromhex('D0CF11E0A1B11AE1')
            await dialog.get_by_role('button',name='Chiudi',exact=True).first.click()
            await page.get_by_role('button',name='Prova bloccata',exact=True).click()
            dialog = page.get_by_role('dialog',name='File Gamma di prova')
            await dialog.get_by_text('Non esportabile',exact=True).wait_for()
            assert await dialog.get_by_role('button',name='Scarica file .xls',exact=True).count() == 0
            assert 'Articolo di prova con una descrizione' in await dialog.inner_text()
            assert (await dialog.inner_text()).index('Da completare') < (await dialog.inner_text()).index('Da verificare')
            await dialog.screenshot(path=str(OUT/f'{width}-bloccata.png'))
            bounds = await dialog.bounding_box()
            assert bounds and bounds['width'] <= width and bounds['height'] <= height+1
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await dialog.get_by_role('button',name='Chiudi',exact=True).first.click()
            await page.get_by_role('button',name='Nuovo ordine',exact=True).click()
            nuovo = page.get_by_role('dialog',name='Nuovo ordine')
            await nuovo.get_by_role('button',name='Lead',exact=True).click()
            await nuovo.get_by_role('button',name='Nuovo lead',exact=True).click()
            rapido = nuovo.get_by_role('textbox',name='Codice SDI (fatturazione elettronica)',exact=True)
            await rapido.fill('abc1234')
            assert await rapido.input_value() == 'ABC1234'
            await rapido.screenshot(path=str(OUT/f'{width}-ordine-lead-sdi.png'))
            assert await nuovo.get_by_role('button',name='Crea ordine',exact=True).is_disabled()
            await nuovo.get_by_role('button',name='Annulla',exact=True).click()
            assert not errors, errors
            print(width,'OK: SDI normalizzato, pronto/scarico BIFF8, bloccato senza scarico, nuovo ordine a lead, nessun overflow/errori')
            await context.close()
        await browser.close()

asyncio.run(main())