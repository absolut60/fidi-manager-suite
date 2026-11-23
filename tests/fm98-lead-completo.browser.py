"""FM98 Fetta 4: maschere reali montate dalla route temporanea verifica-fm98-lead.
Tutte le chiamate sono intercettate con dati sintetici; nessuna credenziale o scrittura reale.
Ricreare la route con tests/fixtures/fm98-lead-completo.tsx e rimuoverla dopo il collaudo.
Non costituisce prova autenticata del database ospitato.
"""
import asyncio,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm98-f4')
USER='98000000-0000-0000-0000-000000000004'
SEDE='98000000-0000-0000-0000-000000000101'
ALTRA='98000000-0000-0000-0000-000000000102'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height,role in [(w,h,'preventivi_manage') for w,h in [(320,812),(375,812),(390,844),(768,1024),(1280,1800),(1920,1080)]] + [(375,812,'preventivi_write'),(1280,1800,'preventivi_write'),(375,812,'responsabile_showroom'),(1280,1800,'responsabile_showroom')]:
   ctx=await browser.new_context(viewport={'width':width,'height':height},has_touch=width==768)
   page=await ctx.new_page();errors=[];writes=[];leads=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def rest(route):
    path=urlparse(route.request.url).path;table=path.split('/rest/v1/')[-1]
    if '/auth/v1/user' in path:
     data={'id':USER,'aud':'authenticated','role':'authenticated','email':'prova@example.invalid'}
    elif table=='profili':data={'id':USER,'attivo':True,'nome':'Operatore','cognome':'Prova','store_id':SEDE,'codice_agente':'9','linee_abilitate':['showroom'],'linea_predefinita':'showroom'}
    elif table=='user_roles':data=[{'role':role}]
    elif table=='stores':data=[{'id':SEDE,'nome':'Sede iniziale','codice':'1'},{'id':ALTRA,'nome':'Sede modificata','codice':'2'}]
    elif table=='agenti':data=[{'codice':'7','descrizione':'Agente lead'},{'codice':'9','descrizione':'Agente profilo'}]
    elif table=='codici_pagamento':data=[{'cod':'RB60','descrizione':'Ricevuta bancaria 60 giorni'}]
    elif table=='listini_gamma':data=[{'codice':20,'descrizione':'Listino di prova'}]
    elif table=='macrocategorie':data=[{'codice':'01','label':'Impresa di prova'}]
    elif table=='categorie_cliente':data=[{'codice':'02','label':'Categoria di prova'}]
    elif table=='lead':
     if route.request.method=='POST':
      payload=route.request.post_data_json;writes.append(payload)
      data={'id':f'98000000-0000-0000-0000-{len(writes):012d}','ragione_sociale':None,'nome':None,'cognome':None,'telefono':None,'email':None,'store_id':None,'agente_codice':None,'listino_rif':None,'macrocategoria_rif':None,'categoria_rif':None,'condizione_pagamento_cod':None,**payload};leads.append(data)
     else:data=leads
    elif table.startswith('rpc/anteprima_numero_'):data=999
    elif table=='configurazioni':data=None
    else:data=[]
    await route.fulfill(status=200,json=data)
   await page.route('**/rest/v1/**',rest);await page.route('**/auth/v1/**',rest)
   await page.goto('http://localhost:8080/verifica-fm98-lead',wait_until='domcontentloaded')
   await page.get_by_role('button',name='Nuovo preventivo',exact=True).wait_for()
   assert role in await page.get_by_text('Operatore di prova:',exact=False).inner_text()
   for modo in ['preventivo','ordine']:
    await page.get_by_role('button',name=f'Nuovo {modo}',exact=True).click()
    doc=page.get_by_role('dialog',name=f'Nuovo {modo}',exact=True)
    await doc.get_by_role('combobox',name='Sede',exact=True).wait_for()
    await page.wait_for_function("Array.from(document.querySelectorAll('[role=combobox][aria-label=Sede]')).some(e=>e.textContent.includes('Sede iniziale'))")
    await doc.get_by_role('button',name='Lead',exact=True).click()
    await doc.get_by_role('button',name='Nuovo lead',exact=True).click()
    dlg=page.get_by_role('dialog',name='Nuovo lead',exact=True)
    await dlg.get_by_text('Tipo soggetto',exact=True).wait_for()
    assert await dlg.get_by_role('button',name='Compila da P.IVA',exact=False).count()==(0 if role=='responsabile_showroom' else 1)
    assert await page.get_by_role('button',name='Crea e seleziona lead',exact=True).count()==0
    await dlg.get_by_text('Ragione sociale',exact=True).locator('..').get_by_role('textbox').fill(f'Impresa prova {modo} {width}')
    crea=dlg.get_by_role('button',name='Crea lead',exact=True)
    assert not await crea.is_enabled()
    assert 'Sede iniziale' in await dlg.get_by_text('Sede',exact=True).locator('..').get_by_role('combobox').inner_text()
    await dlg.screenshot(path=str(OUT/f'{width}-{role}-{modo}-completo.png'))
    await dlg.get_by_text('Sede',exact=True).locator('..').get_by_role('combobox').click()
    await page.get_by_role('option',name='Sede modificata',exact=True).click()
    await dlg.get_by_text('Agente',exact=True).locator('..').get_by_role('combobox').click()
    await page.get_by_role('option',name='Agente lead',exact=True).click()
    for label,option in [('Listino di riferimento','20 — Listino di prova'),('Macrocategoria di riferimento','Impresa di prova'),('Categoria di riferimento','Categoria di prova')]:
     await dlg.get_by_role('combobox',name=label,exact=True).click()
     await page.get_by_role('option',name=option,exact=True).click()
    assert not await crea.is_enabled()
    await dlg.get_by_role('combobox',name='Condizione di pagamento del lead',exact=True).click()
    await page.get_by_role('option',name='Ricevuta bancaria 60 giorni',exact=False).click()
    await dlg.get_by_text('Condizioni commerciali di riferimento',exact=True).scroll_into_view_if_needed()
    await dlg.screenshot(path=str(OUT/f'{width}-{role}-{modo}-condizioni.png'))
    assert await dlg.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await crea.click()
    await dlg.wait_for(state='hidden')
    assert page.url=='http://localhost:8080/verifica-fm98-lead'
    assert await doc.is_visible()
    assert f'Impresa prova {modo} {width}' in await doc.get_by_role('combobox',name='Lead',exact=True).inner_text()
    for label,atteso in [('Listino di riferimento','20'),('Macrocategoria di riferimento','Impresa di prova'),('Categoria di riferimento','Categoria di prova'),('Condizione di pagamento','Ricevuta bancaria 60 giorni'),('Sede','Sede modificata')]:
     assert atteso in await doc.get_by_role('combobox',name=label,exact=True).inner_text(),label
    assert writes[-1]['listino_rif']==20 and writes[-1]['macrocategoria_rif']=='01' and writes[-1]['categoria_rif']=='02' and writes[-1]['condizione_pagamento_cod']=='RB60'
    assert writes[-1]['store_id']==ALTRA and writes[-1]['agente_codice']=='7'
    agente_doc=doc.get_by_text('Agente',exact=True).locator('..').get_by_role('combobox')
    assert ('Agente profilo' if role=='preventivi_write' else 'Agente lead') in await agente_doc.inner_text()
    assert await agente_doc.is_enabled() == (role!='preventivi_write')
    await doc.screenshot(path=str(OUT/f'{width}-{role}-{modo}-selezionato.png'))
    assert await doc.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await doc.get_by_role('button',name='Annulla',exact=True).click()
   await page.get_by_role('button',name='Nuovo lead dalla lista',exact=True).click()
   dlg=page.get_by_role('dialog',name='Nuovo lead',exact=True)
   await dlg.get_by_text('Ragione sociale',exact=True).locator('..').get_by_role('textbox').fill('Lead facoltativo')
   assert await dlg.get_by_role('button',name='Crea lead',exact=True).is_enabled()
   await dlg.get_by_role('button',name='Crea lead',exact=True).click();await dlg.wait_for(state='hidden')
   assert all(writes[-1][k] is None for k in ['listino_rif','macrocategoria_rif','categoria_rif','condizione_pagamento_cod'])
   assert not errors,errors
   print(f'{width} {role}: preventivo/ordine completo, obbligatorieta, sede, 4 colonne, selezione, copia, nessuna navigazione; lista facoltativa OK',flush=True)
   await ctx.close()
  await browser.close()
asyncio.run(main())
