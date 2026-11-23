"""FM98: UI reale su /verifica-fm98-note temporanea, dati sintetici intercettati.
La route temporanea monta tests/fixtures/fm98-note-cliente.tsx e AuthProvider con
sessione finta (nessuna credenziale). Rimuovere la route dopo il collaudo.
Non costituisce verifica autenticata del database ospitato.
"""
import asyncio, json, re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

OUT=Path('/tmp/browser/fm98-f3')
USER='98000000-0000-0000-0000-000000000001'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(320,812),(375,812),(390,844),(768,1024),(1280,1800),(1920,1080)]:
   context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width==768)
   page=await context.new_page(); errors=[]; writes=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   note=[{'id':'98000000-0000-0000-0000-000000000010','linea':'showroom','titolo':'Consegna concordata','testo':'Consegna da concordare.\n\nAccesso al cantiere.','creato_da':USER},
         {'id':'98000000-0000-0000-0000-000000000011','linea':'showroom','titolo':'Titolo lungo della nota condivisa da un altro operatore della stessa linea','testo':'Materiali da verificare alla consegna.','creato_da':'altro'}]
   doc={'note_cliente':''}; state={'lettura':False}
   async def rest(route):
    url=urlparse(route.request.url); table=url.path.split('/rest/v1/')[-1]; query=parse_qs(url.query); method=route.request.method
    if table=='profili': data={'id':USER,'attivo':True,'nome':'Operatore','cognome':'Prova','linee_abilitate':['showroom'],'linea_predefinita':'showroom','store_id':None}
    elif table=='user_roles': data=[{'role':'showroom' if state['lettura'] else 'preventivi_write'}]
    elif table=='note_preventivo_libreria':
     if method=='POST':
      payload=route.request.post_data_json; writes.append(('nuova',payload)); data={**payload,'id':'98000000-0000-0000-0000-000000000012'};note.append(data)
     elif method=='PATCH':
      payload=route.request.post_data_json; writes.append(('aggiorna',payload)); id=query['id'][0].removeprefix('eq.'); data=next(n for n in note if n['id']==id);data.update(payload)
     elif method=='DELETE':
      id=query['id'][0].removeprefix('in.(').removesuffix(')').strip('"'); note[:]=[n for n in note if n['id']!=id]; writes.append(('elimina',id)); await route.fulfill(status=200,json=[],headers={'content-range':'0-0/1','access-control-expose-headers':'content-range'});return
     else: data=note
    elif table=='preventivi':
     if method=='PATCH':doc.update(route.request.post_data_json);writes.append(('documento',route.request.post_data_json))
     data={'id':'98000000-0000-0000-0000-000000000100',**doc}
    else:data=[]
    await route.fulfill(status=200,json=data)
   await page.route('**/rest/v1/**',rest)
   await page.goto('http://localhost:8080/verifica-fm98-note',wait_until='domcontentloaded')
   await page.get_by_role('button',name='Salva in libreria',exact=True).wait_for()
   field=page.get_by_role('textbox',name='Note per il cliente',exact=True)
   await field.fill('Prima nota')
   await page.get_by_role('button',name='Dalla libreria',exact=True).click()
   dialog=page.get_by_role('dialog',name='Note dalla libreria',exact=True)
   await dialog.get_by_role('button',name=re.compile('Consegna concordata')).first.wait_for()
   await dialog.screenshot(path=str(OUT/f'{width}-libreria.png'))
   assert await dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   await dialog.get_by_role('button',name=re.compile('Consegna concordata Consegna')).click()
   atteso='Prima nota\n\nConsegna da concordare.\n\nAccesso al cantiere.'
   await page.wait_for_function("document.querySelector('[data-testid=persistito]').textContent.includes('Accesso al cantiere')")
   assert doc['note_cliente']==atteso and await field.input_value()==atteso
   region=page.get_by_role('region',name='Note per il cliente',exact=True)
   await region.screenshot(path=str(OUT/f'{width}-piede.png'))
   await page.get_by_role('button',name='Salva in libreria',exact=True).click()
   save=page.get_by_role('dialog',name='Salva in libreria',exact=True)
   assert await save.get_by_label('Testo *',exact=True).input_value()==atteso
   await save.get_by_label('Titolo *',exact=True).fill('Nuova consegna')
   await save.get_by_label('Testo *',exact=True).fill('Solo la parte riutilizzabile')
   await save.screenshot(path=str(OUT/f'{width}-salva.png'))
   await save.get_by_role('button',name='Salva nota',exact=True).click()
   await save.wait_for(state='hidden')
   assert note[-1]['creato_da']==USER and note[-1]['testo']=='Solo la parte riutilizzabile'
   await page.get_by_role('button',name='Salva in libreria',exact=True).click()
   await save.get_by_role('combobox',name='Salva come',exact=True).click()
   await page.get_by_role('option',name='Aggiorna: Nuova consegna',exact=True).click()
   await save.get_by_label('Testo *',exact=True).fill('Parte aggiornata')
   await save.get_by_role('button',name='Salva nota',exact=True).click()
   await save.wait_for(state='hidden')
   assert note[-1]['testo']=='Parte aggiornata'
   assert 'creato_da' not in next(v for op,v in writes if op=='aggiorna')
   await page.get_by_role('button',name='Dalla libreria',exact=True).click()
   await dialog.get_by_label('Cerca nelle note',exact=True).fill('Parte aggiornata')
   await dialog.get_by_role('button',name='Modifica Nuova consegna',exact=True).click()
   edit=page.get_by_role('dialog',name='Modifica nota',exact=True)
   await edit.get_by_label('Titolo *',exact=True).fill('Consegna aggiornata')
   await edit.get_by_role('button',name='Salva nota',exact=True).click()
   await edit.wait_for(state='hidden')
   await dialog.get_by_role('button',name='Elimina Consegna aggiornata',exact=True).click()
   alert=page.get_by_role('alertdialog')
   await alert.screenshot(path=str(OUT/f'{width}-elimina.png'))
   await alert.get_by_role('button',name='Annulla',exact=True).click()
   assert len(note)==3
   await dialog.get_by_role('button',name='Elimina Consegna aggiornata',exact=True).click()
   await alert.get_by_role('button',name='Elimina nota',exact=True).click()
   await alert.wait_for(state='hidden')
   assert len(note)==2 and doc['note_cliente']==atteso
   await dialog.get_by_role('button',name='Chiudi',exact=True).last.click()
   await page.mouse.move(0,height-1)
   await page.wait_for_function("document.querySelectorAll('[data-sonner-toast]').length===0",timeout=20000)
   await field.fill('\n'.join(['Nota lunga di prova']*20))
   assert await field.evaluate('(e)=>e.clientHeight>=e.scrollHeight-2')
   await page.get_by_role('button',name='Testata',exact=True).click()
   await page.screenshot(path=str(OUT/f'{width}-testata-diagnosi.png'))
   if errors: print('Errori Testata:',errors,flush=True)
   await page.get_by_text('Note interne, non stampate',exact=True).wait_for()
   await page.get_by_role('region',name='Note',exact=True).screenshot(path=str(OUT/f'{width}-interne.png'))
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
   assert not errors,errors
   state['lettura']=True
   for n in note: n['creato_da']='altro'
   await page.reload(wait_until='domcontentloaded')
   await page.get_by_role('button',name='Dalla libreria',exact=True).wait_for()
   assert await page.get_by_role('button',name='Salva in libreria',exact=True).count()==0
   assert await page.locator('textarea[aria-label="Note per il cliente"]').count()==0
   await page.get_by_role('button',name='Dalla libreria',exact=True).click()
   await dialog.get_by_text('Consegna concordata',exact=True).wait_for()
   assert await dialog.get_by_role('button',name=re.compile('Modifica|Elimina')).count()==0
   assert not await dialog.get_by_role('button',name=re.compile('Consegna concordata Consegna')).is_enabled()
   await dialog.screenshot(path=str(OUT/f'{width}-lettura.png'))
   print(f'{width}: inserimento, nuova/aggiorna/modifica, conferma elimina, crescita, note interne, sola lettura e nessun overflow/errori OK (dati locali)')
   await context.close()
  await browser.close()
asyncio.run(main())