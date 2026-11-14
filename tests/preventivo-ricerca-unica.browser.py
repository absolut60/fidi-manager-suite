# Test browser con risposte simulate: nessuna scrittura DB.
# PROVA_VECCHIO_CAPTURE=1 deve fallire sul primo carattere.
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-doppio')
OUT.mkdir(parents=True, exist_ok=True)
ID='11111111-1111-4111-8111-111111111111'
row=dict(id='22222222-2222-4222-8222-222222222222',blocco_id='33333333-3333-4333-8333-333333333333',tipo_riga='articolo_singolo',descrizione='Articolo prova',articolo_codice='ART1',articolo_id=None,quantita=1,prezzo_unit=10,sconti_gamma=[],maggiorazione_perc=0,sconto_perc=0,costo_unit=5,um='PZ',ordine=10,segno=1,importo=10,incidenza=1,articolo=None)
prev=dict(id=ID,numero='PRV-PROVA',titolo='Prova',tipo='preventivo',tipo_doc='fornitura',stato='bozza',data='2026-11-14',cliente_id=None,cantiere_id=None,agente_codice=None,alternativa_di=None,iva_perc=22,totale_imponibile=10,iva_importo=2.2,totale=12.2,blocchi=[dict(id=row['blocco_id'],preventivo_id=ID,descrizione='Blocco prova',ordine=10,quantita_base=1,um_base='PZ',righe=[row])])
# Data responses only: no database writes. Run PROVA_DOPPIO_VECCHIO=1 to replay old picker.
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [1280,900,375]:
   prev['blocchi'][0]['righe']=[row,{**row,'id':'55555555-5555-4555-8555-555555555555','tipo_riga':'manuale','articolo_codice':None,'um':'NR'}, {**row,'id':'66666666-6666-4666-8666-666666666666','tipo_riga':'sotto_totale','articolo_codice':None}, {**row,'id':'77777777-7777-4777-8777-777777777777','articolo_codice':None}]
   site=dict(id='88888888-8888-4888-8888-888888888888',nome='Cantiere prova',cliente_id=None,lead_id=None,created_by=None,agente_codice=None)
   prev.update(cantiere_id=site['id'],cantiere=site)
   ctx=await browser.new_context(viewport={'width':width,'height':1800 if width!=375 else 812})
   page=await ctx.new_page(); errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080')
   k=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'); session=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON')
   if k and session: await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,session])
   async def rest(route):
    url=route.request.url; table=url.split('/rest/v1/')[1].split('?')[0]; data=[]; count='0-0/0'
    if table=='preventivi' and 'blocchi' in url: data=prev
    elif table=='cantieri': data=site
    elif table=='rpc/get_cantiere_preventivo': data=[site]
    elif table=='cantiere_listini_speciali': count='0-1/2'
    elif table=='rpc/auth_puo_modificare_cantiere': data=True
    elif table=='righe_preventivo' and route.request.method=='POST':
     new={**row,**route.request.post_data_json,'id':'44444444-4444-4444-8444-444444444444','articolo_codice':None}; prev['blocchi'][0]['righe'].append(new); data=new
    elif table=='user_roles': data=[{'role':'preventivi_write'}]
    elif table=='rpc/get_user_roles': data=['preventivi_write']
    await route.fulfill(status=200,json=data,headers={'content-range':count,'access-control-expose-headers':'content-range'})
   await page.route('**/rest/v1/**',rest)
   async def picker(route):
    response=await route.fetch(); body=await response.text()
    items=[dict(codice=f'ART{i:02}',descrizione=f'Articolo prova catalogo {i}',marca='MADE',um='PZ') for i in range(30)]
    body=body.replace('const cerca = useServerFn(cercaArticoliPreventivo);', 'const cerca = async () => '+json.dumps(items)+';')
    if os.environ.get('PROVA_DOPPIO_VECCHIO')=='1':
     a=body.index('  useEffect(() => {'); b=a; end=body.index('}, [autoOpen, disabled]);',b)+len('}, [autoOpen, disabled]);')
     body=body[:a]+'useEffect(() => { if(autoOpen) setOpen(true); }, [autoOpen]);'+body[end:]
    await route.fulfill(response=response,body=body)
   await page.route('**/src/components/preventivatore/ArticoloGammaPicker.tsx*',picker)
   await page.goto(f'http://localhost:8080/preventivatore/{ID}?tab=corpo')
   await page.wait_for_timeout(2200)
   um=page.get_by_role('textbox',name='Unità di misura',exact=True).filter(visible=True).first
   assert await um.input_value()=='NR'
   assert await um.evaluate('(e)=>getComputedStyle(e).fontWeight')=='700'
   await um.fill('PZ'); assert await um.input_value()=='PZ'
   # Same number-slot x coordinate, independent of detail icon.
   if width>=768:
    nums=page.locator('tbody td:nth-child(2) .tabular-nums').filter(visible=True)
   else: nums=page.locator(r'.grid-cols-\[24px_40px\] .tabular-nums').filter(visible=True)
   xs=await nums.evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().x)')
   assert len(xs)>=4 and max(xs)-min(xs)<1, xs
   await page.screenshot(path=str(OUT/f'righe-{width}.png'))
   async def search(label):
    await page.wait_for_timeout(750)
    n=await page.locator('input[placeholder="Codice, descrizione o marca…"]').count()
    assert n==1, f'{label}: {n} ricerche'
    field=page.locator('input[placeholder="Codice, descrizione o marca…"]')
    await field.fill('AR')
    results=page.locator('[aria-label="Risultati articoli Gamma"]')
    await results.locator('button').nth(29).wait_for(state='attached')
    dims=await results.evaluate('(e)=>({height:e.clientHeight,total:e.scrollHeight})')
    assert dims['total']>dims['height'], dims
    await results.hover(); await page.mouse.wheel(0,600); await page.wait_for_timeout(250)
    assert await results.evaluate('(e)=>e.scrollTop')>0
    await page.screenshot(path=str(OUT/f'{label}-{width}.png'))
    print(width,label,'ONE popup, 30 results, scrolling',dims)
    await page.keyboard.press('Escape')
   await page.get_by_role('combobox').filter(visible=True).first.click()
   await search('clic')
   await page.get_by_role('button',name='Aggiungi riga',exact=True).filter(visible=True).click()
   await search('auto')
   await page.get_by_role('tab',name='Testata',exact=True).click()
   await page.wait_for_timeout(1500)
   await page.get_by_role('button',name='2 prezzi dedicati',exact=True).click()
   await page.get_by_role('dialog').get_by_role('combobox').click()
   await search('prezzi')
   assert not errors, errors
   await ctx.close()
  await browser.close()
asyncio.run(main())
