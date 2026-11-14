import asyncio,json,os,copy
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-eliminazioni')
OUT.mkdir(parents=True, exist_ok=True)
ID='11111111-1111-4111-8111-111111111111'
CID='88888888-8888-4888-8888-888888888888'
BID='33333333-3333-4333-8333-333333333333'
CLIENT='99999999-9999-4999-8999-999999999999'
base=dict(id='22222222-2222-4222-8222-222222222222',blocco_id=BID,tipo_riga='articolo_singolo',descrizione='Articolo da scegliere',articolo_codice=None,articolo_id=None,quantita=1,prezzo_unit=None,sconti_gamma=[],maggiorazione_perc=0,sconto_perc=0,costo=None,um='PZ',ordine=10,segno=1,importo=0,incidenza=1,articolo=None)
site=dict(id=CID,nome='Cantiere Empoli',cliente_id=CLIENT,lead_id=None,created_by=None,agente_codice=None)
dedicati=[dict(id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cantiere_id=CID,cod_gamma='AKIBLUE12.1.A',descrizione='Articolo dedicato',prezzo_vendita_speciale=6.5,sconti=[],maggiorazione_perc=0,costo_netto_speciale=3.1,created_at='2026-11-14'),dict(id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cantiere_id=CID,cod_gamma='ABBALB-G02562',descrizione='Altro articolo dedicato',prezzo_vendita_speciale=6.462,sconti=[],maggiorazione_perc=0,costo_netto_speciale=None,created_at='2026-11-14')]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [1280,375]:
   rows=[{**copy.deepcopy(base),'descrizione':'Riga da eliminare','tipo_riga':'manuale','prezzo_unit':10}]; counts={'prezzi':0,'reads':0}; patches=[]; allowed=False; opps=[dict(id=ID,titolo='Opportunità da eliminare',stato='aperta',tipo='vendita',cliente_id=None,lead_id=None,agente_codice=None,valore_stimato=100,created_by=None)]
   prev=dict(id=ID,numero='PRV-PROVA',titolo='Prezzi cantiere applicati',tipo='preventivo',tipo_doc='fornitura',stato='bozza',data='2026-11-14',cliente_id=CLIENT,cantiere_id=CID,cantiere=site,agente_codice=None,alternativa_di=None,iva_perc=22,sconto_piede_perc=10,totale_imponibile=0,iva_importo=0,totale=0,blocchi=[dict(id=BID,preventivo_id=ID,descrizione='Materiali',ordine=10,quantita_base=1,um_base='PZ',righe=rows)])
   ctx=await browser.new_context(viewport={'width':width,'height':1800 if width==1280 else 812})
   page=await ctx.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080')
   key=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'); session=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON')
   if key and session: await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[key,session])
   async def rest(route):
    url=route.request.url; table=url.split('/rest/v1/')[1].split('?')[0]; data=[]; count='0-0/0'; method=route.request.method
    if method=='DELETE':
     assert route.request.headers.get('prefer')=='count=exact',route.request.headers
     assert 'id=in.' in url and 'select=' not in url,url
     if allowed:
      if table=='righe_preventivo':rows.clear()
      if table=='opportunita':opps.clear()
     await route.fulfill(status=204,body='',headers={'content-range':'*/1' if allowed else '*/0','access-control-expose-headers':'content-range'});return
    if table=='opportunita': data=opps
    elif table=='profili': data=dict(id=ID,nome='Operatore',cognome='Prova',codice_agente=None,deve_cambiare_password=False,password_cambiata_il='2026-11-14T12:00:00Z',attivo=True)
    elif table=='cantiere_listini_speciali':
     count='0-1/2'
     if method!='HEAD': data=dedicati; counts['prezzi']+=1
    elif table=='rpc/prezzi_preventivo_cliente':
     data=[dict(articolo_codice=c,prezzo_base=12,sc1=10,sc2=0,sc3=0,sc4=0,sc5=0,sc6=0,maggiorazione_perc=5,costo_ultimo=20 if c=='ART-MANUALE-SOTTO' else 4,um='PZ') for c in route.request.post_data_json['_codici']]
    elif table=='kit':
     kit=dict(id='cccccccc-cccc-4ccc-8ccc-cccccccccccc',nome='Kit prezzi prova',famiglia='parete',um_base='PZ',componenti=[dict(id='comp',articolo_id='art',incidenza=2,ordine=1,tipo_driver=None,valore_driver=None,articolo=dict(id='art',cod_gamma='AKIBLUE12.1.A',descrizione='Componente dedicato',um='PZ',peso_unit=1,listini_acquisto=[],listini_vendita=[]))])
     data=kit if 'id=eq.' in url else [kit]
    elif table=='righe_preventivo' and method=='POST' and isinstance(route.request.post_data_json,list):
     data=route.request.post_data_json
     for i,r in enumerate(data):
      new={**base,**r,'id':f'dddddddd-dddd-4ddd-8ddd-{i:012d}'};prev['blocchi'][-1]['righe'].append(new)
    elif table=='righe_preventivo' and method=='POST':
     new={**base,**route.request.post_data_json,'id':f'44444444-4444-4444-8444-{len(rows):012d}'};rows.append(new); data=new
    elif table=='righe_preventivo' and method=='PATCH':
     rid=url.split('id=eq.')[1].split('&')[0]; row=next(r for r in rows if r['id']==rid);row.update(route.request.post_data_json);patches.append(copy.deepcopy(row));data=row
    elif table=='righe_preventivo':
     if 'id=eq.' in url: data=next(r for r in rows if r['id']==url.split('id=eq.')[1].split('&')[0])
     else:data=rows
    elif table=='blocchi_preventivo' and method=='POST':
     data={**route.request.post_data_json,'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','righe':[]};prev['blocchi'].append(data)
    elif table=='blocchi_preventivo':
     data=[prev['blocchi'][0]]
     if 'id=eq.' in url and 'preventivo_id' not in url: data=prev['blocchi'][0]
    elif table=='preventivi':
     counts['reads']+=1
     if method=='PATCH':prev.update(route.request.post_data_json); data=prev
     elif 'blocchi' in url:data=prev
     elif 'id=eq.' in url:data=prev
    elif table=='rpc/get_cantiere_preventivo':data=[site]
    elif table=='cantieri':data=site
    elif table=='rpc/get_cliente_lite':data=[dict(id=CLIENT,ragione_sociale='Impresa prova')]
    elif table=='rpc/dati_cliente_preventivo':data=[dict(id=CLIENT,ragione_sociale='Impresa prova',codice_gestionale='123')]
    elif table=='rpc/condizioni_preventivo_cliente':data=[dict(listino='L10',sede_nome='Empoli')]
    elif table=='rpc/auth_puo_modificare_cantiere':data=True
    elif table=='articoli_gamma':data=[dict(codice=r.get('articolo_codice'),um='PZ',um2=None,fattore_conversione=None,peso_netto=1,costo_ultimo=4) for r in rows if r.get('articolo_codice')]
    elif table=='user_roles':data=[{'role':'amministratore'}]
    elif table=='rpc/get_user_roles':data=['amministratore']
    await route.fulfill(status=200,json=data,headers={'content-range':count,'access-control-expose-headers':'content-range'})
   await page.route('**/rest/v1/**',rest)
   async def picker(route):
    response=await route.fetch(); body=await response.text()
    items=[dict(codice='AKIBLUE12.1.A',descrizione='Articolo con prezzo cantiere',marca='MADE',um='PZ'),dict(codice='ART-LISTINO',descrizione='Articolo senza prezzo dedicato',marca='MADE',um='PZ')]
    body=body.replace('const cerca = useServerFn(cercaArticoliPreventivo);','const cerca = async () => '+json.dumps(items)+';')
    await route.fulfill(response=response,body=body)
   await page.route('**/src/components/preventivatore/ArticoloGammaPicker.tsx*',picker)
   await page.goto(f'http://localhost:8080/preventivatore/{ID}?tab=corpo');await page.wait_for_timeout(2300)
   await page.screenshot(path=str(OUT/f"debug-{width}.png")); print("state",page.url,(await page.locator("body").inner_text())[-1000:])
   delete=page.get_by_role('button',name='Elimina riga',exact=True).filter(visible=True)
   await delete.wait_for(); before=counts['reads']
   await delete.click();await page.get_by_text('Non hai i permessi per eliminare la riga.',exact=True).wait_for()
   assert len(rows)==1 and counts['reads']==before
   assert await delete.count()==1
   await page.screenshot(path=str(OUT/f'riga-negata-{width}.png'))
   allowed=True;await delete.click();await page.wait_for_timeout(1200)
   assert not rows and await delete.count()==0
   await page.screenshot(path=str(OUT/f'riga-eliminata-{width}.png'))
   allowed=False
   await page.goto('http://localhost:8080/opportunita');await page.get_by_text('Opportunità da eliminare',exact=True).filter(visible=True).first.wait_for()
   deleteopp=page.get_by_role('button',name='Elimina',exact=True).filter(visible=True).first
   await deleteopp.click();confirm=page.get_by_role('alertdialog').get_by_role('button',name='Elimina definitivamente',exact=True)
   await confirm.click();await page.get_by_text('Non hai i permessi per eliminare l’opportunità.',exact=True).wait_for()
   assert len(opps)==1
   await page.get_by_text('Opportunità da eliminare',exact=True).filter(visible=True).first.wait_for()
   await page.screenshot(path=str(OUT/f'opportunita-negata-{width}.png'))
   allowed=True;await deleteopp.click();await page.get_by_role('alertdialog').get_by_role('button',name='Elimina definitivamente',exact=True).click()
   await page.get_by_text('Opportunità eliminata',exact=True).wait_for();await page.wait_for_timeout(700)
   assert not opps
   assert await page.get_by_text('Opportunità da eliminare',exact=True).count()==0
   await page.screenshot(path=str(OUT/f'opportunita-eliminata-{width}.png'))
   print(width,'negata: riga presente senza invalidazione; riuscita: riga rimossa; opportunità negate/riuscite OK', 'errors',errors)
   assert not errors,errors
   await ctx.close()
  await browser.close()
asyncio.run(main())
