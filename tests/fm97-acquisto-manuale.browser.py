"""Route temporanea /verifica-fm97-acquisto: UI reale, risposte fornitore locali, nessuna scrittura DB."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/fm97-acquisto')
OUT.mkdir(parents=True, exist_ok=True)

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True)
  for width, height in [(375,812),(768,1024),(1280,1800)]:
   context = await browser.new_context(viewport={'width':width,'height':height},has_touch=width==768)
   page = await context.new_page(); errors=[]; writes=[]
   page.on('pageerror',lambda e: errors.append(str(e)))
   async def rest(route):
    table=route.request.url.split('/rest/v1/')[-1].split('?')[0]
    if route.request.method not in ['GET','HEAD']: writes.append(table)
    result=[]
    if table=='fornitori':
     value={'id':'97000000-0000-0000-0000-000000000001','ragione_sociale':'Fornitore prova','alias':None,'sconti_base':[10,5,2,1]}
     result=value if 'vnd.pgrst.object' in route.request.headers.get('accept','') else [value]
    await route.fulfill(status=200,json=result)
   await page.route('**/rest/v1/**',rest)
   await page.goto('http://localhost:8080/verifica-fm97-acquisto',wait_until='domcontentloaded')
   await page.get_by_role('button',name='Apri riga',exact=True).wait_for()
   await page.wait_for_timeout(500)
   await page.get_by_role('button',name='Apri riga',exact=True).click()
   dialog=page.get_by_role('dialog')
   await page.get_by_label('Costo netto (€)',exact=True).wait_for()
   assert await page.get_by_label('Costo netto (€)',exact=True).input_value()=='25,0000'
   await page.get_by_label('Listino fornitore (€)',exact=True).fill('100')
   assert await page.get_by_label('Costo netto (€)',exact=True).input_value()=='100,0000'
   assert await page.get_by_label('Costo netto (€)',exact=True).get_attribute('readonly') is not None
   for label,value in [('Sc. 1 %','10'),('Sc. 2 %','5'),('Sc. 3 %','2'),('Magg. %','3'),('Magg. €','1,5')]:
    await page.get_by_label(label,exact=True).fill(value)
   assert await page.get_by_label('Costo netto (€)',exact=True).input_value()=='87,8037'
   assert await page.get_by_label('Sconto dal listino',exact=True).input_value()==''
   await page.get_by_text('Prezzo di acquisto',exact=True).scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{width}-acquisto.png'))
   await page.get_by_text('Prezzo di vendita',exact=True).scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{width}-vendita.png'))
   await page.get_by_label('Costo netto (€)',exact=True).scroll_into_view_if_needed()
   await page.get_by_label('Costo netto (€)',exact=True).screenshot(path=str(OUT/f'{width}-costo-netto.png'))
   assert await dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'), 'overflow finestra'
   await dialog.get_by_role('button',name='Salva',exact=True).click()
   saved=json.loads(await page.get_by_test_id('salvato').inner_text())
   assert saved['costo']==878.037 and saved['listino_fornitore']==100
   assert saved['sconti_gamma']==[] and saved['prezzo_unit']==120
   await page.get_by_role('button',name='Apri riga',exact=True).click()
   assert await page.get_by_label('Sc. 1 %',exact=True).input_value()=='10,00'
   assert await page.get_by_label('Costo netto (€)',exact=True).input_value()=='87,8037'
   await page.get_by_label('Listino fornitore (€)',exact=True).fill('')
   await page.get_by_label('Costo netto (€)',exact=True).fill('25')
   await dialog.get_by_role('button',name='Salva',exact=True).click()
   saved=json.loads(await page.get_by_test_id('salvato').inner_text())
   assert saved['listino_fornitore']==25 and saved['costo']==250
   assert all(saved[c] is None for c in ['acq_sc1','acq_sc2','acq_sc3','acq_magg_perc','acq_magg_euro'])
   await page.get_by_role('button',name='Apri riga',exact=True).click()
   await page.get_by_label('Sc. 1 %',exact=True).fill('7')
   await page.get_by_label('Fornitore',exact=True).fill('prova')
   await page.get_by_role('button',name='Fornitore prova',exact=True).click()
   assert [await page.get_by_label(f'Sc. {i} %',exact=True).input_value() for i in [1,2,3]]==['7','5','2']
   assert await page.get_by_label('Sconto dal listino',exact=True).input_value()==''
   await page.get_by_text('Il fornitore ha più di 3 sconti base:',exact=False).scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{width}-sconti-fornitore.png'))
   await dialog.get_by_role('button',name='Salva',exact=True).click()
   saved=json.loads(await page.get_by_test_id('salvato').inner_text())
   assert [saved[c] for c in ['acq_sc1','acq_sc2','acq_sc3']]==[7,5,2]
   assert saved['sconti_gamma']==[]
   await page.get_by_role('button',name='Apri kit',exact=True).click()
   assert await page.get_by_text('Prezzo di acquisto',exact=True).count()==0
   assert await page.get_by_text('Prezzo di vendita',exact=True).count()==0
   assert await page.get_by_label('Costo (€)',exact=True).count()==1
   await dialog.get_by_role('button',name='Annulla',exact=True).click()
   assert not writes,writes
   assert not errors,errors
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'), 'overflow pagina'
   print(width,'PASS costo/listino, formula, salvataggio/riapertura, sconti acquisto e kit invariato',flush=True)
   await context.close()
  await browser.close()
asyncio.run(main())