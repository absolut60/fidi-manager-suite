"""FM98: prova della sezione reale con risposte locali, nessuna scrittura DB.
Richiede /verifica-fm98 temporanea che monti CondizioniVenditaImpostazioni dentro
AuthProvider e simuli getSession (user id USER) e onAuthStateChange prima del mount.
La pagina di collaudo non resta nel progetto: crearla solo per ripetere la prova,
poi rimuoverla. Il controllo dei permessi reali non è simulato come prova di RLS.
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm98')
USER='98000000-0000-0000-0000-000000000001'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(320,812),(375,812),(390,844),(768,1024),(1280,1800),(1920,1080)]:
   context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width==768)
   page=await context.new_page(); errors=[]; writes=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   saved={'condizioni_vendita_showroom':'CONDIZIONI DI VENDITA\n\nDECORRENZA\nValide fino al {{validita}}.'}
   async def rest(route):
    table=route.request.url.split('/rest/v1/')[-1].split('?')[0]
    if table=='profili': result={'id':USER,'nome':'Utente','cognome':'Prova','attivo':True,'store_id':None}
    elif table=='user_roles': result=[{'role':'amministratore'}]
    elif table=='configurazioni':
     if route.request.method=='POST':
      payload=route.request.post_data_json; writes.append(payload)
      assert payload['updated_by']==USER
      saved[payload['chiave']]=payload['valore']; result={'chiave':payload['chiave']}
     else:
      key='condizioni_vendita_showroom' if 'showroom' in route.request.url else 'condizioni_vendita_sistema_made'
      result={'valore':saved[key]} if key in saved else None
    else: result=[]
    await route.fulfill(status=200,json=result)
   await page.route('**/rest/v1/**',rest)
   await page.goto('http://localhost:8080/verifica-fm98',wait_until='domcontentloaded')
   await page.wait_for_timeout(1500)
   await page.get_by_label('Showroom',exact=True).wait_for()
   show=page.get_by_label('Showroom',exact=True)
   await page.wait_for_function("document.getElementById('condizioni_vendita_showroom').value.includes('DECORRENZA')")
   assert await page.get_by_label('Sistema MADE',exact=True).input_value()==''
   await page.screenshot(path=str(OUT/f'{width}-iniziale.png'))
   await show.fill('CONDIZIONI DI VENDITA\n\nDECORRENZA\nValide fino al {{validita}}.\n\nTesto aggiornato di prova.')
   await page.get_by_role('button',name='Salva condizioni Showroom',exact=True).click()
   await page.get_by_text('Condizioni Showroom salvate',exact=True).wait_for()
   assert len(writes)==1 and writes[0]['chiave']=='condizioni_vendita_showroom'
   assert not await page.get_by_role('button',name='Salva condizioni Showroom',exact=True).is_enabled()
   await page.get_by_label('Sistema MADE',exact=True).fill('PAGAMENTI\nNuove condizioni di prova.')
   await page.get_by_role('button',name='Salva condizioni Sistema MADE',exact=True).click()
   await page.get_by_text('Condizioni Sistema MADE salvate',exact=True).wait_for()
   assert len(writes)==2
   await page.reload(wait_until='domcontentloaded')
   await page.wait_for_function("document.getElementById('condizioni_vendita_showroom')?.value.includes('Testo aggiornato')")
   assert await page.get_by_label('Sistema MADE',exact=True).input_value()=='PAGAMENTI\nNuove condizioni di prova.'
   await show.scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{width}-salvato.png'))
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),f'overflow {width}'
   assert not errors,errors
   print(f'{width}: lettura, modifica, creazione, salvataggio e rilettura simulati OK; overflow/errori assenti')
   await context.close()
  await browser.close()
asyncio.run(main())
