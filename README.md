# Scout Orders

A phone app Scouts use to take wreath and popcorn orders door to door. The Scout picks the items
and any donation, the phone's location fills in the address, and payment is recorded as cash,
check or Venmo (with the Venmo QR code shown on screen). Orders are saved on the phone first and
upload to Azure when there's signal, and a leader sees every Scout's orders on the admin report.

- [PLAN.md](PLAN.md): decisions and design
- [infra/README.md](infra/README.md): Azure set-up, access code, admin sign-in

## Layout

```
app/                 the web app (no build step): index.html, admin.html, js/, img/, sw.js
  js/products.js     the catalog: names, descriptions, prices, thumbnails, popcorn 3-for-$25 rule
api/                 Azure Functions: POST /api/orders, GET /api/report/orders (admins only)
infra/main.bicep     Static Web App (Free) + storage account with the orders table
tools/               local dev server, flyer thumbnail cropper, icon generator
.github/workflows/   tests on every PR, deploy on every push to main
```

## Run it locally

```bash
node tools/dev-server.mjs
```

Open http://localhost:8080 and use access code `dev` in ⚙️ Settings. The dev server runs the
real API code against an in-memory table, so orders last until it restarts. The admin report is
at http://localhost:8080/admin.html and needs no sign-in locally.

Run the API tests:

```bash
cd api && npm install && npm test
```

## Changing products or prices

Edit [app/js/products.js](app/js/products.js) and push. Each product's `id` must never change
once orders exist, because reports group by it. Thumbnails go in `app/img/`. If the flyer changes, drop the new
scans in `tools/flyer/` and run `python tools/crop_flyer.py` (you may need to adjust the crop boxes).

Phones pick up a new version the second time the app is opened after a deploy: the first
open fetches it in the background.

## Putting it on a Scout's phone

Open the app's URL in Safari (iPhone) or Chrome (Android), then **Share → Add to Home Screen**
(or **⋮ → Install app**). Open it, go to ⚙️ Settings, and enter the Scout's name, who checks are
payable to, and the access code. Allow location when asked the first time.
