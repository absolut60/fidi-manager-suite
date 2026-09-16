# Immagine header template WhatsApp rifiutata da Meta

## Diagnosi (verificata)

**1. Dove nasce l'URL doppio**

`src/lib/whatsapp-template.functions.ts`, funzione `originPubblico()` (righe 33-50):

```ts
function originPubblico(): string | null {
  const env =
    process.env["APP_PUBLIC_URL"] ??
    process.env["PUBLIC_APP_URL"] ??
    process.env["APP_URL"] ??
    null;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  ...
}
```

e l'uso in `inviaTemplateInApprovazione` (righe 93-113):

```ts
} else if (tpl.header_tipo === "immagine") {
  const media = (tpl.header_media_url ?? "").trim();
  if (!media) return { ok: false, error: "Immagine header mancante" };
  let assoluto = media;
  if (!/^https?:\/\//i.test(media)) {
    const origin = originPubblico();
    ...
    assoluto = `${origin}${media.startsWith("/") ? "" : "/"}${media}`;
  }
  components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [assoluto] } });
}
```

Il controllo `/^https?:\/\//` passa anche se la variabile contiene **più** indirizzi: viene usata tale e quale.

**2. Valore reale della variabile di ambiente (letto adesso sul server)**

```
APP_URL = https://fidi-manager-suite.lovable.app,https://id-preview--c39b9f1b-be3e-4e5c-8b69-3cf1408dd985.lovable.app
```

`APP_PUBLIC_URL`, `PUBLIC_APP_URL`, `SITE_URL`, `VITE_APP_URL` non sono impostate. Quindi è confermato: la variabile contiene **due indirizzi separati da virgola** ed è esattamente quella la causa dell'URL doppio inviato a Meta. L'errore 503 è conseguenza dell'indirizzo malformato, non della route.

**3. Route pubblica immagini**

`src/routes/api/public/email-img/$.ts` — legge dal bucket privato `email-assets`, limitata al prefisso `campagne/`, nessuna autenticazione richiesta (prefisso `/api/public/`). In produzione risponde regolarmente (verificato via richiesta HTTP: 200). In locale non è servita (404), ma è irrilevante per Meta.

**4. Dominio di produzione corretto**

`https://fidi-manager-suite.lovable.app` — è il dominio pubblicato e raggiungibile da Meta. Il secondo (`id-preview--...`) è l'anteprima e non va mai usato per gli URL immagine.

## Intervento proposto (solo dopo approvazione)

In `src/lib/whatsapp-template.functions.ts`, dentro `originPubblico()`:

1. Prendere solo il **primo** valore della variabile quando contiene una lista separata da virgole (`split(",")`, trim, scarto voci vuote).
2. Scartare le voci che puntano all'anteprima (`id-preview--`, `localhost`, `127.0.0.1`), preferendo il primo indirizzo pubblico valido.
3. Rimuovere la barra finale come già fa oggi.

Nessun'altra modifica: bucket, percorso `campagne/whatsapp-template/...`, route pubblica e resto del payload restano invariati.

## Nota

Se dopo la correzione Meta dovesse ancora rifiutare l'immagine, il passo successivo è caricare l'immagine su Meta per ottenere un vero `header_handle` invece di passare un URL; va valutato solo se il problema persiste.
