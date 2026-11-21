import asyncio,json,copy
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm91-kit-preventivo')
calc=[{'n_pezzi':1,'peso_unitario':8.7},{'n_pezzi':1,'consumo':0.716666666666667},{'n_pezzi':2,'passo':0.6,'sfrido':0.05},{'n_pezzi':1,'peso_unitario':0.59},{'n_pezzi':1,'peso_unitario':8.7},{'n_pezzi':1,'confezione':20},{'riga_rif':2,'passo':0.5,'peso_unitario':0.0043},{'riga_rif':3,'lati':2,'passo':0.2,'confezione':1000,'peso_unitario':1.4},{'consumo':0.4,'lati':2,'confezione':10,'peso_unitario':10},{'consumo':1.44,'lati':2,'confezione':90,'peso_unitario':0.3}]
codes=['FASL00A003300A0','COG10U050/40','COG10C050/50','KNI730060','FASL00A003300A0','AKINAF07003','TASSELLO','VITI','STUCCO','NASTRO']
roles=['LASTRE','GUIDE','MONTANTI','ISOLANTI','LASTRE','NASTRO','TASSELLI','VITI','STUCCO','NASTRO']
names=['LASTRA CARTONGESSO GYPSOTECH STD BA 1200X3000 SP.13 MM','GUIDA U50 40/50/40 6/10 - ML.3 (8 pz/conf)','MONTANTE C50 50/48/47 6/10 - ML.3 (8 pz/conf)','ROTOLO DECIWOOL D.13 45X600X(2x7800) MM (18,72 MQ/CF)','LASTRA CARTONGESSO GYPSOTECH STD BA 1200X3000 SP.13 MM','NASTRO BIADESIVO MM.50X20MT','TASSELLO','VITI','STUCCO','NASTRO']
kit=dict(id='kit',codice='SM-PAR-2L-75-50',nome='PARETE 75/50 LASTRE 1+1',linea='sistema_made',famiglia_id='pareti',um_base='mq',descrizione_tecnica='Parete semplice',componenti=[dict(ordine=i+1,articolo_codice=codes[i],ruolo=roles[i],**c) for i,c in enumerate(calc)])
gamma=[dict(codice=codes[i],descrizione=names[i],um='ML' if i in [1,2] else 'MQ',peso_netto=.25,um2=None,fattore_conversione=None) for i in range(10)]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [375,1280]:
   rows=[];blocks=[];calls=[];errors=[];prev=dict(linea='sistema_made',iva_perc=22,regime_iva='ordinaria')
   ctx=await browser.new_context(viewport={'width':width,'height':1800});page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   async def rest(route):
    parsed=urlparse(route.request.url);table=parsed.path.split('/rest/v1/')[1];qs=parse_qs(parsed.query);method=route.request.method;payload=route.request.post_data_json if method in ['POST','PATCH'] else None
    data=[]
    if table=='kit':data=kit if 'id' in qs else [kit,{**kit,'id':'showroom','linea':'showroom','nome':'KIT SHOWROOM NON VISIBILE'}]
    elif table=='kit_famiglie':data=[dict(id='pareti',linea='sistema_made',nome='Pareti',ordine=1,attiva=True)]
    elif table=='articoli_gamma':data=gamma
    elif table=='rpc/prezzi_preventivo_riferimento':
     calls.append(payload);data=[dict(articolo_codice=c,um='MQ',prezzo_base=10,sc1=17,sc2=5,sc3=0,sc4=0,sc5=0,sc6=0,maggiorazione_perc=10,costo_ultimo=3) for c in payload['_codici']]
    elif table=='blocchi_preventivo':
     if method=='POST':
      b={**payload,'id':f'b{len(blocks)}'};blocks.append(b);data=b
     elif method=='PATCH':
      b=next(b for b in blocks if 'eq.'+b['id']==qs.get('id',[''])[0]);b.update(payload);data=b
     elif 'id' in qs and 'preventivo:preventivi' in qs.get('select',[''])[0]:data={'preventivo_id':'p','preventivo':prev}
     else:data=[{**b,'righe':[r for r in rows if r['blocco_id']==b['id']]} for b in blocks]
    elif table=='righe_preventivo':
     if method=='POST':
      for r in payload:rows.append({**r,'id':f'r{len(rows)}','articolo':None})
      data=rows
     elif method=='PATCH':
      r=next(r for r in rows if 'eq.'+r['id']==qs.get('id',[''])[0]);r.update(payload);data=r
     else:data=rows
    elif table=='preventivi':
     if method=='PATCH':prev.update(payload)
     data=prev
    else:raise Exception('Unexpected real data request '+table)
    await route.fulfill(status=200,json=data)
   await page.route('**/rest/v1/**',rest)
   await page.goto('http://localhost:8080/verifica-kit-preventivo');await page.wait_for_timeout(1500);await page.get_by_role('button',name='Aggiungi blocco',exact=True).click()
   dialog=page.get_by_role('dialog');await page.wait_for_timeout(1500);print('DIALOG',await dialog.inner_text());await page.screenshot(path=str(OUT/'diagnosi.png'));await dialog.get_by_role('button').filter(has_text='SM-PAR-2L-75-50').wait_for()
   assert 'KIT SHOWROOM NON VISIBILE' not in await dialog.inner_text()
   await dialog.get_by_role('textbox').fill('100')
   await dialog.screenshot(path=str(OUT/f'{width}-scelta.png'))
   await dialog.get_by_role('button').filter(has_text='SM-PAR-2L-75-50').click();await dialog.get_by_role('button',name='Aggiungi kit',exact=True).click()
   await page.get_by_role('textbox',name='Quantità mq',exact=True).wait_for();await page.wait_for_timeout(500)
   assert len(rows)==10 and len(calls)==1
   assert rows[2]['quantita']==338.33 and rows[6]['quantita']==143.33 and rows[7]['quantita']==1.69
   assert rows[0]['ruolo_kit']=='LASTRE' and rows[0]['peso']==869.9999999999999
   await page.screenshot(path=str(OUT/f'{width}-blocco.png'))
   mq=page.get_by_role('textbox',name='Quantità mq',exact=True);await mq.fill('200');await mq.press('Tab');await page.wait_for_timeout(600)
   assert rows[2]['quantita']==676.67 and abs(rows[0]['peso']-1740)<1e-10
   assert await mq.input_value()=='200'
   await page.screenshot(path=str(OUT/f'{width}-ricalcolo.png'))
   kit['componenti'][2]['passo']=0
   await page.get_by_role('button',name='Aggiungi blocco',exact=True).click();dialog=page.get_by_role('dialog');await dialog.get_by_role('button').filter(has_text='SM-PAR-2L-75-50').click();await dialog.get_by_role('button',name='Aggiungi kit',exact=True).click()
   warning=page.get_by_role('dialog',name='Righe del kit non inserite');await warning.wait_for()
   assert 'Divisione per zero' in await warning.inner_text() and 'MONTANTE' in await warning.inner_text() and 'VITI' in await warning.inner_text()
   await warning.screenshot(path=str(OUT/f'{width}-avviso.png'));await warning.get_by_role('button',name='Ho capito',exact=True).click()
   kit['componenti'][2]['passo']=.6
   overflow=await page.evaluate('document.documentElement.scrollWidth-innerWidth');assert overflow==0,overflow
   assert not errors,errors
   print(width,'OK 10 righe, stesso prezzo FM71, mq 100→200, peso e ruoli, avviso errori, overflow 0/errori 0')
   await ctx.close()
  await browser.close()
asyncio.run(main())
