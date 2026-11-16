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
