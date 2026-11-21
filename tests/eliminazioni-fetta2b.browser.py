import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-2b'); ID='11111111-1111-4111-8111-111111111111'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [1280,375]:
   ctx=await browser.new_context(viewport={'width':width,'height':1800 if width==1280 else 812});page=await ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080');key=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY');session=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON')
   if key and session: await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[key,session])
   allowed=False; calls=[]; files=[dict(id=ID,nome_file='Documento prova.pdf',storage_path='test/prova.pdf',mime_type='application/pdf',dimensione_bytes=100,created_at='2026-11-14',caricato_da=ID)]
   people=[dict(id=f'22222222-2222-4222-8222-{i:012d}',nome=f'Partecipante {i}',cognome='Prova',stato='atteso',lead_id=None,cliente_id=None,contatto_id=None,lead=None,cliente=None,contatto=None,origine='manuale') for i in range(3)]
   async def rest(route):
    nonlocal people
    table=route.request.url.split('/rest/v1/')[1].split('?')[0];method=route.request.method;data=[]
    if method=='DELETE':
     assert route.request.headers.get('prefer')=='count=exact';calls.append(table)
     n=0
     if table in ['template_email','kit_componenti'] and allowed:n=1;files.clear()
     if table=='eventi_partecipanti' and allowed:n=2;people=people[2:]
     await route.fulfill(status=204,body='',headers={'content-range':f'*/{n}','access-control-expose-headers':'content-range'});return
    if table=='profili':
     profile=dict(id=ID,nome='Operatore',cognome='Prova',attivo=True,deve_cambiare_password=False,password_cambiata_il='2026-11-14T12:00:00Z');data=profile if 'id=eq.' in route.request.url else [profile]
    elif table=='user_roles':data=[{'role':'amministratore'}]
    elif table=='rpc/get_user_roles':data=['amministratore']
    elif table=='task':data=dict(id=ID,titolo='Task prova allegato',stato='da_fare',titolare_id=ID,esecutore_id=None)
    elif table=='template_email':data=[dict(id=ID,nome='Template prova',oggetto='Prova',corpo='Prova',tipo='libero',attivo=True)] if files else []
    elif table=='kit':data=dict(id=ID,nome='Kit prova',linea='sistema_made',famiglia_id=None,um_base='PZ',componenti=[dict(id=ID,kit_id=ID,ordine=1,articolo_codice=None,articolo=None,n_pezzi=1)] if files else [])
    elif table=='eventi':data=dict(id=ID,nome='Evento prova',data_evento='2026-11-14',iscrizioni_aperte=False)
    elif table=='v_eventi_partecipanti_stato':data=people
    await route.fulfill(status=200,json=data)
   await page.route('**/rest/v1/**',rest)
   async def storage(route):
    if route.request.method=='DELETE':calls.append('storage');await route.fulfill(status=200,json=[])
    else:await route.fulfill(status=200,body='')
   await page.route('**/storage/v1/**',storage)
   await page.goto('http://localhost:8080/template-email');row=page.get_by_role('row').filter(has_text='Template prova');await row.wait_for();await row.get_by_role('button').last.click();dialog=page.get_by_role('alertdialog')
   await dialog.get_by_role('button',name='Elimina',exact=True).click();await page.get_by_text('Non hai i permessi per eliminare il template.',exact=True).wait_for();assert files and await dialog.is_visible();await page.screenshot(path=str(OUT/f'template-negato-{width}.png'))
   allowed=True;await dialog.get_by_role('button',name='Elimina',exact=True).click();await page.get_by_text('Template eliminato',exact=True).wait_for();await page.wait_for_timeout(600);assert not files;await page.screenshot(path=str(OUT/f'template-eliminato-{width}.png'))
   files.append({'id':ID});allowed=False;await page.goto(f'http://localhost:8080/kit/{ID}');row=page.get_by_role('row').filter(has=page.get_by_role('combobox')).last
   await page.get_by_role('heading',name='Componenti',exact=True).wait_for();delete=page.locator('tbody button').filter(has=page.locator('svg.lucide-trash-2')).last
   await delete.click();await page.get_by_text('Non hai i permessi per eliminare il componente.',exact=True).wait_for();assert files;assert await delete.count()==1;await page.screenshot(path=str(OUT/f'kit-negato-{width}.png'))
   allowed=True;await delete.click();await page.get_by_text('Nessun componente. Aggiungi la prima riga.',exact=True).wait_for();assert not files;await page.screenshot(path=str(OUT/f'kit-eliminato-{width}.png'))
   print(width,'template negato/riuscito e componente kit negato/riuscito OK',errors);assert not errors;await ctx.close()
  await browser.close()
asyncio.run(main())
