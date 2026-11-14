import asyncio,json,os,copy
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-applicazione')
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
   rows=[copy.deepcopy(base)]; counts={'prezzi':0}; patches=[]
   prev=dict(id=ID,numero='PRV-PROVA',titolo='Prezzi cantiere applicati',tipo='preventivo',tipo_doc='fornitura',stato='bozza',data='2026-11-14',cliente_id=CLIENT,cantiere_id=CID,cantiere=site,agente_codice=None,alternativa_di=None,iva_perc=22,sconto_piede_perc=10,totale_imponibile=0,iva_importo=0,totale=0,blocchi=[dict(id=BID,preventivo_id=ID,descrizione='Materiali',ordine=10,quantita_base=1,um_base='PZ',righe=rows)])
   ctx=await browser.new_context(viewport={'width':width,'height':1800 if width==1280 else 812})
   page=await ctx.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080')
   key=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'); session=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON')
   if key and session: await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[key,session])
   async def rest(route):
    url=route.request.url; table=url.split('/rest/v1/')[1].split('?')[0]; data=[]; count='0-0/0'; method=route.request.method
    if table=='cantiere_listini_speciali':
     count='0-1/2'
     if method!='HEAD': data=dedicati; counts['prezzi']+=1
    elif table=='rpc/prezzi_preventivo_cliente':
     data=[dict(articolo_codice=c,prezzo_base=12,sc1=10,sc2=0,sc3=0,sc4=0,sc5=0,sc6=0,maggiorazione_perc=5,costo_ultimo=4,um='PZ') for c in route.request.post_data_json['_codici']]
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
    elif table=='user_roles':data=[{'role':'preventivi_write'}]
    elif table=='rpc/get_user_roles':data=['preventivi_write']
    await route.fulfill(status=200,json=data,headers={'content-range':count,'access-control-expose-headers':'content-range'})
   await page.route('**/rest/v1/**',rest)
   async def picker(route):
    response=await route.fetch(); body=await response.text()
    items=[dict(codice='AKIBLUE12.1.A',descrizione='Articolo con prezzo cantiere',marca='MADE',um='PZ'),dict(codice='ART-LISTINO',descrizione='Articolo senza prezzo dedicato',marca='MADE',um='PZ')]
    body=body.replace('const cerca = useServerFn(cercaArticoliPreventivo);','const cerca = async () => '+json.dumps(items)+';')
    await route.fulfill(response=response,body=body)
   await page.route('**/src/components/preventivatore/ArticoloGammaPicker.tsx*',picker)
   await page.goto(f'http://localhost:8080/preventivatore/{ID}?tab=corpo');await page.wait_for_timeout(2300)
   badge=page.get_by_role('button',name='2 prezzi dedicati',exact=True)
   await badge.wait_for();assert counts['prezzi']==1,counts
   async def choose(code):
    await page.get_by_role('textbox',name='Cerca articolo Gamma',exact=True).fill('AR')
    await page.get_by_role('button').filter(has_text=code).last.click();await page.wait_for_timeout(1100)
   await page.get_by_role('combobox').filter(visible=True).first.click();await choose('AKIBLUE12.1.A')
   assert rows[0]['prezzo_unit']==6.5 and rows[0]['costo']==3.1 and rows[0]['sconto_perc']==10,rows
   marker=page.locator('[title="Prezzo cantiere"]').filter(visible=True); assert await marker.count()==1
   assert await marker.locator('input').input_value()=='6,5000'
   await page.screenshot(path=str(OUT/f'cantiere-{width}.png'))
   await page.get_by_role('button',name='Aggiungi riga',exact=True).filter(visible=True).click();await choose('ART-LISTINO')
   assert rows[-1]['prezzo_unit']==12 and rows[-1]['sconti_gamma']==[10] and rows[-1]['maggiorazione_perc']==5,rows
   assert await marker.count()==1
   await page.screenshot(path=str(OUT/f'listino-{width}.png'))
   # Manual edit removes indicator, and chosen update restores all site terms without touching extra.
   await marker.locator('input').fill('8');await marker.locator('input').press('Tab');await page.wait_for_timeout(1000)
   assert await marker.count()==0
   await page.get_by_role('button',name='Aggiorna listini',exact=True).click();await page.get_by_role('button',name='Confronta',exact=True).click();await page.wait_for_timeout(1000)
   await page.screenshot(path=str(OUT/f'confronto-{width}.png'))
   print('dialog',await page.get_by_role('dialog').inner_text())
   apply=page.get_by_role('dialog').get_by_role('button').filter(has_text='Applica');await apply.click();await page.wait_for_timeout(1000)
   assert rows[0]['prezzo_unit']==6.5 and rows[0]['sconto_perc']==10,rows
   assert await marker.count()==1
   await badge.click();await page.get_by_role('dialog',name='Prezzi del cantiere',exact=True).wait_for();await page.screenshot(path=str(OUT/f'corpo-finestra-{width}.png'))
   assert counts['prezzi']==1,counts
   await page.get_by_role('dialog').get_by_role('button',name='Chiudi',exact=True).click()
   await page.get_by_role('button',name='Da Kit',exact=True).click()
   await page.get_by_role('button').filter(has_text='Kit prezzi prova').click()
   await page.get_by_role('button',name='Aggiungi kit',exact=True).click();await page.wait_for_timeout(1200)
   component=prev['blocchi'][-1]['righe'][0]
   assert component['prezzo_unit']==6.5 and component['sconto_perc']==10 and component['quantita']==2 and component['costo']==6.2,component
   await page.screenshot(path=str(OUT/f'kit-{width}.png'))
   assert not errors,errors
   print(width,'dedicato 6.5/3.1, extra 10; listino 12; segno modifica e confronto ripristino; Corpo opens; one price read')
   await ctx.close()
  await browser.close()
asyncio.run(main())
