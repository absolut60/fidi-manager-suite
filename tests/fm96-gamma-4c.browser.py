"""Prova locale: route temporanea /verifica-fm96c con PreventiviListView ordine.
Generare dati.json con ordineFm96 in /tmp/browser/fm96c; risposte locali soltanto.
Rimuovere la route dopo la prova. Sessione sintetica scritta solo su localhost.
"""
import asyncio, json, base64, time, copy, sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm96c')
COLONNE='--colonne-fm97' in sys.argv
USER='96000000-0000-0000-0000-000000000099'
EX='96000000-0000-0000-0000-000000000088'
def jwt():
 def b(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return b({'alg':'HS256','typ':'JWT'})+'.'+b({'sub':USER,'role':'authenticated','aal':'aal2','exp':int(time.time())+3600})+'.synthetic-local-only'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  sizes=[(320,760),(375,812),(390,844),(768,1024),(1024,768),(1024,1366),(1366,1024),(1280,1800),(1920,1800)]
  if COLONNE: sizes=[(320,760),(375,812),(390,844),(768,1024),(1280,1800),(1920,1800)]
  for width,height,role in [(w,h,'amministratore') for w,h in sizes]+[(375,812,r) for r in ['responsabile_showroom','showroom','store_manager']]:
   data=json.loads((OUT/'dati.json').read_text());errors=[];calls=[];writes=[];firmate=[]
   for i,d in enumerate(data):
    d['ordine'].update({'titolo':'Fornitura materiali per cantiere di prova','data':'2026-11-22','created_at':'2026-11-22T10:00:00Z','stato':'bozza','tipo_doc':'PREVENTIVO','totale':1220,'totale_imponibile':1000,'iva_importo':220,'iva_perc':22,'creato_da':USER,'alternativa_di':None,'esportato_gamma_at':'2026-11-22T19:00:00Z' if i==0 else None,'esportato_gamma_da':USER if i==0 else None,'esportazione_gamma_id':EX if i==0 else None,'assegnato_a':None,'assegnati_copia':[],'cantiere_id':None,'preventivo_origine_id':None,'fascia_listino':'A','note':'Nota di testata conservata','regime_iva':'ordinaria','sconto_piede_perc':0,'data_consegna':'2026-12-01'})
    for n,r in enumerate(d['righe']):r.update({'blocco_id':'b'+d['ordine']['id'],'ordine':n,'sconti_gamma':[],'sconto_perc':0,'maggiorazione_perc':0,'segno':1,'importo':200,'costo':12,'costo_unit':12,'quantita':10,'qta_ordinata':0,'articolo_codice':None,'articolo_id':None,'um_scelta':None})
   if COLONNE:
    for i,d in enumerate(data):
     if i<2:d['ordine'].update({'esportato_gamma_at':'2026-11-22T19:00:00Z','esportato_gamma_da':USER,'esportazione_gamma_id':EX})
    data[1]['ordine'].update({'cliente_id':None,'lead_id':'97000000-0000-0000-0000-000000000011'})
    data[1]['lead']={'id':data[1]['ordine']['lead_id'],'ragione_sociale':'Lead di prova con un nome completo molto lungo per verificare le colonne','nome':None,'cognome':None,'store_id':data[1]['ordine']['store_id']}
   export={'id':EX,'creata_at':'2026-11-22T19:00:00Z','creata_da':USER,'nome_file':'Gamma-prova.xls','file_path':'uuid/Gamma-prova.xls','n_ordini':1,'n_documenti_fornitore':5,'n_documenti_cliente':1}
   events=[{'id':'event1','esportazione_id':EX,'ordine_id':data[0]['ordine']['id'],'numero_ordine':'ORD-104/26','tipo':'esportato','utente':USER,'at':'2026-11-22T19:00:00Z','motivo':None}]
   context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width in [768,1024,1366],accept_downloads=True)
   page=await context.new_page();page.on('console',lambda m: print('CONSOLE',m.text,flush=True) if m.type=='error' else None);page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGEERROR',str(e),flush=True)))
   async def auth(route):
    await route.fulfill(status=200,json={'id':USER,'aud':'authenticated','role':'authenticated','email':'fixture@example.test','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z','factors':[{'id':'test-factor','factor_type':'totp','status':'verified'}]})
   async def storage(route):
    if '/object/sign/' in route.request.url and route.request.method=='POST':
     firmate.append(route.request.post_data_json);await route.fulfill(status=200,json={'signedURL':'/object/sign/esportazioni-gamma/uuid/Gamma-prova.xls?token=synthetic-local-only'})
    elif route.request.method=='GET':await route.fulfill(status=200,body=bytes([208,207,17,224,161,177,26,225]),content_type='application/vnd.ms-excel')
    else:raise AssertionError('nessuna scrittura storage prevista')
   def blocco(d):return {'id':'b'+d['ordine']['id'],'preventivo_id':d['ordine']['id'],'ordine':0,'descrizione':'Blocco materiali con descrizione completa','quantita_base':None,'um_base':'NR','righe':d['righe']}
   async def rest(route):
    req=route.request;u=urlparse(req.url);table=u.path.split('/rest/v1/')[-1];qs=parse_qs(u.query);body=req.post_data_json if req.post_data else {};result=[];headers={}
    if table=='profili':result={'id':USER,'nome':'Andrea','cognome':'Prova','attivo':True,'store_id':data[0]['ordine']['store_id'],'deve_cambiare_password':False,'password_cambiata_il':'2026-11-22T10:00:00Z'}
    elif table=='user_roles':result=[{'role':role}]
    elif table=='rpc/get_nomi_utenti':result=[{'id':USER,'nome':'Andrea','cognome':'Prova'}]
    elif table=='rpc/get_clienti_elenco_preventivi' or table in ['rpc/get_cliente_lite','rpc/get_clienti_lite_search','rpc/get_clienti_lite_by_ids','rpc/dati_cliente_preventivo']:result=[data[0]['cliente']]
    elif table=='rpc/condizioni_preventivo_cliente':result=[{'store_id':data[0]['ordine']['store_id'],'sede_nome':'Lissone','listino':10}]
    elif table=='preventivi':
     if req.method=='PATCH':
      writes.append(body);assert data[0]['ordine']['esportato_gamma_at'] is None,body
      data[0]['ordine'].update(body);result=[data[0]['ordine']]
     elif ('alternativa_di' in qs and qs['alternativa_di'][0].startswith('in.')) or qs.get('tipo')==['eq.preventivo']:result=[]
     else:
      selected=data
      if 'esportato_gamma_at' in qs:
       exp=qs['esportato_gamma_at'][0]=='not.is.null';selected=[d for d in data if bool(d['ordine']['esportato_gamma_at'])==exp]
      if 'id' in qs:
       cond=qs['id'][0];ids=cond[3:] if cond.startswith('eq.') else cond[4:-1].split(',');selected=[d for d in selected if d['ordine']['id'] in ids]
      result=[{**d['ordine'],'lead':d.get('lead'),'cliente':d['cliente'],'cantiere':None,'blocchi':[blocco(d)]} for d in selected]
      headers={'Content-Range':f'0-{max(0,len(result)-1)}/{len(result)}','Access-Control-Expose-Headers':'Content-Range'}
      if 'vnd.pgrst.object' in req.headers.get('accept',''):result=result[0] if result else None
    elif table=='blocchi_preventivo':result=[blocco(d) for d in data]
    elif table=='righe_preventivo':result=[r for d in data for r in d['righe']]
    elif table=='stores':result=[{**data[0]['sede'],'nome':'Lissone','attivo':True}]
    elif table=='fornitori':result=[{**f,'ragione_sociale':'Fornitore di prova'} for f in data[0]['fornitori']]
    elif table=='listini_gamma':result=[{'codice':10,'descrizione':'Lombardia'}]
    elif table=='macrocategorie':result=[{'codice':'01','label':'Imprese'}]
    elif table=='categorie_cliente':result=[{'codice':'02','label':'Edilizia'}]
    elif table=='esportazioni_gamma':result=[export]
    elif table=='esportazioni_gamma_eventi':
     calls.append([table,qs]);result=[e for e in events if e['esportazione_id']==EX] if qs.get('esportazione_id')==['eq.'+EX] else [e for e in events if e['esportazione_id'] is None]
    elif table=='rpc/riapri_ordine_gamma':
     calls.append([table,body]);assert role in ['amministratore','responsabile_showroom'];assert isinstance(body['_ordine_id'],str);assert body['_ordine_id']==data[0]['ordine']['id']
     data[0]['ordine'].update({'esportato_gamma_at':None,'esportato_gamma_da':None,'esportazione_gamma_id':None});events.append({'id':'reopen'+str(len(events)),'esportazione_id':None,'ordine_id':body['_ordine_id'],'numero_ordine':'ORD-104/26','tipo':'riaperto','utente':USER,'at':'2026-11-22T19:30:00Z','motivo':body['_motivo']});result=None
    else:assert req.method in ['GET','HEAD'] or table.startswith('rpc/'),(table,req.method)
    await route.fulfill(status=200,json=result,headers=headers)
   await page.route('**/rest/v1/**',rest);await page.route('**/auth/v1/**',auth);await page.route('**/storage/v1/**',storage)
   await page.goto('http://localhost:8080/'+('verifica-fm97' if COLONNE else 'verifica-fm96c'),wait_until='domcontentloaded')
   await page.get_by_role('heading',name='Ordini',exact=True).wait_for()
   await page.wait_for_timeout(500)
   await page.evaluate('''async token=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'synthetic-local-test'});if(error)throw error}''',jwt())
   await page.get_by_role('tab',name='Esportati (2)' if COLONNE else 'Esportati (1)').click();await page.get_by_text('22/11/2026 20:00',exact=False).filter(visible=True).first.wait_for()
   allowed=role in ['amministratore','responsabile_showroom']
   if allowed:
    await page.get_by_role('button',name='Riapri',exact=True).filter(visible=True).first.click();await page.get_by_role('dialog').wait_for();await page.get_by_label('Motivo (facoltativo)').wait_for();await page.wait_for_timeout(250);await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-conferma.png'));await page.get_by_role('button',name='Annulla',exact=True).click()
   else:
    assert await page.get_by_role('button',name='Riapri',exact=True).count()==0;assert await page.get_by_role('tab',name='Storico',exact=True).count()==0
   await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-lista.png'))
   if COLONNE:
    if width>=768:
     heads=await page.locator('table:visible thead th').all_text_contents()
     assert heads[-4:] == ['Totale','Esportato il','Esportato da','Azioni'] if allowed else heads[-3:] == ['Totale','Esportato il','Esportato da'],heads
     rows=page.locator('table:visible tbody tr')
     assert await rows.count()==2
     for row in await rows.all():
      cells=row.locator('td')
      assert 'Esportato' not in await cells.nth(2).inner_text()
      assert await cells.nth(2).get_by_role('button',name='Riapri',exact=True).count()==0
      if allowed:assert await cells.last.get_by_role('button',name='Riapri',exact=True).count()==1
    assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),'overflow pagina'
    assert await page.evaluate('''()=>[...document.querySelectorAll('table')].filter(t=>t.offsetWidth).every(t=>t.scrollWidth<=t.clientWidth+1)'''),'overflow tabella'
    await page.get_by_role('tab',name='Da esportare (1)').click()
    await page.get_by_text('ORD-PROVA/26',exact=True).filter(visible=True).first.wait_for()
    assert await page.get_by_role('button',name='Riapri',exact=True).filter(visible=True).count()==0
    assert await page.get_by_text('Esportato il',exact=True).filter(visible=True).count()==0
    await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-da-esportare.png'))
    assert not errors,errors
    print(width,height,role,'PASS colonne Esportati, Riapri singolo, Da esportare invariata, nessun overflow',flush=True)
    await context.close()
    continue
   await page.goto('http://localhost:8080/preventivatore/'+data[0]['ordine']['id']+'?vista=incorporata',wait_until='domcontentloaded')
   await page.get_by_text('Esportato in Gamma il 22/11/2026 20:00 da Andrea Prova',exact=False).wait_for(timeout=20000)
   await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-editor.png'))
   assert await page.get_by_role('button',name='Salva',exact=True).count()==0
   assert await page.get_by_role('button',name='Riapri per reimportare',exact=True).count()==int(allowed)
   assert await page.get_by_role('button',name='Genera documento',exact=True).is_visible()
   assert await page.get_by_role('button',name='Elimina riga',exact=True).count()==0
   assert not writes,'ordine esportato non deve scrivere totali'
   for tab in ['Testata','Piede','Corpo · 1 blocchi']:
    await page.get_by_role('tab',name=tab,exact=True).click()
    await page.wait_for_timeout(300)
    assert not errors,errors
    if await page.get_by_role('tab',name='Piede',exact=True).count()==0:
     await page.get_by_text('Dettagli tecnici (diagnostica)').click();print(await page.locator('body').inner_text(),flush=True);raise Exception('editor error')
    assert await page.locator('input:visible,textarea:visible,[role=combobox]:visible').count()==0,(tab,'modifica ancora visibile')
    assert await page.get_by_role('button',name='File Gamma di prova',exact=True).count()==0
    await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-{tab.split()[0]}.png'))
   if allowed:
    await page.get_by_role('button',name='Riapri per reimportare',exact=True).click();await page.get_by_label('Motivo (facoltativo)').fill('Correzione quantità di prova');await page.get_by_role('dialog').get_by_role('button',name='Riapri per reimportare',exact=True).click()
    await page.get_by_role('button',name='Salva',exact=True).wait_for();await page.get_by_role('tab',name='Testata',exact=True).click();await page.get_by_role('textbox',name='Data di consegna',exact=True).wait_for();await page.get_by_role('button',name='Altre azioni').click();await page.get_by_role('menuitem',name='File Gamma di prova').wait_for();await page.keyboard.press('Escape')
    await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-riaperto.png'))
    await page.goto('http://localhost:8080/verifica-fm96c',wait_until='domcontentloaded');await page.get_by_role('tab',name='Storico',exact=True).click()
    await page.get_by_role('button',name='Eventi Gamma-prova.xls',exact=True).filter(visible=True).first.click();await page.get_by_text('Esportato il 22/11/2026 20:00 da Andrea Prova',exact=False).filter(visible=True).first.wait_for()
    await page.get_by_text('Riaperto il 22/11/2026 20:30 da Andrea Prova',exact=False).filter(visible=True).first.wait_for();await page.get_by_label('Dal',exact=True).fill('22/11/2026');await page.get_by_label('Al',exact=True).fill('22/11/2026')
    await page.get_by_text('Riaperto il 22/11/2026 20:30 da Andrea Prova',exact=False).filter(visible=True).first.wait_for();await page.get_by_role('button',name='Scarica',exact=True).filter(visible=True).first.wait_for();await page.wait_for_timeout(250);await page.screenshot(path=str(OUT/f'{width}x{height}-{role}-storico.png'))
    async with page.expect_download() as dl:await page.get_by_role('button',name='Scarica',exact=True).filter(visible=True).first.click()
    download=await dl.value;assert download.suggested_filename=='Gamma-prova.xls';assert firmate[-1]['expiresIn']==60
    await download.save_as(str(OUT/f'{width}-{role}-Gamma.xls'))
    assert (OUT/f'{width}-{role}-Gamma.xls').read_bytes()[:2]==bytes([208,207]);assert export['file_path']=='uuid/Gamma-prova.xls'
   assert not errors,errors
   assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),'overflow pagina'
   print(width,height,role,'PASS editor/blocco/banner, riapertura singola, storico/eventi, firma/download' if allowed else 'PASS sola lettura e azioni riservate nascoste',flush=True)
   await context.close()
  await browser.close()
asyncio.run(main())
