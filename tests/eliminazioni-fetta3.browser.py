import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm69-3'); ID='11111111-1111-4111-8111-111111111111'
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
     if table=='allegati' and allowed:n=1;files.clear()
     if table=='campagne_email_destinatari' and allowed:n=2;people=people[2:]
     await route.fulfill(status=204,body='',headers={'content-range':f'*/{n}','access-control-expose-headers':'content-range'});return
    if table=='profili':
     profile=dict(id=ID,nome='Operatore',cognome='Prova',attivo=True,deve_cambiare_password=False,password_cambiata_il='2026-11-14T12:00:00Z');data=profile if 'id=eq.' in route.request.url else [profile]
    elif table=='user_roles':data=[{'role':'amministratore'}]
    elif table=='rpc/get_user_roles':data=['amministratore']
    elif table=='task':data=dict(id=ID,titolo='Task prova allegato',stato='da_fare',titolare_id=ID,esecutore_id=None)
    elif table=='campagne_whatsapp':data=[dict(id=ID,nome='Campagna WA prova',stato='bozza',parametri={},created_at='2026-11-14',updated_at='2026-11-14')]
    elif table=='messaggi_whatsapp':data=[dict(id=p['id'],campagna_id=ID,stato='in_coda') for p in people]
    elif table=='campagne_email_marketing':data=[dict(id=ID,nome='Campagna email prova',stato='bozza',oggetto='Prova',created_at='2026-11-14',updated_at='2026-11-14')]
    elif table=='campagne_email_destinatari':data=[dict(id=p['id'],email=f"prova{i}@example.test",nome_riferimento=p['nome'],tipo_destinatario='cliente',stato_invio='da_inviare') for i,p in enumerate(people)]
    elif table=='rpc/get_conteggi_campagne_email':data=[dict(campagna_id=ID,totale=len(people),da_inviare=len(people),inviato=0,fallito=0,saltato=0)]
    elif table=='eventi':data=dict(id=ID,nome='Evento prova',data_evento='2026-11-14',iscrizioni_aperte=False)
    elif table=='v_eventi_partecipanti_stato':data=people
    await route.fulfill(status=200,json=data,headers={'content-range':f'0-2/{len(people)}','access-control-expose-headers':'content-range'})
   await page.route('**/rest/v1/**',rest)
   async def storage(route):
    if route.request.method=='DELETE':calls.append('storage');await route.fulfill(status=200,json=[])
    else:await route.fulfill(status=200,body='')
   await page.route('**/storage/v1/**',storage)
   await page.goto('http://localhost:8080/marketing/campagne');await page.get_by_role('tab',name='WhatsApp',exact=True).click();await page.get_by_text('Campagna WA prova',exact=True).wait_for()
   await page.get_by_role('tabpanel').filter(visible=True).locator('button[title="Elimina"]').click();dialog=page.get_by_role('alertdialog')
   await dialog.get_by_role('button',name='Elimina',exact=True).click();await page.get_by_text('Non hai i permessi per eliminare i messaggi della campagna.',exact=True).wait_for();assert calls==['messaggi_whatsapp'];assert await dialog.is_visible();await page.screenshot(path=str(OUT/f'wa-figli-negati-{width}.png'))
   await dialog.get_by_role('button',name='Annulla',exact=True).click();await page.get_by_role('tab',name='Email',exact=True).click();await page.get_by_text('Campagna email prova',exact=True).wait_for()
   await page.locator('button[title="Destinatari"]').filter(visible=True).click();dialog=page.get_by_role('dialog',name='Destinatari — Campagna email prova',exact=True)
   await dialog.get_by_role('checkbox',name='Seleziona tutti in pagina',exact=True).check();await dialog.get_by_role('button').filter(has_text='Rimuovi selezionati').click();confirm=page.get_by_role('alertdialog');allowed=True
   await confirm.get_by_role('button',name='Rimuovi definitivamente',exact=True).click();await page.get_by_text('Eliminati 2 su 3: per gli altri non hai i permessi.',exact=True).wait_for();await page.wait_for_timeout(700);assert len(people)==1;assert await confirm.is_visible();await page.screenshot(path=str(OUT/f'email-conferma-parziale-{width}.png'));await confirm.get_by_role('button',name='Annulla',exact=True).click();await page.wait_for_timeout(900);assert await page.get_by_role('row').count() >= 2;assert await page.get_by_role('dialog').get_by_text('1 selezionati',exact=True).count()==1;await page.screenshot(path=str(OUT/f'email-parziale-{width}.png'))
   print(width,'figli negati: padre mai chiamato; email 2 su 3: lista ricaricata, nessun successo',errors);assert not errors;await ctx.close()
  await browser.close()
asyncio.run(main())
