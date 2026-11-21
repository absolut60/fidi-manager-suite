import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/fm91-collaudo')
HELP = "Usalo quando la quantità dipende da un'altra riga del kit. Il calcolo parte dalla quantità di quella riga, per singolo pezzo, e poi applica passo, lati e confezione di questa riga. Esempi: i tasselli si calcolano dai metri di guida (riga guide ÷ passo 0,5 m); le viti dai metri di montante (riga montanti ÷ passo 0,2 m ÷ confezione 1000 × lati). Lascia 'Nessuna' per le righe che non dipendono da altre (lastre, isolante, stucco, nastro)."
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for width in (375,1280):
            context = await browser.new_context(viewport={'width':width,'height':1800}, has_touch=width==375)
            page = await context.new_page()
            errors=[]
            page.on('pageerror',lambda e: errors.append(str(e)))
            await page.goto('http://localhost:8080/verifica-kit')
            await page.get_by_role('heading',name='PARETE 75/50 LASTRE 1+1',exact=True).wait_for()
            await page.wait_for_timeout(800)
            visible = page.locator('div.lg\\:hidden') if width==375 else page.locator('div.lg\\:block')
            consumption = visible.get_by_role('textbox',name='Consumo/mq riga 2',exact=True)
            assert await consumption.input_value()=='0,7167'
            await consumption.focus()
            assert await consumption.input_value()=='0,716666666666667'
            await consumption.blur()
            assert await consumption.input_value()=='0,7167'
            assert await page.evaluate("sessionStorage.getItem('ultima-patch-kit')") is None
            await consumption.focus()
            await page.wait_for_timeout(100)
            await consumption.fill('0,716666666666668')
            await page.wait_for_timeout(100)
            print('edited value', await consumption.input_value())
            await consumption.blur()
            await page.wait_for_timeout(100)
            assert await page.evaluate("JSON.parse(sessionStorage.getItem('ultima-patch-kit')).consumo") == 0.716666666666668
            await consumption.focus()
            assert await consumption.input_value()=='0,716666666666668'
            await consumption.blur()
            assert await page.get_by_text('U.M. passo',exact=True).count()==0
            assert await page.get_by_text('Passo',exact=True).count()==0
            info=visible.get_by_role('button',name='Informazioni su Calcola dalla riga').first
            await info.scroll_into_view_if_needed()
            if width==375: await info.tap()
            else: await info.hover()
            await page.get_by_text(HELP,exact=True).wait_for()
            await page.screenshot(path=str(OUT/f'{width}-aiuto.png'))
            await page.keyboard.press('Escape')
            await visible.get_by_role('button',name='Modifica riga 2',exact=True).click()
            dialog=page.get_by_role('dialog')
            await dialog.get_by_text(HELP,exact=True).wait_for()
            assert await dialog.get_by_text('Calcola dalla riga',exact=True).count()==1
            assert await dialog.get_by_text('Valore fisso (vecchio metodo)',exact=True).count()==0
            assert await dialog.get_by_role('textbox',name='Incidenza fissa riga 2').count()==0
            assert await dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth')
            await dialog.screenshot(path=str(OUT/f'{width}-modifica.png'))
            await dialog.get_by_role('button',name='Annulla',exact=True).click()
            await page.get_by_role('button',name='Aggiungi riga',exact=True).click()
            dialog=page.get_by_role('dialog')
            status=dialog.get_by_role('status')
            assert await status.inner_text()=='Compila almeno un campo di calcolo (es. N. pezzi o Consumo)'
            assert 'text-muted-foreground' in (await status.get_attribute('class') or '')
            assert await dialog.get_by_role('alert').count()==0
            assert 'driver' not in (await dialog.inner_text()).lower()
            await dialog.screenshot(path=str(OUT/f'{width}-nuova.png'))
            await dialog.get_by_role('button',name='Annulla',exact=True).click()
            await page.evaluate('window.scrollTo(0,0)')
            await page.screenshot(path=str(OUT/f'{width}-pagina.png'))
            overflow=await page.evaluate('document.documentElement.scrollWidth-innerWidth')
            assert overflow==0,overflow
            assert not errors,errors
            print(width,'OK: etichette/aiuto, numeri pieni conservati e salvati, nessuna incidenza manuale, nuova riga grigia, overflow 0, errori 0')
            await context.close()
        await browser.close()
asyncio.run(main())
