# FM79 — Non-regressione telefono e PC

Scopo: dimostrare in ogni fetta tablet che **telefono e PC non cambiano di un pixel**.

- Script: `docs/verifiche/fm79-regressione/regressione.py` (misure di supporto in `misura.js`, stessa cartella).
- Pagine: tutte quelle in `src/routes/_app` (74), lette automaticamente dalla cartella, quindi una pagina nuova entra da sola nel controllo.
- Dimensioni:
  - **375×812** telefono (touch attivo);
  - **1280×800** e **1440×900** PC con mouse (`hasTouch:false`).
- Utente e dati sono simulati nel browser (amministratore, 14 righe finte per tabella con nomi lunghi e importi grandi): non serve accedere e non si scrive nulla nel database. Orologio fermo al 16/11/2026 09:00, animazioni spente, una sessione nuova per ogni pagina, fotografia scattata solo quando due immagini consecutive sono uguali.
- Le immagini vanno in `/tmp/fm79-regressione/prima` e `/tmp/fm79-regressione/dopo` (fuori dal progetto).

## Come si usa in ogni fetta

Con l'anteprima in esecuzione su `http://localhost:8080`:

```bash
# 1. PRIMA di toccare il codice
python3 docs/verifiche/fm79-regressione/regressione.py prima

# 2. applicare la fetta

# 3. DOPO la fetta (aspettare che l'anteprima abbia ricaricato)
python3 docs/verifiche/fm79-regressione/regressione.py dopo

# 4. confronto pixel per pixel
python3 docs/verifiche/fm79-regressione/regressione.py confronta
```

- `confronta` esce con codice 0 e scrive `diverse: 0` solo se **tutte** le immagini sono identiche. Altrimenti elenca file e zona dei pixel diversi ed esce con codice 1: la fetta non è finita.
- Prima di dichiarare una differenza, `confronta` rifotografa da sola le pagine diverse fino a 2 volte. Serve a distinguere un caricamento lento (per esempio il riquadro "Attiva le notifiche", che compare dopo un attimo) da un cambiamento vero.
- Durata: circa 15–20 minuti per l'intero giro (74 pagine × 3 dimensioni). Per una prova veloce si possono passare alcune pagine, separate da virgola, sia a `prima` sia a `dopo`:

```bash
python3 docs/verifiche/fm79-regressione/regressione.py prima /dashboard,/clienti,/richieste
python3 docs/verifiche/fm79-regressione/regressione.py dopo  /dashboard,/clienti,/richieste
python3 docs/verifiche/fm79-regressione/regressione.py confronta
```

  La prova veloce non sostituisce il giro completo a fine fetta.

## Prova dello script (16/11/2026)

Due giri `prima`/`dopo` senza alcuna modifica al codice su 6 pagine (dashboard, clienti, preventivi, richieste, scadenziario, lead) × 3 dimensioni = 18 immagini: `Confrontate 18 immagini, diverse: 0`. Al primo confronto una pagina era risultata diversa per il riquadro delle notifiche ancora in arrivo; la nuova fotografia automatica l'ha risolta.

## Limiti

- Le pagine di dettaglio (scheda cliente, preventivo, richiesta, …) con dati simulati restano sullo scheletro di caricamento: per loro lo script garantisce l'invarianza dell'impaginazione esterna, non del contenuto. Per le fette che le toccano serve in più una verifica con accesso vero.
- Le finestre (dialog) non vengono aperte dallo script: le fette che toccano `dialog.tsx`/`sheet.tsx` aggiungono fotografie a 375/1280/1440 delle finestre toccate, prima e dopo.

## Note dalla fetta 1 (16/11/2026)

- Con più gruppi in parallelo alcune pagine possono essere fotografate a metà caricamento ("Caricamento…", scheletri). Lo script ora aspetta fino a 10 s che spariscano; se una differenza mostra solo uno stato di caricamento, si rifotografa quella pagina **in entrambe le fasi** con il codice corrispondente.

## Testo completo dello script

Copia identica di `fm79-regressione/regressione.py` (se differiscono, vale il file .py).

```python
"""FM79 — non-regressione telefono/PC (fotografie e confronto pixel).

Uso:
  python3 docs/verifiche/fm79-regressione/regressione.py prima   # PRIMA della fetta
  python3 docs/verifiche/fm79-regressione/regressione.py dopo    # DOPO la fetta
  python3 docs/verifiche/fm79-regressione/regressione.py confronta
  (facoltativo, solo alcune pagine)  ... regressione.py prima /dashboard,/clienti

Utente e dati sono SIMULATI dentro il browser (nessun accesso reale, nessuna
scrittura): ogni chiamata al backend viene intercettata e riceve righe finte
generate dallo schema (nomi lunghi, importi grandi, 14 righe per tabella).
Le immagini vanno in /tmp/fm79-regressione/<fase>/ (non nel progetto).
"""
import asyncio, base64, json, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path("/tmp/fm79-regressione")
DIMENSIONI = [  # (larghezza, altezza, touch)
    (375, 812, True),     # telefono
    (1280, 800, False),   # PC con mouse
    (1440, 900, False),   # PC con mouse
]
UID = "00000000-0000-4000-8000-000000000001"
NOMI = ["CARICO MONGIUSTI COSTRUZIONI EDILI E RISTRUTTURAZIONI GENERALI S.R.L.", "PIPPO SRL",
        "EDILIZIA BRIANZA SOCIETA' COOPERATIVA A RESPONSABILITA' LIMITATA", "Ombretta Giannubilo",
        "IMPRESA ROSSI GIUSEPPE & FIGLI S.N.C. DI ROSSI MARIO"]
DATA_FISSA = "2026-11-16T09:00:00Z"  # orologio bloccato: immagini ripetibili

def leggi_schema():
    s = (ROOT / "src/integrations/supabase/types.ts").read_text()
    pub = s[s.index("public: {"):]
    tabelle = {}
    for m in re.finditer(r"\n      (\w+): \{\n        Row: \{\n(.*?)\n        \}", pub, re.S):
        tabelle[m.group(1)] = dict(re.findall(r"\n\s+(\w+): (.*)", "\n" + m.group(2)))
    e = s[s.index("    Enums: {"):]; e = e[:e.index("    CompositeTypes")]
    enum = {m.group(1): re.findall(r'"([^"]*)"', m.group(2))
            for m in re.finditer(r'\n      (\w+):((?:\n\s+\| "[^"]*")+|\s*"[^"]*")', e)}
    return tabelle, enum

TAB, ENUM = leggi_schema()

def uid(i): return f"00000000-0000-4000-8000-{i:012d}"

def valore(col, t, i):
    nullable = "| null" in t; base = t.replace("| null", "").strip(); c = col.lower()
    m = re.search(r'Enums"\]\["(\w+)"\]', base)
    if m: v = ENUM.get(m.group(1), ["x"]); return v[i % len(v)]
    if base.startswith("string"):
        if base.endswith("[]"): return []
        if c == "id": return uid(i + 1)
        if c.endswith("_id") or c in ("creato_da", "assegnato_a", "approvato_da"): return UID
        if c.endswith("_at"): return f"2026-{i % 12 + 1:02d}-{i % 27 + 1:02d}T09:00:00Z"
        if c.startswith("data") or c.endswith("_il") or "scadenz" in c or c in ("validita", "dal", "al"):
            return f"2026-{i % 12 + 1:02d}-{i % 27 + 1:02d}"
        if "email" in c: return f"amministrazione.contabilita{i}@carico-mongiusti-costruzioni.it"
        if "telefono" in c or "cell" in c: return "+39 333 1234567"
        if "codice" in c: return f"C{100000 + i}"
        if c in ("stato", "tipo", "linea", "role", "tipo_doc", "priorita", "categoria", "esito"):
            return None if nullable else "x"
        return NOMI[i % len(NOMI)] + (f" {i}" if i > 4 else "")
    if base.startswith("number"):
        if any(k in c for k in ("perc", "giorni", "gg", "ordine", "anno", "mese", "n_", "num", "count")):
            return (i * 7) % 95 + 1
        return round(1234567.89 * (1 + i % 3), 2)
    if base.startswith("boolean"): return c in ("attivo", "is_active", "visibile", "abilitato")
    return None

def righe(tab, n=14):
    cols = TAB.get(tab)
    if not cols: return []
    out = [{c: valore(c, t, i) for c, t in cols.items()} for i in range(n)]
    if tab == "profili":
        for r in out: r["attivo"] = True
        out[0].update(id=UID, nome="Andrea", cognome="Giani", email="andrea.giani@made.it")
    if tab == "user_roles": out = [{"id": uid(1), "user_id": UID, "role": "amministratore"}]
    return out

def sessione():
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    exp = int(time.time()) + 86400
    tok = b({"alg": "HS256", "typ": "JWT"}) + "." + b({"sub": UID, "role": "authenticated", "exp": exp, "aud": "authenticated"}) + ".x"
    user = {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "andrea.giani@made.it",
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}
    return user, {"access_token": tok, "refresh_token": "r", "expires_in": 86400, "expires_at": exp,
                  "token_type": "bearer", "user": user}

USER, SESSION = sessione()

async def backend_finto(route):
    req = route.request; url = req.url
    if "/auth/v1/" in url:
        return await route.fulfill(json=USER if "/user" in url else SESSION)
    if "/rest/v1/" not in url: return await route.continue_()
    path = url.split("/rest/v1/")[1].split("?")[0]
    if req.method != "GET" and not path.startswith("rpc/"): return await route.fulfill(json=[])
    data = [] if path.startswith("rpc/") else righe(path)
    h = {"content-range": f"0-{max(len(data) - 1, 0)}/{len(data)}", "access-control-expose-headers": "content-range"}
    if "pgrst.object" in req.headers.get("accept", ""):
        return await route.fulfill(json=data[0] if data else None, headers=h, status=200 if data else 406)
    await route.fulfill(json=data, headers=h)

def pagine():
    base = ROOT / "src/routes/_app"; ps = []
    for f in sorted(base.iterdir()):
        if f.is_dir():
            ps += [f"/{f.name}/{g.stem}" for g in sorted(f.iterdir())]; continue
        n = f.stem
        if n in ("lead", "task", "opportunita"): continue  # solo contenitori
        n = re.sub(r"\$\w+", UID, n.replace(".index", "").replace(".", "/"))
        ps.append("/" + n.replace(f"/codice/{UID}", "/codice/C100000"))
    return ps

SOLO = [a for a in sys.argv[2].split(",")] if len(sys.argv) > 2 and sys.argv[2] else None  # facoltativo: elenco pagine
AZZERA_SCROLL = "()=>{document.activeElement&&document.activeElement.blur();window.scrollTo(0,0);document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0})}"
MISURA = (Path(__file__).parent / "misura.js").read_text()

async def fotografa(fase):
    cartella = OUT / fase; cartella.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for (w, h, touch) in DIMENSIONI:
            for path in (SOLO or pagine()):
                # Contesto nuovo per ogni pagina: nessuno stato condiviso fra pagine.
                ctx = await b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch,
                                          device_scale_factor=1, reduced_motion="reduce", locale="it-IT",
                                          timezone_id="Europe/Rome")
                await ctx.route("**/*.supabase.co/**", backend_finto)
                pg = await ctx.new_page()
                await pg.clock.set_fixed_time(DATA_FISSA)
                await pg.goto("http://localhost:8080/login")
                await pg.evaluate("([k,v])=>localStorage.setItem(k,v)",
                                  ["sb-bbjmdrctjkoliclmqzcl-auth-token", json.dumps(SESSION)])
                for tentativo in range(3):  # navigazione interrotta dal server di sviluppo: si riprova
                    try:
                        await pg.goto("http://localhost:8080" + path, wait_until="domcontentloaded"); break
                    except Exception:
                        if tentativo == 2: raise
                        await pg.wait_for_timeout(1500)
                try:
                    await pg.wait_for_function("()=>{const t=document.body.innerText.trim();return t.length>40&&!/^Caricamento/.test(t)}", timeout=12000)
                except Exception: pass
                await pg.wait_for_timeout(1800)
                try:  # niente "Caricamento…" né scheletri: evita di fotografare a metà caricamento
                    await pg.wait_for_function("()=>!/Caricamento/.test(document.body.innerText)&&!document.querySelector('.animate-pulse,.animate-spin')", timeout=10000)
                except Exception: pass
                await pg.add_style_tag(content="*{caret-color:transparent!important;animation:none!important;transition:none!important}")
                nome = re.sub(r"[^a-z0-9]+", "_", path.lower()).strip("_")
                # Attende che la pagina sia ferma: due fotografie consecutive uguali (max 8 tentativi).
                precedente = None
                for _ in range(8):
                    await pg.evaluate(AZZERA_SCROLL)
                    await pg.wait_for_timeout(700)
                    img = await pg.screenshot()
                    if img == precedente: break
                    precedente = img
                (cartella / f"{nome}_{w}x{h}.png").write_bytes(img)
                print(fase, f"{w}x{h}", path, flush=True)
                await ctx.close()
        await b.close()

def _diverse():
    from PIL import Image, ImageChops
    prima, dopo = OUT / "prima", OUT / "dopo"; diverse = []
    for f in sorted(prima.glob("*.png")):
        g = dopo / f.name
        if not g.exists(): diverse.append((f.name, "manca dopo")); continue
        x, y = Image.open(f).convert("RGB"), Image.open(g).convert("RGB")
        if x.size != y.size: diverse.append((f.name, f"dimensioni {x.size}->{y.size}")); continue
        box = ImageChops.difference(x, y).getbbox()
        if box: diverse.append((f.name, f"pixel diversi in {box}"))
    return diverse

def _percorso(nome_file):
    base = nome_file.rsplit("_", 1)[0]
    for path in pagine():
        if re.sub(r"[^a-z0-9]+", "_", path.lower()).strip("_") == base: return path

def confronta():
    """Confronto pixel. Una differenza viene rifotografata fino a 2 volte prima di essere
    dichiarata: separa un caricamento lento da un cambiamento vero."""
    global SOLO
    totale = len(list((OUT / "prima").glob("*.png")))
    diverse = _diverse()
    for tentativo in range(2):
        if not diverse: break
        SOLO = sorted({_percorso(n) for n, _ in diverse if _percorso(n)})
        print(f"Rifotografo {len(SOLO)} pagine (tentativo {tentativo + 1})...")
        asyncio.run(fotografa("dopo"))
        diverse = _diverse()
    print(f"Confrontate {totale} immagini, diverse: {len(diverse)}")
    for n, m in diverse: print(" -", n, m)
    sys.exit(1 if diverse else 0)

if __name__ == "__main__":
    fase = sys.argv[1] if len(sys.argv) > 1 else ""
    if fase in ("prima", "dopo"): asyncio.run(fotografa(fase))
    elif fase == "confronta": confronta()
    else: print(__doc__)
```

### misura.js (misure usate nell'analisi tablet)

```js
(() => {
 const W=innerWidth, de=document.documentElement;
 const out={scrollX: de.scrollWidth>W+1 ? de.scrollWidth : 0};
 const vis=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!='hidden'&&s.display!='none'};
 // touch targets
 const small=[...document.querySelectorAll('button,a[href],[role=button],input:not([type=hidden]),select,[role=combobox],[role=checkbox],[role=switch],[role=tab]')].filter(vis).filter(e=>{const r=e.getBoundingClientRect();return r.height<40||(r.width<40&&r.height<40)});
 out.touchSmall=small.length; out.touchMin=small.length?Math.min(...small.map(e=>Math.round(e.getBoundingClientRect().height))):null; out.touchEs=[...new Set(small.slice(0,6).map(e=>(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,25)+':'+Math.round(e.getBoundingClientRect().height)))];
 // one-letter columns: text elements narrower than 30px with >3 lines
 const narrow=[...document.querySelectorAll('td,th,p,span,div')].filter(e=>e.children.length==0&&vis(e)&&(e.innerText||'').trim().length>6).filter(e=>{const r=e.getBoundingClientRect();const lh=parseFloat(getComputedStyle(e).lineHeight)||16;return r.width<36&&r.height>lh*3});
 out.colonneStrette=narrow.length; out.strEs=narrow.slice(0,3).map(e=>e.innerText.trim().slice(0,20));
 // clipped content to the right
 const clip=[...document.querySelectorAll('td,th,h1,h2,button,span')].filter(e=>vis(e)&&e.children.length==0&&(e.innerText||'').trim()).filter(e=>{const r=e.getBoundingClientRect();return r.right>W+2&&r.left<W});
 out.tagliati=clip.length; out.tagliEs=clip.slice(0,3).map(e=>e.innerText.trim().slice(0,20));
 // overlapping th
 let ov=0; document.querySelectorAll('thead tr').forEach(tr=>{const ths=[...tr.children].filter(vis);ths.forEach(th=>{const sp=th.querySelector('*')||th;const r=document.createRange();r.selectNodeContents(th);const rr=r.getBoundingClientRect();const tr2=th.getBoundingClientRect();if(rr.width>tr2.width+4)ov++;})});
 out.intestSovrapposte=ov;
 const dl=[...document.querySelectorAll('[role=dialog]')].filter(vis).map(e=>e.getBoundingClientRect()).filter(r=>r.right>W+1||r.bottom>innerHeight+1||r.left<-1||r.top<-1);
 out.dialogFuori=dl.length;
 out.tabScorre=[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return /(auto|scroll)/.test(s.overflowX)&&e.scrollWidth>e.clientWidth+4&&e.clientWidth>200}).map(e=>e.scrollWidth-e.clientWidth);
 out.titolo=(document.querySelector('h1')?.innerText||'').slice(0,40);
 out.erroreApp=/Something went wrong|Errore imprevisto|404/.test(document.body.innerText.slice(0,2000));
 return out;})()
```
