# CORS / 403 on CodePen and embeds — root cause & fix

## What you see

```
Access to image at 'https://apollo.rio.br/erro/403/'
  (redirected from 'https://assets.apollo.rio.br/i/apollo-s.svg')
  from origin 'https://cdpn.io' has been blocked by CORS policy
```

Apollo boot is **OK** (jQuery, GSAP, Lenis). Only the **SVG/icon** request fails.

## Why (two bugs in the old `.htaccess`)

1. **Hotlink rule** on `assets.apollo.rio.br` returns **403** when `Referer` is `https://cdpn.io/...` (not in the allow list).

2. **`ErrorDocument 403 https://apollo.rio.br/erro/403/`** turns that 403 into a **redirect** to the main site. The browser follows it for `<img>` / `fetch()` and expects CORS headers on the **final** URL. `apollo.rio.br/erro/403/` is HTML **without** `Access-Control-Allow-Origin: *` → red CORS noise.

`Header always set Access-Control-Allow-Origin "*"` on the CDN never runs because the response is no longer served from `assets.apollo.rio.br`.

## Fix (server)

| Host | Action |
|------|--------|
| **assets.apollo.rio.br** | Use `assets.apollo.rio.br/.htaccess` from this repo — **no hotlink block**, **no** `ErrorDocument` redirect to apollo.rio.br |
| **cdn.apollo.rio.br** | Use `cdn.apollo.rio.br/.htaccess` — **remove** `ErrorDocument` redirects; hotlink only optional rasters outside `/v1.0.0/` |

Upload both files to each vhost document root, then purge CDN/cache.

## Verify after upload

**Referer only** (may look OK):

```bash
curl.exe -sI -H "Referer: https://cdpn.io/" "https://assets.apollo.rio.br/i/apollo-s.svg"
```

**Referer + Origin** (what the browser sends for `fetch()` and `<img crossorigin>` — must pass):

```bash
curl.exe -sI -H "Referer: https://cdpn.io/" -H "Origin: https://cdpn.io" "https://assets.apollo.rio.br/i/apollo-s.svg"
```

Expect both:

- `HTTP/1.1 200` (not `302` → `location: https://apollo.rio.br/erro/403/`)
- `access-control-allow-origin: *`
- `content-type: image/svg+xml`

If the second curl still returns **302 → erro/403**, the block is not only `.htaccess` — check **Cloudflare** (Firewall Events, Hotlink Protection, custom WAF rules) for `assets.apollo.rio.br` and allow `GET /i/*` with any `Origin`.

## CodePen line 236

If the pen still has a raw tag:

```html
<img src="https://assets.apollo.rio.br/i/apollo-s.svg" crossorigin>
```

it will work **after** the htaccess fix. `cdpn.io/favicon.ico 404` is unrelated (CodePen’s own favicon).

## JS fallback (already in repo)

`core.js` + `icon.v1.0.3.min.js` skip remote icon fetch on non-Apollo origins until CDN htaccess is fixed. Re-upload those after server fix for full icons everywhere.
