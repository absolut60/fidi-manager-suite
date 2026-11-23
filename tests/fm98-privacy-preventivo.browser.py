"""FM98 fetta 2: finestra reale, risposte anagrafiche locali e invio email intercettato.
Per ripetere montare temporaneamente /verifica-fm98-privacy con GeneraDocumentoDialog
(dati sintetici nello script, lead collegato), AuthProvider con user USER/ruolo admin
simulati e getSession/getUser/onAuthStateChange di prova prima del mount.
La pagina temporanea va rimossa dopo il collaudo: mai usare questo bypass nell'app.
Non chiama mai un invio email reale e non scrive dati di prova nel database.
"""
import asyncio, base64, hashlib, re
from pathlib import Path
from pypdf import PdfReader
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/fm98-privacy')
USER='98000000-0000-0000-0000-000000000001'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width,height in [(320,812),(375,812),(390,844),(768,1024),(1280,1800),(1920,1080)]:
   context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width==768)
   page=await context.new_page(); errors=[]; sends=[]; state={'fail':False}
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def rest(route):
    table=route.request.url.split('/rest/v1/')[-1].split('?')[0]
    if table=='profili': data={'id':USER,'nome':'Operatore','cognome':'Prova','attivo':True,'email':'operatore@example.test'}
    elif table=='user_roles': data=[{'role':'amministratore'}]
    elif table=='preferenze_stampa': data={'colonne_righe':None}
    elif table=='configurazioni': data={'valore':'CONDIZIONI DI VENDITA\n\nDECORRENZA\nValide fino al {{validita}}.'}
    elif table=='lead':
     if state['fail']:
      await route.fulfill(status=500,json={'message':'errore modulo simulato'});return
     data={'ragione_sociale':'Azienda prova','nome':None,'cognome':None,'partita_iva':'12345678901','codice_fiscale':'12345678901','tipo_soggetto':'azienda','indirizzo':'Via Prova 1','cap':'20100','citta':'Milano','provincia':'MI','email':'cliente@example.test','cellulare':'3330000000'}
    elif table=='template_email': data=[]
    elif table.startswith('rpc/'): data=[]
    else: data=[]
    await route.fulfill(status=200,json=data)
   async def block_posts(route):
    if '/rest/v1/' in route.request.url: await route.fallback(); return
    if route.request.method=='POST':
     raw=route.request.post_data or ''
     sends.append(raw)
     await route.fulfill(status=200,json={'result':{'ok':True,'destinatari':['cliente@example.test'],'statoNuovo':None,'avvisi':[]},'context':{}})
    else: await route.fallback()
   await page.route('**/rest/v1/**',rest)
   await page.route('**/*',block_posts)
   await page.goto('http://localhost:8080/verifica-fm98-privacy',wait_until='domcontentloaded')
   await page.get_by_role('button',name='Apri genera',exact=True).wait_for()
   await page.wait_for_timeout(400)
   await page.get_by_role('button',name='Apri genera',exact=True).click()
   checkbox=page.get_by_role('checkbox',name='Accoda informativa privacy da firmare',exact=True)
   assert not await checkbox.is_checked()
   await checkbox.check()
   await checkbox.scroll_into_view_if_needed()
   dialog=page.get_by_role('dialog',name='Genera documento',exact=True)
   await dialog.screenshot(path=str(OUT/f'{width}-spunta.png'))
   assert await dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
   await page.get_by_role('button',name='Genera PDF',exact=True).click()
   preview=page.get_by_role('dialog',name='Anteprima documento',exact=True)
   await preview.get_by_text(re.compile('4 pagine')).wait_for()
   await page.wait_for_function('document.querySelectorAll("canvas").length===4')
   await page.wait_for_timeout(800)
   await preview.screenshot(path=str(OUT/f'{width}-anteprima.png'))
   async with page.expect_download() as d:
    await page.get_by_role('button',name='Scarica / Condividi',exact=True).click()
   download=await d.value; path=OUT/f'{width}-unito.pdf';await download.save_as(path)
   data=path.read_bytes(); pdf=PdfReader(path)
   assert len(pdf.pages)==4
   assert 'CONDIZIONI DI VENDITA' in pdf.pages[1].extract_text()
   assert 'INFORMATIVA RESA' in pdf.pages[2].extract_text()
   text=pdf.pages[3].extract_text()
   assert 'FORMULAZIONE DEL CONSENSO' in text and '[X]' not in text and 'Firma' in text
   assert 'Via Prova 1' in text and '12345678901' in text
   # Stampa: intercetta solo l'apertura del PDF, non altera i byte né stampa davvero.
   await page.evaluate('window.open=(url)=>{window.__printUrl=url;return {addEventListener(){}}}')
   await page.get_by_role('button',name='Stampa',exact=True).click()
   print_b64=await page.evaluate('async()=>{const b=new Uint8Array(await (await fetch(window.__printUrl)).arrayBuffer());let s="";for(const v of b)s+=String.fromCharCode(v);return btoa(s)}')
   assert base64.b64decode(print_b64)==data
   await page.get_by_role('button',name='Invia per email',exact=True).click()
   await page.get_by_label('Destinatario',exact=True).wait_for()
   await page.get_by_label('Destinatario',exact=True).fill('cliente@example.test')
   await page.get_by_label('Oggetto',exact=True).fill('Documento di prova')
   await page.get_by_label('Testo',exact=True).fill('Test locale: nessun invio reale.')
   await page.get_by_role('button',name='Invia',exact=True).click()
   await page.get_by_text(re.compile('inviato a cliente')).wait_for()
   assert len(sends)==1
   candidates=re.findall(r'[A-Za-z0-9+/=]{1000,}',sends[0])
   assert any(base64.b64decode(c)==data for c in candidates),'allegato email diverso dal PDF anteprima/scarico'
   # Chiude l'anteprima, riapre: la scelta NON resta selezionata.
   await page.get_by_role('dialog',name='Anteprima documento',exact=True).get_by_role('button',name='Chiudi',exact=True).first.click()
   await page.get_by_role('button',name='Apri genera',exact=True).click()
   assert not await checkbox.is_checked()
   # Liste interne: nessuna spunta; Proposta rapida: spunta disponibile.
   await page.get_by_text('Lista materiali',exact=True).click()
   assert await checkbox.count()==0
   await page.get_by_text('Lista mat. fornitore',exact=True).click()
   assert await checkbox.count()==0
   await page.get_by_text('Proposta rapida',exact=True).click()
   assert not await checkbox.is_checked()
   await checkbox.check(); state['fail']=True
   await page.get_by_role('button',name='Genera PDF',exact=True).click()
   await page.get_by_text('Informativa privacy non accodata',exact=True).wait_for()
   await page.get_by_role('dialog',name='Anteprima documento',exact=True).get_by_text(re.compile('2 pagine')).wait_for()
   await page.screenshot(path=str(OUT/f'{width}-errore-modulo.png'))
   assert not errors,errors
   print(f'{width}: spunta/reset, 4 pagine, scarico/stampa/email stesso PDF, liste escluse e ripiego errore OK; overflow/errori assenti')
   await context.close()
  await browser.close()
asyncio.run(main())
