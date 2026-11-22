"""Route temporanea /verifica-fm96: PreventiviListView tipo ordine; sole risposte locali.
Generare dati.json dal fixture ordineFm96 in /tmp/browser/fm96; nessuna scrittura reale.
Sessione sintetica solo sulla pagina locale; rimuovere la route dopo la prova.
"""
import asyncio,json,base64,time,copy
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm96')
USER='96000000-0000-0000-0000-000000000099'
def jwt():
 def b(x):return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
 return b({'alg':'HS256','typ':'JWT'})+'.'+b({'sub':USER,'role':'authenticated','aal':'aal2','exp':int(time.time())+3600})+'.synthetic-local-test'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(320,760),(375,812),(390,844),(768,1024),(1024,768),(1024,1366),(1366,1024),(1280,1800),(1920,1800)]:
   data=json.loads((OUT/'dati.json').read_text());errors=[];calls=[];uploads=[];removed=[];fail=[True]
   for d in data:
    d['ordine'].update({'titolo':'Fornitura materiali per cantiere di prova','data':'2026-11-22','created_at':'2026-11-22T10:00:00Z','stato':'bozza','tipo_doc':'PREVENTIVO','totale':1000,'creato_da':USER,'alternativa_di':None,'esportato_gamma_at':None,'esportato_gamma_da':None,'assegnato_a':None})
    for r in d['righe']:r.update({'blocco_id':'b'+d['ordine']['id'],'ordine':0})
   context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width in [768,1024,1366],accept_downloads=True)
   page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   async def auth(route):
    await route.fulfill(status=200,json={'id':USER,'aud':'authenticated','role':'authenticated','email':'fixture@example.test','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'})
   async def storage(route):
    if route.request.method=='POST':uploads.append(route.request.url);await route.fulfill(status=200,json={'Key':'test'})
    elif route.request.method=='DELETE':removed.append(route.request.post_data_json);await route.fulfill(status=200,json=[])
    else:await route.fulfill(status=200,json=[])
   async def rest(route):
    req=route.request;u=urlparse(req.url);table=u.path.split('/rest/v1/')[-1];qs=parse_qs(u.query);body=req.post_data_json if req.post_data else {};result=[];headers={}
    pass
    if table=='profili':result={'id':USER,'nome':'Andrea','cognome':'Prova','attivo':True}
    elif table=='user_roles':result=[{'role':'amministratore'}]
    elif table=='rpc/get_nomi_utenti':result=[{'id':USER,'nome':'Andrea','cognome':'Prova'}]
    elif table=='rpc/get_clienti_elenco_preventivi':result=[data[0]['cliente']]
    elif table=='preventivi':
     if 'alternativa_di' in qs and qs['alternativa_di'][0].startswith('in.'):result=[]
     else:
      selected=data
      if 'esportato_gamma_at' in qs:
       exp=qs['esportato_gamma_at'][0]=='not.is.null';selected=[d for d in data if bool(d['ordine']['esportato_gamma_at'])==exp]
      if 'id' in qs:
       ids=qs['id'][0][4:-1].split(',');selected=[d for d in selected if d['ordine']['id'] in ids]
      result=[{**d['ordine'],'lead':d['lead'],'cliente':d['cliente'],'cantiere':None,'blocchi':[{'righe':d['righe']}]} for d in selected]
      headers={'Content-Range':f'0-{max(0,len(result)-1)}/{len(result)}','Access-Control-Expose-Headers':'Content-Range'}
    elif table=='blocchi_preventivo':result=[{'id':'b'+d['ordine']['id'],'preventivo_id':d['ordine']['id'],'ordine':0} for d in data]
    elif table=='righe_preventivo':result=[r for d in data for r in d['righe']]
    elif table=='clienti':result=[data[0]['cliente']]
    elif table=='lead':result=[data[1]['lead']]
    elif table=='stores':result=[data[0]['sede']]
    elif table=='depositi':result=[data[0]['deposito']]
    elif table=='fornitori':result=data[0]['fornitori']
    elif table=='listini_gamma':result=[{'codice':10,'descrizione':'Lombardia'},{'codice':20,'descrizione':'Piemonte'}]
    elif table=='macrocategorie':result=[{'codice':'01','label':'Imprese'}]
    elif table=='categorie_cliente':result=[{'codice':'02','label':'Edilizia'}]
    elif table=='rpc/completa_dati_esportazione_gamma':
     calls.append([table,body]);d=data[1];d['ordine'].update({'listino_rif':body['_listino'],'macrocategoria_rif':body['_macrocategoria'],'categoria_rif':body['_categoria']});d['lead']['codice_sdi']=body['_codice_sdi'];result=None
    elif table=='rpc/registra_esportazione_gamma':
     calls.append([table,body]);assert body['_ordine_ids']==[data[0]['ordine']['id']],body
     assert body['_n_doc_fornitore']==5 and body['_n_doc_cliente']==1,body
     if fail[0]:
      fail[0]=False;await route.fulfill(status=400,json={'message':'ORD-104/26: conflitto di esportazione','code':'P0001'});return
     data[0]['ordine']['esportato_gamma_at']='2026-11-22T19:00:00Z';data[0]['ordine']['esportato_gamma_da']=USER;result='96000000-0000-0000-0000-000000000088'
    else:
     assert req.method in ['GET','HEAD'] or table.startswith('rpc/'),(table,req.method)
    await route.fulfill(status=200,json=result,headers=headers)
   await page.route('**/rest/v1/**',rest);await page.route('**/auth/v1/**',auth);await page.route('**/storage/v1/**',storage)
   await page.goto('http://localhost:8080/verifica-fm96',wait_until='domcontentloaded')
   await page.evaluate('''async token=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {error}=await supabase.auth.setSession({access_token:token,refresh_token:'synthetic-local-test'});if(error)throw error}''',jwt())
   await page.get_by_role('tab',name='Da esportare (2)').wait_for()
   select=page.get_by_role('checkbox',name='Seleziona tutte') if width>=1024 else page.get_by_text('Seleziona tutte (2)',exact=True)
   await select.click();await page.get_by_role('button',name='Esporta in Gamma (2)',exact=True).wait_for()
   await page.screenshot(path=str(OUT/f'{width}x{height}-lista.png'))
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,'overflow lista')
   await page.get_by_role('button',name='Esporta in Gamma (2)',exact=True).click()
   dialog=page.get_by_role('dialog',name='Esporta in Gamma');await dialog.get_by_text('1 ordini pronti',exact=False).wait_for()
   await dialog.screenshot(path=str(OUT/f'{width}x{height}-finestra.png'))
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,'overflow dialog')
   bounds=await dialog.bounding_box();assert bounds and bounds['width']<=width+1 and bounds['height']<=height+1,bounds
   for label,val in [('Listino','20 — Piemonte'),('Macro categoria','Imprese'),('Categoria','Edilizia')]:
    await dialog.get_by_role('combobox',name=label,exact=True).click();await page.get_by_role('option',name=val,exact=True).click()
   await dialog.get_by_role('textbox',name='Codice SDI (fatturazione elettronica)',exact=True).fill('abc1234')
   await dialog.get_by_role('button',name='Salva dati',exact=True).click();await page.wait_for_timeout(350)
   assert not await dialog.get_by_text('Manca il listino per il nuovo cliente.',exact=True).count()
   assert not await dialog.get_by_text('Manca la macrocategoria per il nuovo cliente.',exact=True).count()
   assert not await dialog.get_by_text('Manca la categoria per il nuovo cliente.',exact=True).count()
   assert calls[0][1]['_codice_sdi']=='ABC1234',calls
   await dialog.get_by_role('button',name='Genera file ed esporta (1)',exact=True).click()
   await dialog.get_by_text('ORD-104/26: conflitto di esportazione',exact=True).wait_for()
   assert len(uploads)==1 and len(removed)==1,'ripulitura'
   await dialog.screenshot(path=str(OUT/f'{width}x{height}-errore.png'))
   async with page.expect_download() as download:
    await dialog.get_by_role('button',name='Genera file ed esporta (1)',exact=True).click()
   file=await download.value;path=OUT/f'{width}x{height}.xls';await file.save_as(path);assert path.read_bytes()[:8]==bytes.fromhex('D0CF11E0A1B11AE1')
   await page.get_by_role('tab',name='Esportati (1)').wait_for();await page.get_by_role('tab',name='Esportati (1)').click()
   await page.get_by_text('Esportato il 22/11/2026 20:00 da Andrea Prova',exact=False).filter(visible=True).first.wait_for()
   assert not await page.get_by_role('button',name='Esporta in Gamma (2)',exact=True).count()
   if width<1024:await page.get_by_role('button',name='Filtri',exact=False).click()
   await page.get_by_label('Esportato dal',exact=True).fill('22/11/2026');await page.get_by_label('Esportato al',exact=True).fill('22/11/2026')
   await page.get_by_role('tab',name='Esportati (1)').wait_for();await page.get_by_text('Esportato il 22/11/2026 20:00 da Andrea Prova',exact=False).filter(visible=True).first.wait_for();await page.screenshot(path=str(OUT/f'{width}x{height}-esportati.png'))
   assert not errors,errors
   print(width,height,'PASS lista/spunte, lead/ricalcolo, errore/ripulitura, XLS 5+1, esportati/data/autore')
   await context.close()
  await browser.close()
asyncio.run(main())
