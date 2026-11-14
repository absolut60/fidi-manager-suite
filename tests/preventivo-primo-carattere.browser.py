# Test browser con risposte simulate: nessuna scrittura DB.
# PROVA_VECCHIO_CAPTURE=1 deve fallire sul primo carattere.
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-primo-tasto')
OUT.mkdir(parents=True, exist_ok=True)
ID='11111111-1111-4111-8111-111111111111'
row=dict(id='22222222-2222-4222-8222-222222222222',blocco_id='33333333-3333-4333-8333-333333333333',tipo_riga='articolo_singolo',descrizione='Articolo prova',articolo_codice='ART1',articolo_id=None,quantita=1,prezzo_unit=10,sconti_gamma=[],maggiorazione_perc=0,sconto_perc=0,costo_unit=5,um='PZ',ordine=10,segno=1,importo=10,incidenza=1,articolo=None)
prev=dict(id=ID,numero='PRV-PROVA',titolo='Prova',tipo='preventivo',tipo_doc='fornitura',stato='bozza',data='2026-11-14',cliente_id=None,cantiere_id=None,agente_codice=None,alternativa_di=None,iva_perc=22,totale_imponibile=10,iva_importo=2.2,totale=12.2,blocchi=[dict(id=row['blocco_id'],preventivo_id=ID,descrizione='Blocco prova',ordine=10,quantita_base=1,um_base='PZ',righe=[row])])
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  ctx=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await ctx.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  if cookies: await ctx.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080')
  k=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'); s=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON')
  if k and s: await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,s])
  async def rest(route):
   url=route.request.url
   table=url.split('/rest/v1/')[1].split('?')[0]
   data=[]
   if route.request.method=='PATCH':
    await asyncio.sleep(3)
    data=[prev]
   elif table=='preventivi' and 'blocchi' in url: data=prev
   elif table=='user_roles': data=[{'role':'preventivi_write'}]
   elif table=='rpc/get_user_roles': data=['preventivi_write']
   await route.fulfill(status=200,json=data,headers={'content-range':'0-0/0'})
  await page.route('**/rest/v1/**',rest)
  if os.environ.get('PROVA_VECCHIO_CAPTURE') == '1':
   async def old_hook(route):
    response=await route.fetch()
    body=(await response.text()).replace('onInput: () => setCaselleAperte(true)', 'onInputCapture: () => setCaselleAperte(true)')
    await route.fulfill(response=response,body=body)
   await page.route('**/src/lib/use-stato-salvataggio-preventivo.ts*',old_hook)
  await page.goto(f'http://localhost:8080/preventivatore/{ID}?tab=corpo')
  await page.wait_for_timeout(2200)
  print('body', (await page.locator('main').inner_text())[:900]); print('errors',errors)
  print('inputs',await page.locator('input:visible,textarea:visible').evaluate_all('(els)=>els.map(e=>({label:e.getAttribute("aria-label"),value:e.value}))'))
  async def one(name,loc,key):
   await loc.focus(); before=await loc.input_value()
   await loc.evaluate('(e)=>{window.probe=e; e.select()}')
   await page.keyboard.press(key)
   assert await loc.input_value() == key, name + ': primo carattere perso'
   print(name, 'before',before,'after',await loc.input_value(),'same',await loc.evaluate('(e)=>e===window.probe'),'status',await page.get_by_role('status').all_text_contents())
  await one('lordo',page.locator('tbody tr').first.locator('td').nth(7).locator('input'),'7')
  await one('sconti',page.get_by_role('textbox',name='Sconti Gamma').filter(visible=True),'5')
  await one('descrizione',page.get_by_role('textbox',name='Descrizione riga').filter(visible=True),'X')
  await page.get_by_role('combobox').filter(visible=True).first.click()
  await one('ricerca',page.get_by_role('textbox',name='Cerca articolo Gamma',exact=True),'X')
  await page.keyboard.press('Escape')
  await page.get_by_role('tab',name='Testata',exact=True).click()
  await one('titolo',page.get_by_role('textbox',name='Titolo',exact=True),'X')
  await one('filiale',page.get_by_role('textbox',name='Filiale',exact=True),'Y')
  await page.get_by_role('button',name='Salva',exact=True).click()
  await page.get_by_text('Preventivo salvato',exact=True).wait_for()
  print('Salva: conferma visibile')
  await one('titolo nuova modifica',page.get_by_role('textbox',name='Titolo',exact=True),'Z')
  await page.get_by_role('textbox',name='Titolo',exact=True).press('Tab')
  await page.wait_for_timeout(150)
  await page.get_by_role('link',name='Preventivi',exact=True).click()
  await page.get_by_role('alertdialog').wait_for()
  print('Finestra uscita:',await page.get_by_role('alertdialog').inner_text())
  await page.get_by_role('button',name='Resta qui',exact=True).click()
  # Salvataggio ancora in corso dopo il blur: navigazione protetta.
  await page.wait_for_timeout(200)
  await page.screenshot(path=str(OUT/'dopo-1280.png'))
  await page.set_viewport_size({'width':375,'height':812})
  await one('titolo telefono',page.get_by_role('textbox',name='Titolo',exact=True),'M')
  await page.screenshot(path=str(OUT/'dopo-375.png'))
  assert not errors, errors
  print('errors final',errors)
  await browser.close()
asyncio.run(main())
