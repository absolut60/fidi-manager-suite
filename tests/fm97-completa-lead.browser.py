"""Route temporanea verifica-fm97-lead + fixture reale del contenuto Gamma; nessun dato reale.
Salvataggio attraverso completaDatiGamma, client locale e rilettura della fonte sintetica.
Google Places risponde solo con dati sintetici tramite intercettazione locale.
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm97-lead')
OUT.mkdir(parents=True,exist_ok=True)
GOOGLE="""window.google={maps:{importLibrary:async()=>({
 AutocompleteSessionToken: class {},
 AutocompleteSuggestion:{fetchAutocompleteSuggestions:async()=>({suggestions:[{placePrediction:{placeId:'local-place',text:{toString:()=> 'Via Roma 5, Monza, Italia'}}}]})},
 Place:class {async fetchFields(){this.addressComponents=[
  {types:['route'],longText:'Via Roma'},{types:['street_number'],longText:'5'},
  {types:['postal_code'],longText:'20100'},{types:['locality'],longText:'Monza'},
  {types:['administrative_area_level_2'],shortText:'MI'}];this.location=null;}}
})}};window.__initGoogleMaps?.();"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for w,h in [(320,760),(375,812),(390,844),(768,1024),(1280,1800),(1920,1800)]:
   context=await browser.new_context(viewport={'width':w,'height':h},has_touch=w==768)
   page=await context.new_page();errors=[];writes=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def google(route):await route.fulfill(status=200,content_type='application/javascript',body=GOOGLE)
   await page.route('https://maps.googleapis.com/**',google)
   async def no_database(route):
    if route.request.method not in ['GET','OPTIONS']:writes.append(route.request.method)
    await route.fulfill(status=200,json=[])
   await page.route('**/rest/v1/**',no_database)
   await page.goto('http://localhost:8080/verifica-fm97-lead',wait_until='networkidle')
   dialog=page.get_by_role('dialog')
   await page.get_by_role('button',name="Completa: Manca l'indirizzo del lead.",exact=True).click()
   await page.get_by_label('Indirizzo',exact=True).fill('Via Roma')
   await page.get_by_role('button',name='Via Roma 5, Monza, Italia',exact=True).click()
   assert await page.get_by_label('CAP',exact=True).input_value()=='20100'
   assert await page.get_by_label('Città',exact=True).input_value()=='Monza'
   assert await page.get_by_label('Provincia',exact=True).input_value()=='MB'
   assert await page.get_by_label('Provincia',exact=True).is_disabled()
   await page.get_by_label('Indirizzo',exact=True).scroll_into_view_if_needed()
   await page.screenshot(path=str(OUT/f'{w}-compilazione.png'))
   await page.get_by_role('button',name='Salva dati',exact=True).click()
   await page.wait_for_function("!document.body.innerText.includes(\"Manca l'indirizzo del lead.\")")
   for txt in ["Manca l'indirizzo del lead.",'Manca il CAP del lead.','Manca la città del lead.']:
    assert await page.get_by_text(txt,exact=True).count()==0
   saved=json.loads(await page.get_by_test_id('persistito').text_content())
   assert saved['chiamate']==1
   assert saved['ultimo']['nome']=='completa_dati_lead_esportazione_gamma'
   args=saved['ultimo']['args']
   assert 'provincia' not in args['_anagrafica'] and 'ragione_sociale' not in args['_anagrafica']
   assert saved['dati'][0]['lead']['indirizzo']=='Via Roma 5'
   assert saved['dati'][0]['lead']['cap']=='20100' and saved['dati'][0]['lead']['citta']=='Monza'
   assert saved['dati'][0]['lead']['provincia']=='MB'
   await page.get_by_role('button',name='Salva dati',exact=True).wait_for(state='visible')
   await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Salva dati'&&!b.disabled)")
   await page.screenshot(path=str(OUT/f'{w}-salvato.png'))
   assert await dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
   assert await dialog.evaluate('(e)=>e.getBoundingClientRect().width<=960')
   # CAP già compilato: Google non deve sovrascriverlo; campi mancanti restano modificabili.
   await page.goto('http://localhost:8080/verifica-fm97-lead?scenario=parziale',wait_until='networkidle')
   await page.get_by_role('button',name="Completa: Manca l'indirizzo del lead.",exact=True).click()
   assert await page.get_by_label('CAP',exact=True).input_value()=='20900'
   assert await page.get_by_label('CAP',exact=True).is_disabled()
   await page.get_by_label('Indirizzo',exact=True).fill('Via Roma')
   await page.get_by_role('button',name='Via Roma 5, Monza, Italia',exact=True).click()
   assert await page.get_by_label('CAP',exact=True).input_value()=='20900'
   await page.get_by_role('button',name='Salva dati',exact=True).click()
   await page.wait_for_function("!document.body.innerText.includes(\"Manca l'indirizzo del lead.\")")
   # Persona fisica e fiscale: limiti e normalizzazione condivisi, nessuna scheda lead completa.
   await page.goto('http://localhost:8080/verifica-fm97-lead?scenario=persona',wait_until='networkidle')
   await page.get_by_role('button',name='Completa: Il lead non ha un nome o una ragione sociale.',exact=True).click()
   await page.get_by_label('Nome',exact=True).fill(' Mario ')
   await page.get_by_label('Cognome',exact=True).fill(' Rossi ')
   await page.get_by_role('button',name='Completa: Il lead non ha partita IVA né codice fiscale.',exact=True).click()
   await page.get_by_label('Codice fiscale',exact=True).fill(' rssmra80a01f205x ')
   assert await page.get_by_label('Codice fiscale',exact=True).get_attribute('maxlength')=='20'
   await page.get_by_role('button',name='Salva dati',exact=True).click()
   await page.wait_for_function("!document.body.innerText.includes('Il lead non ha un nome o una ragione sociale.')")
   saved=json.loads(await page.get_by_test_id('persistito').text_content())
   assert saved['dati'][0]['lead']['nome']=='Mario' and saved['dati'][0]['lead']['cognome']=='Rossi'
   assert saved['dati'][0]['lead']['codice_fiscale']=='rssmra80a01f205x'
   assert await page.get_by_text('Il lead non ha partita IVA né codice fiscale.',exact=True).count()==0
   # Errore: avvisi non spariscono e il salvataggio è riprovabile.
   await page.goto('http://localhost:8080/verifica-fm97-lead?scenario=errore',wait_until='networkidle')
   await page.get_by_role('button',name="Completa: Manca l'indirizzo del lead.",exact=True).click()
   await page.get_by_label('Indirizzo',exact=True).fill('Via di prova')
   await page.get_by_role('button',name='Salva dati',exact=True).click()
   await page.get_by_role('alert').filter(has_text='Salvataggio negato').wait_for()
   assert await page.get_by_role('button',name='Salva dati',exact=True).is_enabled()
   assert await page.get_by_text("Manca l'indirizzo del lead.",exact=True).count()==1
   await page.screenshot(path=str(OUT/f'{w}-errore.png'))
   assert not writes, writes
   assert not errors, errors
   print(w,'PASS: indirizzo Google, un salvataggio/rilettura, avvisi spariti, precompilati protetti, nome/fisco ed errore')
   await context.close()
  await browser.close()
asyncio.run(main())